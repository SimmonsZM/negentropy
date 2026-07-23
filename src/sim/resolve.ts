// resolve(state, orders, rules, seedKey, sys, inboxDue) -> state — the pure tick function.
// Five phases (Deep Dive §4.2): physics → reflexes → orders → markets → dispatch,
// plus the trial phase (M2b): the Migration runs a mirror of you through the
// same physics, same events, driven by your frozen reflexes. Deterministic:
// same inputs ⇒ byte-identical output. Conservation asserted for the player;
// the mirror is bookkept separately (it runs on the trial substrate).

import {
  AP_BANK_CAP, AP_PER_TICK, BASE_LOAD_EU, BEACON_INTERVAL_TICKS, BUILD_RADIATOR_EU, ETA_MILLI,
  LEAK_PER_MILLE, MIGRATION_AP, MIGRATION_BAR, MIGRATION_COOLDOWN, MIGRATION_EU, MIGRATION_WINDOW,
  HAIL_MAX_CHARS, ORDER_COST, RAD_FAIL_DIVISOR, RAD_FAIL_TEMP_MILLI, REPAIR_EU, SIGNALS_MAX, TRIAL_EVENTS,
  T_RAD_MAX, T_RAD_MIN, TEMP_MAX, dissipation, fluxAt, flareActive, mix, phaseAngle,
  roll,
} from "./core.js";
import { evaluate, type Action, type Metrics, type Rule } from "./reflex.js";
import { advanceStage } from "./stages.js";
import { getSystem, laneLag, neighborsOf, type SystemDef } from "./starmap.js";
import {
  pushLog, type Envelope, type MirrorEnt, type Order, type SimState, type TrialEvent,
} from "./types.js";

export class ConservationError extends Error {}

function clone<T>(s: T): T {
  return JSON.parse(JSON.stringify(s)) as T;
}

// ---- Shared thermodynamic core: the ONE set of formulas both the player and
// the mirror run. Extracted intact from M1.5 (the behavioral pin guards it). ----

interface TrialMods {
  fluxMult_milli: number; // flare_echo: 2000
  etaDelta_milli: number; // impurity: -140
  panelsOffline: number; // panel_fault: 1
}

const CALM: TrialMods = { fluxMult_milli: 1000, etaDelta_milli: 0, panelsOffline: 0 };

interface ThermoIn {
  store_eu: number;
  heatBank_eu: number;
  throttle_milli: number; // effective (0 if damaged)
  panels: number;
  t_rad_milli: number;
}

interface ThermoOut {
  store_eu: number;
  heatBank_eu: number;
  intake_eu: number;
  radiated_eu: number;
  overheatedNow: boolean;
}

function thermoTick(inp: ThermoIn, flux: number, mods: TrialMods, alreadyDamaged: boolean): ThermoOut {
  const effFlux = Math.floor((flux * mods.fluxMult_milli) / 1000);
  const eta = Math.max(0, Math.min(1000, ETA_MILLI + mods.etaDelta_milli));
  const effPanels = Math.max(0, inp.panels - mods.panelsOffline);

  const intake = Math.floor((effFlux * inp.throttle_milli) / 1000);
  const stored = Math.floor((intake * eta) / 1000);
  const heatConv = intake - stored;
  const leak = Math.floor((inp.store_eu * LEAK_PER_MILLE) / 1000);
  const afterGainLeak = inp.store_eu + stored - leak;
  const baseCost = Math.min(BASE_LOAD_EU, Math.max(0, afterGainLeak));
  const newStore = afterGainLeak - baseCost;

  const heatProduced = heatConv + leak + baseCost;
  const D = dissipation(effPanels, inp.t_rad_milli);
  const totalHeat = inp.heatBank_eu + heatProduced;
  const radiated = Math.min(D, totalHeat);
  const newBank = totalHeat - radiated;

  return {
    store_eu: newStore,
    heatBank_eu: newBank,
    intake_eu: intake,
    radiated_eu: radiated,
    overheatedNow: newBank > TEMP_MAX && !alreadyDamaged,
  };
}

function applyAction(s: SimState, a: Action, t: number): void {
  if (a.type === "set_throttle") {
    s.structures.collectors.throttle_milli = Math.max(0, Math.min(1000, a.value_milli));
  } else {
    pushLog(s, `[t${t}] ALERT ${a.message}`);
  }
}

