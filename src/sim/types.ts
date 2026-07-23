// Negentropy sim types. State is plain JSON (integers + strings only)
// so it hash-chains, clones, and persists byte-stably.

import type { Realm, Stage } from "./stages.js";
import type { ReflexEvent } from "./reflex.js";

export interface Structures {
  collectors: { throttle_milli: number }; // 0..1000
  radiators: { panels: number; t_rad_milli: number }; // run-temp in milli-T0
}

/** Seeded trial perturbation — conservation-clean by construction: each type
 * only reshapes flows the ledger already balances (flux is external; eta
 * redistributes intake between store and heat; a faulted panel reduces D). */
/** One resting order on a system's public book. Asks hold the goods inside
 * the order; bids hold eu by COMMITMENT (still in store, still leaking). */
export interface BookOrder {
  id: number;
  side: "bid" | "ask";
  good: "isotopes" | "alloy";
  qty: number;
  price_milli: number; // milli-eu per unit
  placed_t: number;
}

/** A fill traveling down a lane: the filler's escrow rides WITH the intent.
 * If the order died before this light arrived, the escrow bounces home. */
export interface FillRequest {
  orderId: number;
  qty: number;
  side: "bid" | "ask"; // the side the filler BELIEVES the resting order is
  good: "isotopes" | "alloy";
  price_milli: number; // the price the filler believes — mismatch bounces
  escrow: { eu?: number; isotopes?: number; alloy?: number };
  replyTo: string; // system id for settlement or bounce
}

export interface TrialEvent {
  tick: number;
  kind: "flare_echo" | "impurity" | "panel_fault";
}

/** The copy: your state at upload, run by your frozen reflexes, no orders. */
export interface MirrorEnt {
  store_eu: number;
  heatBank_eu: number;
  structures: Structures;
  damaged: boolean;
  metricsPrev: Record<string, number>;
  ruleMeta: Record<string, number>;
  wealth: number;
}

export interface Forecast {
  id: number;
  claim: { type: "flare_within"; window: number }; // v0: own-sky chance claims only
  p_milli: number; // stated probability of TRUE, from the score table's keys
  registered_t: number;
  resolves_t: number;
  outcome?: boolean;
  score_milli?: number;
}

export interface TrialState {
  kind: "migration";
  startedTick: number;
  endTick: number;
  events: TrialEvent[];
  rulesFrozen: unknown[]; // reflex set at upload, locked instincts included
  mirror: MirrorEnt;
  playerWealth: number;
}

/** Per-tick conservation ledger (Deep Dive §2):
 * intake === dStore + heatRadiated + dHeatBank + built — asserted every tick.
 * built_eu is exergy spent on structural orders (builds, repairs): it leaves the
 * store as embodied work rather than heat, so it needs its own term to balance. */
export interface Ledger {
  tick: number;
  intake_eu: number;
  dStore_eu: number;
  heatRadiated_eu: number;
  dHeatBank_eu: number;
  built_eu: number;
  transmitted_eu: number; // exergy beamed down a lane this tick (M2g)
  flare: boolean;
}

/** A light-lagged message between systems. deliver_at is emitted_t + lane lag;
 * the lag lives in the DATA, not the transport (Deep Dive §12 — no queues needed). */
export interface Envelope {
  from: string; // system id
  to: string; // system id
  kind: "beacon" | "hail" | "cargo" | "fill";
  emitted_t: number;
  deliver_at: number;
  payload: string; // cargo: JSON {isotopes?, alloy?, eu?}; fill: JSON FillRequest
  seq?: number; // per-tick outbox index — dedupe key includes it, so two
                // shipments (or hails) on one lane in one tick both arrive
}

export interface ReceivedSignal {
  from: string;
  emitted_t: number;
  received_t: number;
  payload: string;
  decoded: boolean; // hails arrive already readable; beacons must be decoded
  kind: "beacon" | "hail"; // cargo never enters the signal buffer — it lands in stock
}

