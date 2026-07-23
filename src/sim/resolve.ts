// resolve(state, orders, rules, seedKey) -> state — the pure tick function.
// Five phases (Deep Dive §4.2): physics → reflexes → orders → markets → dispatch.
// Deterministic: same inputs ⇒ byte-identical output. Conservation asserted.

import {
  AP_BANK_CAP, AP_PER_TICK, BASE_LOAD_EU, BUILD_RADIATOR_EU, ETA_MILLI,
  LEAK_PER_MILLE, ORDER_COST, RAD_FAIL_DIVISOR, RAD_FAIL_TEMP_MILLI, REPAIR_EU,
  T_RAD_MAX, T_RAD_MIN, TEMP_MAX, dissipation, fluxAt, flareActive, phaseAngle,
  roll,
} from "./core.js";
import { evaluate, type Action, type Metrics, type Rule } from "./reflex.js";
import { advanceStage } from "./stages.js";
import { pushLog, type Order, type SimState } from "./types.js";

export class ConservationError extends Error {}

function clone(s: SimState): SimState {
  return JSON.parse(JSON.stringify(s)) as SimState;
}

function applyAction(s: SimState, a: Action, t: number): void {
  if (a.type === "set_throttle") {
    s.structures.collectors.throttle_milli = Math.max(0, Math.min(1000, a.value_milli));
  } else {
    pushLog(s, `[t${t}] ALERT ${a.message}`);
  }
}

