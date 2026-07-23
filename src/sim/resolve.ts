// resolve(state, orders, rules, seedKey, sys, inboxDue) -> state — the pure tick function.
// Five phases (Deep Dive §4.2): physics → reflexes → orders → markets → dispatch,
// plus the trial phase (M2b): the Migration runs a mirror of you through the
// same physics, same events, driven by your frozen reflexes. Deterministic:
// same inputs ⇒ byte-identical output. Conservation asserted for the player;
// the mirror is bookkept separately (it runs on the trial substrate).

import {
  AP_BANK_CAP, AP_PER_TICK, BASE_LOAD_EU, BEACON_INTERVAL_TICKS, BUILD_RADIATOR_EU, ETA_MILLI,
  LEAK_PER_MILLE, MIGRATION_AP, MIGRATION_BAR, MIGRATION_COOLDOWN, MIGRATION_EU, MIGRATION_WINDOW,
  BOOK_MAX_OPEN, BOOK_QTY_MAX, BUILD_RADIATOR_ALLOY, BURN_FLUX_MULT_MILLI, BURN_ISO_COST, CARGO_MAX_PER_SHIPMENT,
  FLARE_RING_MAX, FORECAST_MAX_ACTIVE, FORECAST_PTS, FORECAST_WINDOW_MAX, HAIL_MAX_CHARS, ISO_YIELD_DIV,
  BARGAIN_GRANT_EU, BARGAIN_LEVY_EU, BARGAIN_LEVY_TICKS,
  HARMONIZE_COOLDOWN, HARMONIZE_EVENTS, HARMONIZE_WINDOW, SANCTIFY_COOLDOWN,
  WHISPER_DELAY_MIN, WHISPER_DELAY_SPAN, WHISPER_EVENTS, WHISPER_WINDOW, ORDER_COST, PRICE_MILLI_MAX, PRICE_MILLI_MIN, REFINE_ALLOY_BASE, REFINE_EU,
  forecastScore, RAD_FAIL_DIVISOR, RAD_FAIL_TEMP_MILLI, REPAIR_EU, SIGNALS_MAX, TRIAL_EVENTS,
  T_RAD_MAX, T_RAD_MIN, TEMP_MAX, dissipation, fluxAt, flareActive, mix, phaseAngle,
  roll,
} from "./core.js";
import { evaluate, type Action, type Metrics, type ReflexEvent, type Rule } from "./reflex.js";
import { achieveBarMet, advanceStage, stageIndex, understandGateMet, TURBULENCE_RECOVERY } from "./stages.js";
import { getSystem, laneLag, neighborsOf, type SystemDef } from "./starmap.js";
import {
  pushLog, type BookOrder, type Envelope, type FillRequest, type MirrorEnt, type Order, type SimState, type TrialEvent,
} from "./types.js";

export class ConservationError extends Error {}

function clone<T>(s: T): T {
  return JSON.parse(JSON.stringify(s)) as T;
}

