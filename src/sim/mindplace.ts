// The Mind/Place split — M5a: projections only (travel spec §7, stage 1).
// This module changes NO storage and NO behavior. It defines, once and
// exhaustively, which half of a fused SimState is THE MIND (identity and
// comprehension — what travels) and which is THE PLACE (physics rooted in
// a star — what stays). Storage still holds the fused shape; these views
// exist so M5b can split storage and M5c can build `depart` against a
// partition that has already been proven inert.
//
// Two fields the travel spec left unclassified, ruled here:
//  · ap → MIND. The decision budget belongs to the decider (pillar 2);
//    accrual pauses in transit per spec §3, and a guest accrues at the
//    ruled fraction. If ap were place-owned, departing would strand it.
//  · ruleMeta → PLACE. The rule SET is the mind's authorship (spec §2),
//    but rules are stored at the DO layer, and an untended place must
//    keep RUNNING them — "your automation IS you, left behind" (§3).
//    ruleMeta is the live cooldown state of that running automation, so
//    it stays with the machinery that executes it. metricsPrev likewise.
//
// Trials (trial / harmonize / sanctify) are classified MIND: they are
// yours — but they never travel non-null, because departure is refused
// while any is open (§2). The partition carries them for completeness.

import type { SimState } from "./types.js";

export const MIND_KEYS = [
  "realm", "stage", "positiveStreak",
  "verbsUsed", "techVerbs",
  "sentHail", "gotHail", "decodedFrom",
  "calibration", "forecasts", "forecastSeq",
  "mastery", "usageRing", "techCooldowns",
  "harmonize", "harmonizeCooldownUntil",
  "sanctify", "sanctifyCooldownUntil", "sanctifyEnteredAt",
  "trial", "migrationCooldownUntil",
  "turbulence", "bargainDebtUntil",
  "failureLog", "lastReflexRefactorTick",
  "retrospectivePublished", "handsOffStreak",
  "lifetimeBuilt_eu",
  "ap",
] as const;

export const PLACE_KEYS = [
  "tick", "phaseAngle",
  "store_eu", "heatBank_eu",
  "structures", "damaged",
  "stock", "book", "bookSeq", "committedEu", "vault",
  "buffs", "burnActive",
  "receivedSignals", "outbox",
  "log", "ledger",
  "flareRing",
  "reflexEvents", "metricsPrev", "ruleMeta",
] as const;

export type MindKey = (typeof MIND_KEYS)[number];
export type PlaceKey = (typeof PLACE_KEYS)[number];
export type Mind = Pick<SimState, MindKey>;
export type Place = Pick<SimState, PlaceKey>;

// ---- Compile-time exhaustiveness: adding a field to SimState will not
// build until it is classified here, and no key may sit in both lists. ----
type Unclassified = Exclude<keyof SimState, MindKey | PlaceKey>;
type Overlap = Extract<MindKey, PlaceKey>;
const _everyFieldClassified: Unclassified extends never ? true : never = true;
const _noFieldClassifiedTwice: Overlap extends never ? true : never = true;
void _everyFieldClassified;
void _noFieldClassifiedTwice;

/** The mind: identity and comprehension. Pure — does not touch `s`. */
export function mindOf(s: SimState): Mind {
  const out = {} as Record<string, unknown>;
  for (const k of MIND_KEYS) if (k in s) out[k] = s[k]; // absent optionals stay absent
  return out as Mind;
}

/** The place: physics rooted in a star. Pure — does not touch `s`. */
export function placeOf(s: SimState): Place {
  const out = {} as Record<string, unknown>;
  for (const k of PLACE_KEYS) if (k in s) out[k] = s[k]; // absent optionals stay absent
  return out as Place;
}

/** Reassembly. M5b's storage split and M5c's arrival graft both rest on
 * fuse(placeOf(s), mindOf(s)) being indistinguishable from s. */
export function fuse(place: Place, mind: Mind): SimState {
  return { ...place, ...mind } as SimState;
}