function trialModsFor(events: TrialEvent[], t: number): TrialMods {
  const mods = { ...CALM };
  for (const ev of events) {
    if (ev.tick !== t) continue;
    if (ev.kind === "flare_echo") mods.fluxMult_milli = 2000;
    else if (ev.kind === "impurity") mods.etaDelta_milli = -140;
    else mods.panelsOffline = mods.panelsOffline + 1;
  }
  return mods;
}

const EVENT_NAMES: Record<TrialEvent["kind"], string> = {
  flare_echo: "flare echo (flux x2)",
  impurity: "impurity slug (conversion fouled)",
  panel_fault: "radiator micro-fault (one panel dark)",
};

/** sys defaults to wei-9-home so all pre-M2a call sites (and its 800-tick
 * audited history) resolve with byte-identical physics. inboxDue is this
 * tick's light-lagged mail, selected by the DO layer (deliver_at <= t). */
export function resolve(
  prev: SimState,
  orders: Order[],
  rules: Rule[],
  seedKey: number,
  sys: SystemDef = getSystem("wei-9-home")!,
  inboxDue: Envelope[] = [],
): SimState {
  const s = clone(prev);
  const t = s.tick + 1;

  // ---- Phase 1: physics (per-system parameters; trial events modify flows) ----
  const flux = fluxAt(seedKey, t, sys.base_flux_eu, sys.flare_per_mille);
  const flare = flareActive(seedKey, t, sys.flare_per_mille);
  s.phaseAngle = phaseAngle(t);
  s.ap = Math.min(AP_BANK_CAP, s.ap + AP_PER_TICK);

  const trialActive = !!s.trial && t > s.trial.startedTick && t <= s.trial.endTick;
  const mods = trialActive ? trialModsFor(s.trial!.events, t) : CALM;
  if (trialActive) {
    for (const ev of s.trial!.events) {
      if (ev.tick === t) pushLog(s, `[t${t}] TRIAL EVENT — ${EVENT_NAMES[ev.kind]}`);
    }
  }

  const D0 = dissipation(s.structures.radiators.panels, s.structures.radiators.t_rad_milli);
  const cur: Metrics = {
    "system.flux": flux,
    "self.store": s.store_eu,
    "self.temp": s.heatBank_eu,
    "self.margin": D0 - s.heatBank_eu,
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
  let built = 0; // exergy spent on structural orders this tick (builds + repairs + uploads)
  let decodedNew = false; // a foreign beacon was decoded this tick (Connect gate)
  let beginTrial = false;
  const hails: Envelope[] = [];
  let justAscended = false; // the threshold tick belongs to neither climb

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
    } else if (o.kind === "decode_signal") {
      const target = s.receivedSignals.find((sig) => !sig.decoded && !s.decodedFrom.includes(sig.from));
      if (!target) {
        pushLog(s, `[t${t}] decode_signal rejected — no undecoded foreign signals held`);
        continue; // no AP spent when there is nothing to decode
      }
      s.ap -= cost;
      target.decoded = true;
      s.decodedFrom.push(target.from);
      decodedNew = true;
      pushLog(s, `[t${t}] SIGNAL DECODED — ${target.from} (emitted t${target.emitted_t}): "${target.payload}"`);
    } else if (o.kind === "begin_migration") {
      if (s.realm !== "embodied") {
        pushLog(s, `[t${t}] begin_migration rejected — the Migration is already behind you`);
        continue;
      }
      if (s.stage !== "control") {
        pushLog(s, `[t${t}] begin_migration rejected — reach Control (3/9) first; the climb precedes the leap`);
        continue;
      }
      if (s.trial) {
        pushLog(s, `[t${t}] begin_migration rejected — a trial is already underway`);
        continue;
      }
      if (t < s.migrationCooldownUntil) {
        pushLog(s, `[t${t}] begin_migration rejected — the sky is not ready (cooldown until t${s.migrationCooldownUntil})`);
        continue;
      }
      if (s.ap < MIGRATION_AP) {
        pushLog(s, `[t${t}] begin_migration rejected — a full tick's AP is required (${MIGRATION_AP})`);
        continue;
      }
      if (s.store_eu < MIGRATION_EU) {
        pushLog(s, `[t${t}] begin_migration rejected — the upload costs ${MIGRATION_EU} eu (have ${s.store_eu})`);
        continue;
      }
      s.ap -= MIGRATION_AP;
      s.store_eu -= MIGRATION_EU;
      built += MIGRATION_EU;
      beginTrial = true;
      pushLog(s, `[t${t}] THE MIGRATION BEGINS — the copy wakes with your reflexes and your doubts`);
    } else if (o.kind === "send_hail") {
      const lag = laneLag(sys.id, o.to);
      if (lag === undefined) {
        pushLog(s, `[t${t}] send_hail rejected — no lane from ${sys.id} to ${o.to}`);
        continue;
      }
      const text = (o.text ?? "").slice(0, HAIL_MAX_CHARS).trim();
      if (!text) {
        pushLog(s, `[t${t}] send_hail rejected — an empty hail is just heat`);
        continue;
      }
      s.ap -= cost;
      hails.push({ from: sys.id, to: o.to, kind: "hail", emitted_t: t, deliver_at: t + lag, payload: text });
      pushLog(s, `[t${t}] hail sent toward ${o.to} — arrives with the light at t${t + lag}`);
    }
  }

  // ---- Seeded radiator panel failure (Deep Dive §2: run hot, run fragile) ----
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
      pushLog(s, `[t${t}] radiator panel failure at run-temp ${tRad} — ${s.structures.radiators.panels} panels remain`);
    }
  }

  // ---- Production + thermodynamics (books must balance) ----
  const out = thermoTick(
    {
      store_eu: s.store_eu,
      heatBank_eu: bank0,
      throttle_milli: s.damaged ? 0 : s.structures.collectors.throttle_milli,
      panels: s.structures.radiators.panels,
      t_rad_milli: s.structures.radiators.t_rad_milli,
    },
    flux,
    mods,
    s.damaged,
  );
  s.store_eu = out.store_eu;
  s.heatBank_eu = out.heatBank_eu;
  if (out.overheatedNow) {
    s.damaged = true;
    s.structures.collectors.throttle_milli = 0;
    pushLog(s, `[t${t}] THERMAL RUNAWAY — systems damaged, collectors offline`);
  }
  // Repair is deliberate — a repair_systems order, never automatic.

  // ---- Conservation invariant (anti-cheat is physics, GDD §12.0) ----
  const dStore = s.store_eu - store0;
  const dBank = s.heatBank_eu - bank0;
  if (out.intake_eu !== dStore + out.radiated_eu + dBank + built) {
    throw new ConservationError(
      `t${t}: intake=${out.intake_eu} ≠ dStore=${dStore} + radiated=${out.radiated_eu} + dBank=${dBank} + built=${built}`,
    );
  }

  s.ledger = {
    tick: t,
    intake_eu: out.intake_eu,
    dStore_eu: dStore,
    heatRadiated_eu: out.radiated_eu,
    dHeatBank_eu: dBank,
    built_eu: built,
    flare,
  };
  if (flare) pushLog(s, `[t${t}] stellar flare (flux x3)`);

  // ---- Trial phase (M2b): the mirror walks the same sky ----
  if (beginTrial) {
    const trialSeed = mix(seedKey, t);
    const events: TrialEvent[] = [];
    for (let i = 0; i < TRIAL_EVENTS; i++) {
      const evTick = t + 1 + roll(trialSeed, t, 0xe0 + i, MIGRATION_WINDOW);
      const kindRoll = roll(trialSeed, t, 0xf0 + i, 3);
      events.push({ tick: evTick, kind: kindRoll === 0 ? "flare_echo" : kindRoll === 1 ? "impurity" : "panel_fault" });
    }
    events.sort((a, b) => a.tick - b.tick || (a.kind < b.kind ? -1 : 1));
    s.trial = {
      kind: "migration",
      startedTick: t,
      endTick: t + MIGRATION_WINDOW,
      events,
      rulesFrozen: clone(rules) as unknown[],
      mirror: {
        store_eu: s.store_eu,
        heatBank_eu: s.heatBank_eu,
        structures: clone(s.structures),
        damaged: s.damaged,
        metricsPrev: {},
        ruleMeta: {},
        wealth: 0,
      },
      playerWealth: 0,
    };
  } else if (trialActive && s.trial) {
    const tr = s.trial;
    const m = tr.mirror;

    // The mirror runs YOUR frozen reflexes over ITS state — no orders, ever.
    const mD = dissipation(m.structures.radiators.panels, m.structures.radiators.t_rad_milli);
    const mCur: Metrics = {
      "system.flux": flux,
      "self.store": m.store_eu,
      "self.temp": m.heatBank_eu,
      "self.margin": mD - m.heatBank_eu,
    };
    const mPrev = (Object.keys(m.metricsPrev).length ? m.metricsPrev : mCur) as Metrics;
    const mEval = evaluate(tr.rulesFrozen as Rule[], mPrev, mCur, t, m.ruleMeta);
    for (const a of mEval.actions) {
      if (a.type === "set_throttle") {
        m.structures.collectors.throttle_milli = Math.max(0, Math.min(1000, a.value_milli));
      }
    }

    const mBefore = m.store_eu;
    const mOut = thermoTick(
      {
        store_eu: m.store_eu,
        heatBank_eu: m.heatBank_eu,
        throttle_milli: m.damaged ? 0 : m.structures.collectors.throttle_milli,
        panels: m.structures.radiators.panels,
        t_rad_milli: m.structures.radiators.t_rad_milli,
      },
      flux,
      mods,
      m.damaged,
    );
    m.store_eu = mOut.store_eu;
    m.heatBank_eu = mOut.heatBank_eu;
    if (mOut.overheatedNow) {
      m.damaged = true;
      m.structures.collectors.throttle_milli = 0;
      pushLog(s, `[t${t}] the copy overheats — your reflexes, your fate, its hull`);
    }
    m.metricsPrev = mCur;
    m.wealth += m.store_eu - mBefore;
    tr.playerWealth += dStore + built;

    if (t === tr.endTick) {
      const passed =
        tr.playerWealth > m.wealth &&
        tr.playerWealth >= MIGRATION_BAR &&
        s.store_eu > 0 &&
        !s.damaged;
      pushLog(s, `[t${t}] MIGRATION VERDICT — you: ${tr.playerWealth} eu · the copy: ${m.wealth} eu · bar: ${MIGRATION_BAR}`);
      if (passed) {
        s.realm = "foundation";
        s.stage = "survive";
        s.positiveStreak = 0;
        justAscended = true;
        pushLog(s, `[t${t}] BREAKTHROUGH — FOUNDATION. Mirror Sight opens: what ran you is now yours to author.`);
        pushLog(s, `[t${t}] Foundation — Survive (1/9). The climb begins again, higher.`);
      } else {
        s.migrationCooldownUntil = t + MIGRATION_COOLDOWN;
        const why =
          s.damaged ? "you ended damaged" :
          s.store_eu <= 0 ? "your store ran dry" :
          tr.playerWealth < MIGRATION_BAR ? "the bar was not met" :
          "the copy matched you";
        pushLog(s, `[t${t}] THE MIGRATION FAILS — ${why}. The sky closes until t${s.migrationCooldownUntil}.`);
      }
      s.trial = undefined;
    }
  }

  // ---- Stage engine: the nine-fold climb's live gates (Deep Dive §14) ----
  if (!justAscended) {
    const stageStep = advanceStage(s.stage, s.positiveStreak, { dStore, decodedNew }, t);
    s.stage = stageStep.stage;
    s.positiveStreak = stageStep.positiveStreak;
    if (stageStep.completedLog) pushLog(s, stageStep.completedLog);
  }

  // ---- Phase 4: markets — M2c ----

  // ---- Phase 5: dispatch — light-lagged mail in, beacon pulses out (M2a) ----
  for (const env of inboxDue) {
    s.receivedSignals.push({
      from: env.from,
      emitted_t: env.emitted_t,
      received_t: t,
      payload: env.payload,
      decoded: env.kind === "hail", // a mind's hail is already in shared protocol
      kind: env.kind,
    });
    pushLog(s, env.kind === "hail"
      ? `[t${t}] HAIL from ${env.from} (${t - env.emitted_t} ticks in flight): "${env.payload}"`
      : `[t${t}] signal received from ${env.from} (emitted t${env.emitted_t}, ${t - env.emitted_t} ticks in flight)`);
  }
  if (s.receivedSignals.length > SIGNALS_MAX) {
    s.receivedSignals.splice(0, s.receivedSignals.length - SIGNALS_MAX);
  }

  const emissions: Envelope[] = [];
  if (sys.beacon && t % BEACON_INTERVAL_TICKS === 0) {
    for (const n of neighborsOf(sys.id)) {
      emissions.push({
        from: sys.id,
        to: n.sys.id,
        kind: "beacon",
        emitted_t: t,
        deliver_at: t + n.lag_ticks,
        payload: `…${sys.name} beacon, cycle ${Math.floor(t / BEACON_INTERVAL_TICKS)}: the gradient endures…`,
      });
    }
    pushLog(s, `[t${t}] ancient beacon pulse — ${emissions.length} lanes`);
  }
  s.outbox = [...hails, ...emissions];

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
