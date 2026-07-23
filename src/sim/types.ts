// Negentropy sim types. State is plain JSON (integers + strings only)
// so it hash-chains, clones, and persists byte-stably.

import type { Stage } from "./stages.js";

export interface Structures {
  collectors: { throttle_milli: number }; // 0..1000
  radiators: { panels: number; t_rad_milli: number }; // run-temp in milli-T0
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
  flare: boolean;
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
}

export type Order =
  | { kind: "set_throttle"; target: "collectors"; value_milli: number }
  | { kind: "set_radiator_temp"; value_milli: number }
  | { kind: "build_radiator" }
  | { kind: "repair_systems" }
  | { kind: "noop" };

export const LOG_MAX = 200;

export function pushLog(s: SimState, line: string): void {
  s.log.push(line);
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}