export function resolve(prev: SimState, orders: Order[], rules: Rule[], seedKey: number): SimState {
  const s = clone(prev);
  const t = s.tick + 1;

  // ---- Phase 1: physics ----
  const flux = fluxAt(seedKey, t);
  const flare = flareActive(seedKey, t);
  s.phaseAngle = phaseAngle(t);
  s.ap = Math.min(AP_BANK_CAP, s.ap + AP_PER_TICK);

  const D = dissipation(s.structures.radiators.panels, s.structures.radiators.t_rad_milli);
  const cur: Metrics = {
    "system.flux": flux,
    "self.store": s.store_eu,
    "self.temp": s.heatBank_eu,
    "self.margin": D - s.heatBank_eu,
  };
  const prevM = (s.metricsPrev as Metrics) ?? cur;

  // ---- Phase 2: reflexes (execution costs 0 AP) ----
  const { actions, fired } = evaluate(rules, prevM, cur, t, s.ruleMeta);
  for (const a of actions) applyAction(s, a, t);
  for (const id of fired) pushLog(s, `[t${t}] reflex fired: ${id}`);

  // Pre-order baselines: dStore/dBank in the ledger are measured against these,
  // so structural exergy spent below (built) shows up in the books.
  const store0 = s.store_eu;
  const bank0 = s.heatBank_eu;
  let built = 0; // exergy spent on structural orders this tick (builds + repairs)

  // ---- Phase 3: orders (AP-metered, initiative = submission order) ----
  for (const o of orders) {
    const cost = ORDER_COST[o.kind] ?? 1;
    if (s.ap < cost) {
      pushLog(s, `[t${t}] order rejected (AP): ${o.kind}`);
      continue;
    }
    if (o.kind === "set_throttle") {
      s.ap -= cost;
      s.structures.collectors.throttle_milli = Math.max(0, Math.min(1000, o.value_milli));
    } else if (o.kind === "set_radiator_temp") {
      s.ap -= cost;
      s.structures.radiators.t_rad_milli = Math.max(T_RAD_MIN, Math.min(T_RAD_MAX, o.value_milli));
    } else if (o.kind === "build_radiator") {
      if (s.store_eu < BUILD_RADIATOR_EU) {
        pushLog(s, `[t${t}] build_radiator rejected — insufficient exergy (need ${BUILD_RADIATOR_EU}, have ${s.store_eu})`);
        continue; // no AP spent on a rejected build
      }
      s.ap -= cost;
      s.structures.radiators.panels += 1;
      s.store_eu -= BUILD_RADIATOR_EU;
      built += BUILD_RADIATOR_EU;
      pushLog(s, `[t${t}] built radiator panel (#${s.structures.radiators.panels}), −${BUILD_RADIATOR_EU} eu`);
    } else if (o.kind === "repair_systems") {
      if (!s.damaged) {
        pushLog(s, `[t${t}] repair_systems rejected — systems already nominal`);
        continue;
      }
      if (s.heatBank_eu !== 0) {
        pushLog(s, `[t${t}] repair_systems rejected — heat bank must be clear first (${s.heatBank_eu} eu)`);
        continue;
      }
      if (s.store_eu < REPAIR_EU) {
        pushLog(s, `[t${t}] repair_systems rejected — insufficient exergy (need ${REPAIR_EU}, have ${s.store_eu})`);
        continue;
      }
      s.ap -= cost;
      s.store_eu -= REPAIR_EU;
      built += REPAIR_EU;
      s.damaged = false;
      pushLog(s, `[t${t}] systems repaired — collectors back online`);
    }
  }

  // ---- Seeded radiator panel failure (Deep Dive §2: run hot, run fragile) ----
  // Scheduled draws, one per panel: fast-forward and live play agree exactly.
  const tRad = s.structures.radiators.t_rad_milli;
  if (tRad > RAD_FAIL_TEMP_MILLI) {
    const pfPerMille = Math.floor((tRad - RAD_FAIL_TEMP_MILLI) / RAD_FAIL_DIVISOR);
    const before = s.structures.radiators.panels;
    let failed = 0;
    for (let i = 0; i < before; i++) {
      if (roll(seedKey, t, i, 1000) < pfPerMille) failed++;
    }
    if (failed > 0) {
      s.structures.radiators.panels = Math.max(0, before - failed);
      pushLog(s, `[t${t}] radiator panel failure ×${failed} (t_rad ${tRad}) — ${s.structures.radiators.panels} panels remain`);
    }
  }

  // ---- Production + thermodynamics (books must balance) ----
  const throttle = s.damaged ? 0 : s.structures.collectors.throttle_milli;

  const intake = Math.floor((flux * throttle) / 1000);
  const stored = Math.floor((intake * ETA_MILLI) / 1000);
  const heatConv = intake - stored;
  // Leak and upkeep bite the post-build store (spent exergy is gone, not leaking).
  const leak = Math.floor((s.store_eu * LEAK_PER_MILLE) / 1000);
  const afterGainLeak = s.store_eu + stored - leak;
  const baseCost = Math.min(BASE_LOAD_EU, Math.max(0, afterGainLeak));
  s.store_eu = afterGainLeak - baseCost;

  const heatProduced = heatConv + leak + baseCost;
  const D2 = dissipation(s.structures.radiators.panels, s.structures.radiators.t_rad_milli);
  const totalHeat = bank0 + heatProduced;
  const radiated = Math.min(D2, totalHeat);
  s.heatBank_eu = totalHeat - radiated;

  if (s.heatBank_eu > TEMP_MAX && !s.damaged) {
    s.damaged = true;
    s.structures.collectors.throttle_milli = 0;
    pushLog(s, `[t${t}] THERMAL RUNAWAY — systems damaged, collectors offline`);
  }
  // Repair is no longer automatic — it is a deliberate repair_systems order.

  // ---- Conservation invariant (anti-cheat is physics, GDD §12.0) ----
  const dStore = s.store_eu - store0;
  const dBank = s.heatBank_eu - bank0;
  if (intake !== dStore + radiated + dBank + built) {
    throw new ConservationError(
      `t${t}: intake=${intake} ≠ dStore=${dStore} + radiated=${radiated} + dBank=${dBank} + built=${built}`,
    );
  }

  s.ledger = {
    tick: t,
    intake_eu: intake,
    dStore_eu: dStore,
    heatRadiated_eu: radiated,
    dHeatBank_eu: dBank,
    built_eu: built,
    flare,
  };
  if (flare) pushLog(s, `[t${t}] stellar flare (flux x3)`);

  // ---- Stage engine: Survive's sustained-budget gate (Deep Dive §14) ----
  const stageStep = advanceStage(s.stage, s.positiveStreak, dStore, t);
  s.stage = stageStep.stage;
  s.positiveStreak = stageStep.positiveStreak;
  if (stageStep.completedLog) pushLog(s, stageStep.completedLog);

  // ---- Phases 4–5: markets, dispatch — M2 ----

  s.metricsPrev = cur;
  s.tick = t;
  return s;
}

/** Reflex EDITS cost AP (authorship is the gameplay); returns false if unaffordable. */
export function chargeReflexEdit(s: SimState, cost: number): boolean {
  if (s.ap < cost) return false;
  s.ap -= cost;
  return true;
}