function raiseEvent(s: SimState, e: ReflexEvent): void {
  if (!s.reflexEvents.includes(e)) s.reflexEvents.push(e);
  if (s.reflexEvents.length > 16) s.reflexEvents.splice(0, s.reflexEvents.length - 16);
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

/** Reflex actions become synthetic ORDERS: same handlers, same rejections,
 * same logs, zero AP. Automation obeys the physics verbatim (M2h). */
function actionToOrder(a: Action): Order | null {
  switch (a.type) {
    case "set_throttle": return { kind: "set_throttle", target: "collectors", value_milli: a.value_milli };
    case "set_radiator_temp": return { kind: "set_radiator_temp", value_milli: a.value_milli };
    case "repair_systems": return { kind: "repair_systems" };
    case "burn_isotopes": return { kind: "burn_isotopes" };
    case "place_order": return { kind: "place_order", side: a.side, good: a.good, qty: a.qty, price_milli: a.price_milli };
    case "alert": return null;
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

  if (flare) {
    s.flareRing.push(t);
    if (s.flareRing.length > FLARE_RING_MAX) s.flareRing.splice(0, s.flareRing.length - FLARE_RING_MAX);
  }
  for (const f of s.forecasts) {
    if (f.outcome !== undefined || f.resolves_t !== t) continue;
    const outcome = s.flareRing.some((ft) => ft > f.registered_t && ft <= f.resolves_t);
    f.outcome = outcome;
    f.score_milli = forecastScore(f.p_milli, outcome);
    s.calibration.n += 1;
    s.calibration.total_milli += f.score_milli;
    raiseEvent(s, outcome ? "forecast_resolved.true" : "forecast_resolved.false");
    pushLog(s, `[t${t}] FORECAST RESOLVED — "flare within ${f.claim.window}" @ ${f.p_milli / 10}%: ` +
      `${outcome ? "TRUE" : "FALSE"} · ${f.score_milli >= 0 ? "+" : ""}${f.score_milli} pts · ` +
      `calibration ${s.calibration.total_milli >= 0 ? "+" : ""}${s.calibration.total_milli} over ${s.calibration.n}`);
  }
  if (s.forecasts.length > 32) s.forecasts.splice(0, s.forecasts.length - 32); // keep recent history only

  // ---- Sanctify: the Whisper's window (M2i) ----
  let sanctifyPassed = false;
  const whisperOpen = !!s.sanctify && s.sanctify.open && t >= s.sanctify.whisperAt && t <= s.sanctify.windowEnd;
  if (s.sanctify && s.sanctify.open && t === s.sanctify.whisperAt) {
    pushLog(s, `[t${t}] THE HOLLOW WHISPERS — ${BARGAIN_GRANT_EU} eu, freely given. One order. The window closes at t${s.sanctify.windowEnd}.`);
  }
  if (s.sanctify && s.sanctify.open && t > s.sanctify.windowEnd) {
    // Silence was the answer. The storms were survived — or they were not.
    if (s.store_eu > 0 && !s.damaged) {
      sanctifyPassed = true;
      pushLog(s, `[t${t}] the Whisper fades unanswered — the Hollow finds nothing in you to hold`);
    } else {
      s.sanctifyCooldownUntil = t + SANCTIFY_COOLDOWN;
      pushLog(s, `[t${t}] the Whisper fades — but the storms broke you. The Hollow will return after t${s.sanctifyCooldownUntil}.`);
    }
    s.sanctify = undefined;
  }

  const trialActive = !!s.trial && t > s.trial.startedTick && t <= s.trial.endTick;
  const harmActive = !!s.harmonize && t > s.harmonize.startedTick && t <= s.harmonize.endTick;
  const mods = trialActive ? trialModsFor(s.trial!.events, t)
    : harmActive ? trialModsFor(s.harmonize!.events, t)
    : whisperOpen ? trialModsFor(s.sanctify!.events, t)
    : CALM;
  if (whisperOpen) {
    for (const ev of s.sanctify!.events) {
      if (ev.tick === t) pushLog(s, `[t${t}] THE STORM IN THE WHISPER — ${EVENT_NAMES[ev.kind]}`);
    }
  }
  if (trialActive) {
    for (const ev of s.trial!.events) {
      if (ev.tick === t) pushLog(s, `[t${t}] TRIAL EVENT — ${EVENT_NAMES[ev.kind]}`);
    }
  }
  if (harmActive) {
    for (const ev of s.harmonize!.events) {
      if (ev.tick === t) pushLog(s, `[t${t}] HARMONIZE EVENT — ${EVENT_NAMES[ev.kind]}`);
    }
    if (orders.length > 0 && !s.harmonize!.violated) {
      s.harmonize!.violated = true;
      pushLog(s, `[t${t}] HARMONIZE VOIDED — a hand touched the helm`);
    }
  }

  const D0 = dissipation(s.structures.radiators.panels, s.structures.radiators.t_rad_milli);
  const cur: Metrics = {
    "system.flux": flux,
    "self.store": s.store_eu,
    "self.temp": s.heatBank_eu,
    "self.margin": D0 - s.heatBank_eu,
    "self.panels": s.structures.radiators.panels,
    "self.damaged": s.damaged ? 1 : 0,
    "self.ap": s.ap,
    "self.isotopes": s.stock.isotopes,
    "self.alloy": s.stock.alloy,
    "self.committed": s.committedEu,
  };
  const prevM = (s.metricsPrev as Metrics) ?? cur;
  const eventsNow: ReflexEvent[] = s.reflexEvents;
  s.reflexEvents = []; // consumed; phases 1/4/5 refill for the future

  // ---- Phase 2: reflexes (execution costs 0 AP; resources still real) ----
  const { actions, fired } = evaluate(rules, prevM, cur, t, s.ruleMeta, eventsNow);
  const synthetic: Order[] = [];
  for (const a of actions) {
    if (a.type === "alert") { pushLog(s, `[t${t}] ALERT ${a.message}`); continue; }
    const o = actionToOrder(a);
    if (o) synthetic.push(o);
  }
  for (const id of fired) pushLog(s, `[t${t}] reflex fired: ${id}`);

  // Pre-order baselines: dStore/dBank in the ledger are measured against these,
  // so structural exergy spent below (built) shows up in the books.
  const store0 = s.store_eu;
  const bank0 = s.heatBank_eu;
  let built = 0; // exergy spent on structural orders this tick (builds + repairs + uploads)
  let decodedNew = false; // a foreign beacon was decoded this tick (Connect gate)
  let beginTrial = false;
  let transmitted = 0; // eu beamed out this tick (fills' escrow legs)
  let euIn = 0; // eu that arrived via fills — lands AFTER this tick's books close
  const hails: Envelope[] = [];
  const spendable = () => s.store_eu - s.committedEu;
  let gotHailNew = false;
  let justAscended = false; // the threshold tick belongs to neither climb

  // ---- Phase 3: orders. Reflex-born orders run first, at 0 AP; manual
  // orders follow, override, and are the ONLY ones that count as verbs. ----
  const queue: Array<{ o: Order; free: boolean }> = [
    ...synthetic.map((o) => ({ o, free: true })),
    ...orders.map((o) => ({ o, free: false })),
  ];
  for (const { o, free } of queue) {
    const cost = free ? 0 : ORDER_COST[o.kind] ?? 1;
    if (s.ap < cost) {
      pushLog(s, `[t${t}] order rejected (AP): ${o.kind}`);
      continue;
    }
    if (!free && o.kind !== "noop" && !s.verbsUsed.includes(o.kind)) s.verbsUsed.push(o.kind);
    if (o.kind === "set_throttle") {
      s.ap -= cost;
      s.structures.collectors.throttle_milli = Math.max(0, Math.min(1000, o.value_milli));
    } else if (o.kind === "set_radiator_temp") {
      s.ap -= cost;
      s.structures.radiators.t_rad_milli = Math.max(T_RAD_MIN, Math.min(T_RAD_MAX, o.value_milli));
    } else if (o.kind === "build_radiator") {
      if (spendable() < BUILD_RADIATOR_EU || s.stock.alloy < BUILD_RADIATOR_ALLOY) {
        pushLog(s, `[t${t}] build_radiator rejected — needs ${BUILD_RADIATOR_EU} eu + ${BUILD_RADIATOR_ALLOY} alloy (have ${s.store_eu} eu, ${s.stock.alloy} alloy)`);
        continue; // no AP spent on a rejected build
      }
      s.ap -= cost;
      s.structures.radiators.panels += 1;
      s.store_eu -= BUILD_RADIATOR_EU;
      s.stock.alloy -= BUILD_RADIATOR_ALLOY;
      built += BUILD_RADIATOR_EU;
      pushLog(s, `[t${t}] built radiator panel (#${s.structures.radiators.panels}) — ${BUILD_RADIATOR_EU} eu + ${BUILD_RADIATOR_ALLOY} alloy`);
    } else if (o.kind === "repair_systems") {
      if (!s.damaged) {
        pushLog(s, `[t${t}] repair_systems rejected — systems already nominal`);
        continue;
      }
      if (s.heatBank_eu !== 0) {
        pushLog(s, `[t${t}] repair_systems rejected — heat bank must be clear first (${s.heatBank_eu} eu)`);
        continue;
      }
      if (spendable() < REPAIR_EU) {
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
      if (stageIndex(s.stage) < stageIndex("achieve")) {
        pushLog(s, `[t${t}] begin_migration rejected — reach Achieve (5/9) first; the climb precedes the leap`);
        continue;
      }
      if (s.harmonize) {
        pushLog(s, `[t${t}] begin_migration rejected — one crucible at a time`);
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
      if (spendable() < MIGRATION_EU) {
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
      s.sentHail = true;
      hails.push({ from: sys.id, to: o.to, kind: "hail", emitted_t: t, deliver_at: t + lag, payload: text });
      pushLog(s, `[t${t}] hail sent toward ${o.to} — arrives with the light at t${t + lag}`);
    } else if (o.kind === "register_forecast") {
      if (s.realm === "embodied") {
        pushLog(s, `[t${t}] register_forecast rejected — Mirror Sight required (the Migration opens the registry)`);
        continue;
      }
      if (s.turbulence) {
        pushLog(s, `[t${t}] register_forecast rejected — a shaken heart cannot see clearly (settle first)`);
        continue;
      }
      if (!(o.p_milli in FORECAST_PTS)) {
        pushLog(s, `[t${t}] register_forecast rejected — probability must be one of 5%..95% in 5% steps`);
        continue;
      }
      const w = o.claim?.window ?? 0;
      if (o.claim?.type !== "flare_within" || w < 1 || w > FORECAST_WINDOW_MAX) {
        pushLog(s, `[t${t}] register_forecast rejected — claim must be flare_within 1..${FORECAST_WINDOW_MAX}`);
        continue;
      }
      const active = s.forecasts.filter((f) => f.outcome === undefined).length;
      if (active >= FORECAST_MAX_ACTIVE) {
        pushLog(s, `[t${t}] register_forecast rejected — ${FORECAST_MAX_ACTIVE} claims already open`);
        continue;
      }
      s.ap -= cost;
      s.forecastSeq += 1;
      s.forecasts.push({
        id: s.forecastSeq,
        claim: { type: "flare_within", window: w },
        p_milli: o.p_milli,
        registered_t: t,
        resolves_t: t + w,
      });
      pushLog(s, `[t${t}] FORECAST REGISTERED #${s.forecastSeq} — "flare within ${w}" @ ${o.p_milli / 10}% · resolves t${t + w}`);
    } else if (o.kind === "begin_harmonize") {
      if (s.stage !== "harmonize") {
        pushLog(s, `[t${t}] begin_harmonize rejected — the crucible opens at Harmonize (7/9)`);
        continue;
      }
      if (s.trial || s.harmonize) {
        pushLog(s, `[t${t}] begin_harmonize rejected — one crucible at a time`);
        continue;
      }
      if (t < s.harmonizeCooldownUntil) {
        pushLog(s, `[t${t}] begin_harmonize rejected — cooldown until t${s.harmonizeCooldownUntil}`);
        continue;
      }
      s.ap -= cost;
      const hSeed = mix(seedKey, t ^ 0x4a4a);
      const hEvents: TrialEvent[] = [];
      for (let i = 0; i < HARMONIZE_EVENTS; i++) {
        const evTick = t + 1 + roll(hSeed, t, 0xa0 + i, HARMONIZE_WINDOW);
        const kindRoll = roll(hSeed, t, 0xb0 + i, 3);
        hEvents.push({ tick: evTick, kind: kindRoll === 0 ? "flare_echo" : kindRoll === 1 ? "impurity" : "panel_fault" });
      }
      hEvents.sort((a, b) => a.tick - b.tick || (a.kind < b.kind ? -1 : 1));
      s.harmonize = { startedTick: t, endTick: t + HARMONIZE_WINDOW, events: hEvents, violated: false, netStore: 0 };
      pushLog(s, `[t${t}] HARMONIZE BEGINS — hands off the helm; let the reflexes hold for ${HARMONIZE_WINDOW} ticks`);
    } else if (o.kind === "accept_bargain") {
      if (!whisperOpen) {
        pushLog(s, `[t${t}] accept_bargain rejected — nothing is being offered`);
        continue;
      }
      s.sanctify = undefined; // the window closes on your answer
      s.bargainDebtUntil = t + BARGAIN_LEVY_TICKS;
      s.sanctifyCooldownUntil = t + SANCTIFY_COOLDOWN;
      euIn += BARGAIN_GRANT_EU; // next-books money, like everything owed
      if (!s.turbulence) {
        s.turbulence = { since: t, recovery: 0 };
      }
      pushLog(s, `[t${t}] THE BARGAIN IS STRUCK — ${BARGAIN_GRANT_EU} eu from nowhere. The debt begins. DAO-HEART TURBULENCE.`);
    } else if (o.kind === "deposit_vault") {
      const iso = Math.max(0, Math.floor(o.isotopes ?? 0));
      const al = Math.max(0, Math.floor(o.alloy ?? 0));
      if (iso + al === 0) { pushLog(s, `[t${t}] deposit_vault rejected — empty hands`); continue; }
      if (s.stock.isotopes < iso || s.stock.alloy < al) {
        pushLog(s, `[t${t}] deposit_vault rejected — exceeds stock (have ${s.stock.isotopes} iso, ${s.stock.alloy} alloy)`);
        continue;
      }
      s.ap -= cost;
      s.vault ??= { isotopes: 0, alloy: 0 };
      s.stock.isotopes -= iso;
      s.stock.alloy -= al;
      s.vault.isotopes += iso;
      s.vault.alloy += al;
      pushLog(s, `[t${t}] VAULT DEPOSIT — ${iso} isotopes, ${al} alloy behind the sect's seal`);
    } else if (o.kind === "withdraw_vault") {
      const iso = Math.max(0, Math.floor(o.isotopes ?? 0));
      const al = Math.max(0, Math.floor(o.alloy ?? 0));
      const v = s.vault ?? { isotopes: 0, alloy: 0 };
      if (iso + al === 0) { pushLog(s, `[t${t}] withdraw_vault rejected — empty request`); continue; }
      if (v.isotopes < iso || v.alloy < al) {
        pushLog(s, `[t${t}] withdraw_vault rejected — the vault holds ${v.isotopes} iso, ${v.alloy} alloy`);
        continue;
      }
      s.ap -= cost;
      v.isotopes -= iso;
      v.alloy -= al;
      s.vault = v;
      s.stock.isotopes += iso;
      s.stock.alloy += al;
      pushLog(s, `[t${t}] VAULT WITHDRAWAL — ${iso} isotopes, ${al} alloy back into working stock`);
    } else if (o.kind === "refine_alloy") {
      if (spendable() < REFINE_EU) {
        pushLog(s, `[t${t}] refine_alloy rejected — needs ${REFINE_EU} eu (have ${s.store_eu})`);
        continue;
      }
      s.ap -= cost;
      s.store_eu -= REFINE_EU;
      built += REFINE_EU;
      const alloyOut = Math.floor((REFINE_ALLOY_BASE * sys.metallicity_milli) / 1000);
      s.stock.alloy += alloyOut;
      pushLog(s, `[t${t}] refined ${alloyOut} alloy from ${REFINE_EU} eu (Z ${sys.metallicity_milli}) — matter is embodied work`);
    } else if (o.kind === "burn_isotopes") {
      if (s.burnActive) {
        pushLog(s, `[t${t}] burn_isotopes rejected — the injector is already hot this tick`);
        continue;
      }
      if (s.stock.isotopes < BURN_ISO_COST) {
        pushLog(s, `[t${t}] burn_isotopes rejected — needs ${BURN_ISO_COST} isotopes (have ${s.stock.isotopes})`);
        continue;
      }
      s.ap -= cost;
      s.stock.isotopes -= BURN_ISO_COST;
      s.burnActive = true;
      pushLog(s, `[t${t}] fusion-assist — ${BURN_ISO_COST} isotopes into the stream, flux x1.5 this tick`);
    } else if (o.kind === "send_shipment") {
      const lag = laneLag(sys.id, o.to);
      if (lag === undefined) {
        pushLog(s, `[t${t}] send_shipment rejected — no lane from ${sys.id} to ${o.to}`);
        continue;
      }
      const iso = Math.max(0, Math.min(CARGO_MAX_PER_SHIPMENT, Math.floor(o.isotopes ?? 0)));
      const alloyQ = Math.max(0, Math.min(CARGO_MAX_PER_SHIPMENT, Math.floor(o.alloy ?? 0)));
      if (iso + alloyQ === 0) {
        pushLog(s, `[t${t}] send_shipment rejected — an empty hold ships nothing`);
        continue;
      }
      if (s.stock.isotopes < iso || s.stock.alloy < alloyQ) {
        pushLog(s, `[t${t}] send_shipment rejected — hold exceeds stock (have ${s.stock.isotopes} iso, ${s.stock.alloy} alloy)`);
        continue;
      }
      s.ap -= cost;
      s.stock.isotopes -= iso;
      s.stock.alloy -= alloyQ;
      hails.push({
        from: sys.id, to: o.to, kind: "cargo", emitted_t: t, deliver_at: t + lag,
        payload: JSON.stringify({ isotopes: iso, alloy: alloyQ }),
      });
      pushLog(s, `[t${t}] shipment away to ${o.to} — ${iso} isotopes, ${alloyQ} alloy, arriving t${t + lag}`);
    } else if (o.kind === "place_order") {
      const qty = Math.floor(o.qty);
      if ((o.side !== "bid" && o.side !== "ask") || (o.good !== "isotopes" && o.good !== "alloy")) {
        pushLog(s, `[t${t}] place_order rejected — side bid|ask, good isotopes|alloy`);
        continue;
      }
      if (qty < 1 || qty > BOOK_QTY_MAX || o.price_milli < PRICE_MILLI_MIN || o.price_milli > PRICE_MILLI_MAX) {
        pushLog(s, `[t${t}] place_order rejected — qty 1..${BOOK_QTY_MAX}, price ${PRICE_MILLI_MIN}..${PRICE_MILLI_MAX} milli-eu`);
        continue;
      }
      if (s.book.length >= BOOK_MAX_OPEN) {
        pushLog(s, `[t${t}] place_order rejected — ${BOOK_MAX_OPEN} orders already resting`);
        continue;
      }
      if (o.side === "ask") {
        if (s.stock[o.good] < qty) {
          pushLog(s, `[t${t}] place_order rejected — ask exceeds stock (have ${s.stock[o.good]} ${o.good})`);
          continue;
        }
        s.stock[o.good] -= qty; // the goods sit inside the order
      } else {
        const need = Math.floor((qty * o.price_milli) / 1000);
        if (spendable() < need) {
          pushLog(s, `[t${t}] place_order rejected — bid needs ${need} eu spendable (have ${spendable()})`);
          continue;
        }
        s.committedEu += need; // committed, not removed: escrow still leaks
      }
      s.ap -= cost;
      s.bookSeq += 1;
      s.book.push({ id: s.bookSeq, side: o.side, good: o.good, qty, price_milli: o.price_milli, placed_t: t });
      pushLog(s, `[t${t}] BOOK #${s.bookSeq}: ${o.side} ${qty} ${o.good} @ ${o.price_milli} milli-eu — posted to the sky`);
    } else if (o.kind === "cancel_order") {
      const idx = s.book.findIndex((b) => b.id === o.order_id);
      if (idx < 0) {
        pushLog(s, `[t${t}] cancel_order rejected — #${o.order_id} not resting here`);
        continue;
      }
      s.ap -= cost;
      const b = s.book[idx];
      if (b.side === "ask") s.stock[b.good] += b.qty;
      else s.committedEu -= Math.floor((b.qty * b.price_milli) / 1000);
      s.book.splice(idx, 1);
      pushLog(s, `[t${t}] BOOK #${b.id} cancelled — escrow returned`);
    } else if (o.kind === "fill_order") {
      const lag = laneLag(sys.id, o.system);
      if (lag === undefined) {
        pushLog(s, `[t${t}] fill_order rejected — no lane to ${o.system}`);
        continue;
      }
      const qty = Math.floor(o.qty);
      if (qty < 1 || qty > BOOK_QTY_MAX || (o.good !== "isotopes" && o.good !== "alloy")) {
        pushLog(s, `[t${t}] fill_order rejected — qty 1..${BOOK_QTY_MAX}, good isotopes|alloy`);
        continue;
      }
      // You fill against LIGHT-LAGGED belief. Escrow travels with the intent.
      const escrow: FillRequest["escrow"] = {};
      if (o.side === "ask") {
        // Lifting their ask: you send eu, they send goods.
        const pay = Math.floor((qty * o.price_milli) / 1000);
        if (pay < 1 || spendable() < pay) {
          pushLog(s, `[t${t}] fill_order rejected — lifting that ask needs ${pay} eu spendable (have ${spendable()})`);
          continue;
        }
        s.store_eu -= pay;
        transmitted += pay;
        escrow.eu = pay;
      } else {
        // Hitting their bid: you send goods, they release committed eu.
        if (s.stock[o.good] < qty) {
          pushLog(s, `[t${t}] fill_order rejected — hitting that bid needs ${qty} ${o.good} (have ${s.stock[o.good]})`);
          continue;
        }
        s.stock[o.good] -= qty;
        escrow[o.good] = qty;
      }
      s.ap -= cost;
      const freq: FillRequest = {
        orderId: o.order_id, qty, side: o.side, good: o.good, price_milli: o.price_milli,
        escrow, replyTo: sys.id,
      };
      hails.push({
        from: sys.id, to: o.system, kind: "fill", emitted_t: t, deliver_at: t + lag,
        payload: JSON.stringify(freq),
      });
      pushLog(s, `[t${t}] FILL away to ${o.system} — ${o.side === "ask" ? "lifting" : "hitting"} #${o.order_id} for ${qty} ${o.good} @ ${o.price_milli} · escrow rides the light`);
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
  // ---- Phase 4: the Exchange — arrived fills settle or bounce (M2g) ----
  // A fill is a belief that traveled: validated here against the REAL order.
  // Any mismatch — gone, wrong side, wrong good, price moved, qty short —
  // bounces the escrow home as cargo. Staleness costs a round trip.
  for (const env of inboxDue) {
    if (env.kind !== "fill") continue;
    let fr: FillRequest | null = null;
    try { fr = JSON.parse(env.payload) as FillRequest; } catch { /* dust */ }
    if (!fr) continue;
    const back = laneLag(sys.id, fr.replyTo) ?? 2;
    const bounce = (why: string) => {
      pushLog(s, `[t${t}] FILL #${fr!.orderId} from ${fr!.replyTo} BOUNCED — ${why}`);
      hails.push({
        from: sys.id, to: fr!.replyTo, kind: "cargo", emitted_t: t, deliver_at: t + back,
        payload: JSON.stringify({ eu: fr!.escrow.eu ?? 0, isotopes: fr!.escrow.isotopes ?? 0, alloy: fr!.escrow.alloy ?? 0, bounce: true }),
      });
    };
    const idx = s.book.findIndex((b) => b.id === fr!.orderId);
    if (idx < 0) { bounce("order gone"); continue; }
    const b = s.book[idx];
    if (b.side !== fr.side || b.good !== fr.good) { bounce("terms mismatch"); continue; }
    if (b.price_milli !== fr.price_milli) { bounce(`price moved (now ${b.price_milli})`); continue; }
    if (b.qty < fr.qty) { bounce(`only ${b.qty} remain`); continue; }

    if (b.side === "ask") {
      // They lifted our ask with eu: goods leave the order, eu is theirs-sent.
      const expect = Math.floor((fr.qty * b.price_milli) / 1000);
      if ((fr.escrow.eu ?? 0) < expect) { bounce("escrow short"); continue; }
      b.qty -= fr.qty;
      euIn += fr.escrow.eu ?? 0; // inbound eu is next-books money — credited after the ledger closes
      hails.push({
        from: sys.id, to: fr.replyTo, kind: "cargo", emitted_t: t, deliver_at: t + back,
        payload: JSON.stringify({ [b.good]: fr.qty }),
      });
      pushLog(s, `[t${t}] BOOK #${b.id} FILLED by ${fr.replyTo}: ${fr.qty} ${b.good} @ ${b.price_milli} — +${fr.escrow.eu} eu, goods away`);
      raiseEvent(s, "order_filled");
    } else {
      // They hit our bid with goods: committed eu releases and beams to them.
      const goodsIn = fr.escrow[b.good] ?? 0;
      if (goodsIn < fr.qty) { bounce("escrow short"); continue; }
      const pay = Math.floor((fr.qty * b.price_milli) / 1000);
      b.qty -= fr.qty;
      s.committedEu -= pay;
      s.store_eu -= pay;
      transmitted += pay;
      s.stock[b.good] += goodsIn;
      hails.push({
        from: sys.id, to: fr.replyTo, kind: "cargo", emitted_t: t, deliver_at: t + back,
        payload: JSON.stringify({ eu: pay }),
      });
      pushLog(s, `[t${t}] BOOK #${b.id} FILLED by ${fr.replyTo}: ${fr.qty} ${b.good} @ ${b.price_milli} — goods in, ${pay} eu away`);
      raiseEvent(s, "order_filled");
    }
    if (b.qty === 0) {
      s.book.splice(idx, 1);
      pushLog(s, `[t${t}] BOOK #${b.id} closed — fully filled`);
    }
  }


  const playerMods = s.burnActive
    ? { ...mods, fluxMult_milli: Math.floor((mods.fluxMult_milli * BURN_FLUX_MULT_MILLI) / 1000) }
    : mods;
  s.burnActive = false; // one tick of fire, then it is spent
  const out = thermoTick(
    {
      store_eu: s.store_eu,
      heatBank_eu: bank0,
      throttle_milli: s.damaged ? 0 : s.structures.collectors.throttle_milli,
      panels: s.structures.radiators.panels,
      t_rad_milli: s.structures.radiators.t_rad_milli,
    },
    flux,
    playerMods,
    s.damaged,
  );
  // Isotope byproduct: collectors sieve the stellar wind — flare worlds are
  // rich, and flares triple the catch (the wind IS the flare).
  const isoGain = Math.floor((out.intake_eu * sys.flare_per_mille * (flare ? 3 : 1)) / (1000 * ISO_YIELD_DIV));
  if (isoGain > 0) s.stock.isotopes += isoGain;
  s.store_eu = out.store_eu;
  s.heatBank_eu = out.heatBank_eu;
  if (out.overheatedNow) {
    s.damaged = true;
    s.structures.collectors.throttle_milli = 0;
    pushLog(s, `[t${t}] THERMAL RUNAWAY — systems damaged, collectors offline`);
    if (!s.turbulence) {
      s.turbulence = { since: t, recovery: 0 };
      pushLog(s, `[t${t}] DAO-HEART TURBULENCE — the horizon narrows until you settle`);
    }
  }
  // Repair is deliberate — a repair_systems order, never automatic.

  // The Hollow's levy: work becomes waste heat, tick after tick (M2i).
  // Store -> bank is an internal transfer: the invariant holds untouched,
  // and the heat is REAL — the debt can cook the unprepared.
  if (t <= s.bargainDebtUntil) {
    const levy = Math.min(BARGAIN_LEVY_EU, Math.max(0, s.store_eu));
    if (levy > 0) {
      s.store_eu -= levy;
      s.heatBank_eu += levy;
      pushLog(s, `[t${t}] the debt burns — ${levy} eu of work into waste heat (until t${s.bargainDebtUntil})`);
    }
  }

  // ---- Conservation invariant (anti-cheat is physics, GDD §12.0) ----
  const dStore = s.store_eu - store0;
  const dBank = s.heatBank_eu - bank0;
  if (out.intake_eu !== dStore + out.radiated_eu + dBank + built + transmitted) {
    throw new ConservationError(
      `t${t}: intake=${out.intake_eu} ≠ dStore=${dStore} + radiated=${out.radiated_eu} + dBank=${dBank} + built=${built} + transmitted=${transmitted}`,
    );
  }

  s.ledger = {
    tick: t,
    intake_eu: out.intake_eu,
    dStore_eu: dStore,
    heatRadiated_eu: out.radiated_eu,
    dHeatBank_eu: dBank,
    built_eu: built,
    transmitted_eu: transmitted,
    flare,
  };
  if (flare) pushLog(s, `[t${t}] stellar flare (flux x3)`);
  if (euIn > 0) s.store_eu += euIn; // inbound settlements: next-books money, like all cargo

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
      "self.panels": m.structures.radiators.panels,
      "self.damaged": m.damaged ? 1 : 0,
      "self.ap": 0,
      "self.isotopes": 0,
      "self.alloy": 0,
      "self.committed": 0,
    };
    const mPrev = (Object.keys(m.metricsPrev).length ? m.metricsPrev : mCur) as Metrics;
    const mEval = evaluate(tr.rulesFrozen as Rule[], mPrev, mCur, t, m.ruleMeta);
    for (const a of mEval.actions) {
      if (a.type === "set_throttle") {
        m.structures.collectors.throttle_milli = Math.max(0, Math.min(1000, a.value_milli));
      } else if (a.type === "set_radiator_temp") {
        m.structures.radiators.t_rad_milli = Math.max(T_RAD_MIN, Math.min(T_RAD_MAX, a.value_milli));
      } else if (a.type === "repair_systems" && m.damaged && m.heatBank_eu === 0 && m.store_eu >= REPAIR_EU) {
        m.store_eu -= REPAIR_EU;
        m.damaged = false;
        pushLog(s, `[t${t}] the copy repairs itself — your reflexes, its hands`);
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
        s.sanctify = undefined;
        s.sanctifyCooldownUntil = 0;
        s.handsOffStreak = 0;
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
        if (!s.turbulence) {
          s.turbulence = { since: t, recovery: 0 };
          pushLog(s, `[t${t}] DAO-HEART TURBULENCE — the horizon narrows until you settle`);
        }
      }
      s.trial = undefined;
    }
  }

  // ---- Harmonize window accounting + verdict (M2f) ----
  let harmonizePassed = false;
  if (harmActive && s.harmonize) {
    s.harmonize.netStore += dStore;
    if (t === s.harmonize.endTick) {
      const h = s.harmonize;
      const passed = !h.violated && !s.damaged && h.netStore > 0;
      pushLog(s, `[t${t}] HARMONIZE VERDICT — ${passed ? "the system held itself" : h.violated ? "voided by hand" : s.damaged ? "it broke" : "it bled"} · net ${h.netStore >= 0 ? "+" : ""}${h.netStore} eu`);
      if (passed) {
        harmonizePassed = true;

      } else {
        s.harmonizeCooldownUntil = t + HARMONIZE_COOLDOWN;
        if (!s.turbulence) {
          s.turbulence = { since: t, recovery: 0 };
          pushLog(s, `[t${t}] DAO-HEART TURBULENCE — the horizon narrows until you settle`);
        }
      }
      s.harmonize = undefined;
    }
  }

  // ---- Dao-heart turbulence recovery: 8 clean ticks settle it ----
  if (s.turbulence) {
    const stable = dStore >= 0 && !s.damaged;
    s.turbulence.recovery = stable ? s.turbulence.recovery + 1 : 0;
    if (s.turbulence.recovery >= TURBULENCE_RECOVERY) {
      s.turbulence = undefined;
      pushLog(s, `[t${t}] the dao heart settles — ${TURBULENCE_RECOVERY} clean ticks`);
    }
  }

  // ---- Phase 5: dispatch — light-lagged mail in, beacon pulses out (M2a) ----
  for (const env of inboxDue) {
    if (env.kind === "fill") continue; // consumed by the Exchange in phase 4
    if (env.kind === "cargo") {
      let iso = 0, alloyIn = 0, euCargo = 0;
      try {
        const c = JSON.parse(env.payload) as { isotopes?: number; alloy?: number; eu?: number };
        iso = Math.max(0, Math.floor(c.isotopes ?? 0));
        alloyIn = Math.max(0, Math.floor(c.alloy ?? 0));
        euCargo = Math.max(0, Math.floor(c.eu ?? 0));
      } catch { /* malformed cargo arrives as dust */ }
      s.stock.isotopes += iso;
      s.stock.alloy += alloyIn;
      s.store_eu += euCargo; // post-ledger: next-books money
      let wasBounce = false;
      try { wasBounce = !!(JSON.parse(env.payload) as { bounce?: boolean }).bounce; } catch { /* noop */ }
      raiseEvent(s, wasBounce ? "fill_bounced" : "cargo_received");
      pushLog(s, `[t${t}] CARGO from ${env.from} (${t - env.emitted_t} ticks in flight): +${iso} isotopes, +${alloyIn} alloy${euCargo ? `, +${euCargo} eu` : ""}`);
      continue;
    }
    s.receivedSignals.push({
      from: env.from,
      emitted_t: env.emitted_t,
      received_t: t,
      payload: env.payload,
      decoded: env.kind === "hail", // a mind's hail is already in shared protocol
      kind: env.kind as "beacon" | "hail", // cargo returned above
    });
    if (env.kind === "hail") { s.gotHail = true; gotHailNew = true; }
    raiseEvent(s, env.kind === "hail" ? "message_received.hail" : "message_received.beacon");
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
  s.outbox = [...hails, ...emissions].map((e, i) => ({ ...e, seq: i }));

  // ---- Stage engine: the nine-fold climb's live gates (Deep Dive §14) ----
  // Runs after dispatch so same-tick hail arrivals can complete Connect.
  if (!justAscended) {
    const snap = {
      dStore,
      decodedNew,
      gotHailNew,
      verbsUsed: s.verbsUsed.length,
      decodedCount: s.decodedFrom.length,
      sentHail: s.sentHail,
      gotHail: s.gotHail,
      store: s.store_eu,
      panels: s.structures.radiators.panels,
      intake: out.intake_eu,
      calN: s.calibration.n,
      calAvg_milli: s.calibration.n ? Math.floor(s.calibration.total_milli / s.calibration.n) : 0,
      calSpan: 0, // filled below
      harmonizePassed,
      sanctifyPassed,
      handsOffStreak: s.handsOffStreak,
    };
    // Complete (9/9): the realm holds without you. Manual silence + solvency.
    s.handsOffStreak = orders.length === 0 && dStore >= 0 ? s.handsOffStreak + 1 : 0;
    snap.handsOffStreak = s.handsOffStreak;

    // Calibration span from resolved forecasts still in the window we keep.
    const resolved = s.forecasts.filter((f) => f.outcome !== undefined);
    if (resolved.length >= 2) snap.calSpan = resolved[resolved.length - 1].resolves_t - resolved[0].resolves_t;

    const before = s.stage;
    const stageStep = advanceStage(s.stage, s.positiveStreak, snap, t);
    // The Hollow notices arrival at the eighth rung — and returns after failure.
    const nowSanctify = stageStep.stage === "sanctify";
    if (nowSanctify && !s.sanctify && t >= s.sanctifyCooldownUntil) {
      const wSeed = mix(seedKey, t ^ 0x5a11);
      const whisperAt = t + WHISPER_DELAY_MIN + roll(wSeed, t, 0xc0, WHISPER_DELAY_SPAN);
      const wEvents: TrialEvent[] = [];
      for (let i = 0; i < WHISPER_EVENTS; i++) {
        const evTick = whisperAt + roll(wSeed, t, 0xd0 + i, WHISPER_WINDOW);
        const kindRoll = roll(wSeed, t, 0xe8 + i, 3);
        wEvents.push({ tick: evTick, kind: kindRoll === 0 ? "flare_echo" : kindRoll === 1 ? "impurity" : "panel_fault" });
      }
      wEvents.sort((a, b) => a.tick - b.tick || (a.kind < b.kind ? -1 : 1));
      s.sanctify = { whisperAt, windowEnd: whisperAt + WHISPER_WINDOW - 1, events: wEvents, open: true };
    }
    s.stage = stageStep.stage;
    s.positiveStreak = stageStep.positiveStreak;
    if (stageStep.completedLog) pushLog(s, stageStep.completedLog);

    // Achieve's bars gate the sixth rung; one rung per tick, never skipping.
    if (before === "achieve" && s.stage === "achieve") {
      const bar = achieveBarMet(s.realm, snap);
      if (bar) {
        s.stage = "understand";
        pushLog(s, `[t${t}] STAGE COMPLETE: Achieve — ${bar}`);
      }
    } else if (before === "understand" && s.stage === "understand" && understandGateMet(snap)) {
      s.stage = "harmonize";
      pushLog(s, `[t${t}] STAGE COMPLETE: Understand — your map matched the territory`);
    } else if (before === "sanctify" && s.stage === "complete") {
      s.handsOffStreak = 0; // the capstone's silence counts from the summit, not the climb
    } else if (s.stage === "complete" && before === "complete" && snap.handsOffStreak === 16) {
      pushLog(s, `[t${t}] EMBODIED COMPLETE — sixteen silent ticks. The realm holds without you. The ladder is climbed.`);
    }
  }

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