export interface SimState {
  tick: number;
  phaseAngle: number;
  store_eu: number; // exergy store (X)
  heatBank_eu: number; // banked heat (T_core proxy)
  ap: number;
  structures: Structures;
  damaged: boolean;
  metricsPrev: Record<string, number>;
  ruleMeta: Record<string, number>; // ruleId -> lastFired tick
  log: string[]; // rolling event log (bounded)
  ledger: Ledger; // last tick's books
  stage: Stage; // nine-fold climb position (Deep Dive §14)
  positiveStreak: number; // consecutive positive-dStore ticks toward Survive
  receivedSignals: ReceivedSignal[]; // light-lagged mail, capped at SIGNALS_MAX
  decodedFrom: string[]; // system ids whose beacons this mind has decoded
  outbox: Envelope[]; // THIS tick's emissions only; DO drains after each resolve
  realm: Realm; // the big ladder (M2b)
  verbsUsed: string[]; // distinct manual order kinds ever executed (Control gate)
  sentHail: boolean;
  gotHail: boolean;
  harmonize?: { startedTick: number; endTick: number; events: TrialEvent[]; violated: boolean; netStore: number };
  harmonizeCooldownUntil: number;
  sanctify?: { whisperAt: number; windowEnd: number; events: TrialEvent[]; open: boolean }; // the Whisper (M2i)
  sanctifyCooldownUntil: number;
  bargainDebtUntil: number; // ticks the levy burns store into heat
  handsOffStreak: number; // toward Complete (9/9)
  vault?: { isotopes: number; alloy: number }; // sect vault — exists only where a hall stands (M2j)
  turbulence?: { since: number; recovery: number }; // dao-heart turbulence (M2f)
  forecasts: Forecast[]; // Foresight registry (M2e) — Mirror Sight required
  forecastSeq: number;
  flareRing: number[]; // recent flare ticks, capped, for claim resolution
  calibration: { n: number; total_milli: number };
  stock: { isotopes: number; alloy: number }; // Substance (M2f)
  book: BookOrder[]; // The Exchange (M2g): this system's public order book
  bookSeq: number;
  committedEu: number; // eu locked under open bids — spendable = store − committed
  reflexEvents: ReflexEvent[]; // events from phases 1/4/5, consumed by phase 2 (M2h)
  burnActive: boolean; // fusion-assist armed for THIS tick's production
  trial?: TrialState; // active tribulation, if any
  migrationCooldownUntil: number; // tick before which a new attempt is refused
}

export type Order =
  | { kind: "set_throttle"; target: "collectors"; value_milli: number }
  | { kind: "set_radiator_temp"; value_milli: number }
  | { kind: "build_radiator" }
  | { kind: "repair_systems" }
  | { kind: "decode_signal" }
  | { kind: "begin_migration" }
  | { kind: "begin_harmonize" }
  | { kind: "accept_bargain" }
  | { kind: "deposit_vault"; isotopes?: number; alloy?: number }
  | { kind: "withdraw_vault"; isotopes?: number; alloy?: number }
  | { kind: "send_hail"; to: string; text: string }
  | { kind: "register_forecast"; claim: { type: "flare_within"; window: number }; p_milli: number }
  | { kind: "refine_alloy" }
  | { kind: "send_shipment"; to: string; isotopes?: number; alloy?: number }
  | { kind: "burn_isotopes" }
  | { kind: "place_order"; side: "bid" | "ask"; good: "isotopes" | "alloy"; qty: number; price_milli: number }
  | { kind: "cancel_order"; order_id: number }
  | { kind: "fill_order"; system: string; order_id: number; qty: number; side: "bid" | "ask"; good: "isotopes" | "alloy"; price_milli: number }
  | { kind: "noop" };

export const LOG_MAX = 200;

export function pushLog(s: SimState, line: string): void {
  s.log.push(line);
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}
