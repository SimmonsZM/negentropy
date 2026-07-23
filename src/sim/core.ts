// Negentropy sim core — constants, deterministic integer RNG, physics.
// RULE: no floating point in state-affecting math. All quantities are
// scaled integers ("eu" ≈ 1 MJ; throttles/temps in milli-units).
// Deep Dive §1 (determinism), §2 (thermodynamics), §16 (tuning table).

// ---- Tuning table (Deep Dive §16) ----
export const TICK_SECONDS = 21_600; // 4 ticks/day at 00/06/12/18 UTC
export const AP_PER_TICK = 10;
export const AP_BANK_CAP = 30;
export const REFLEX_EDIT_COST = 2; // AP; execution always costs 0
export const ORDER_COST: Record<string, number> = {
  set_throttle: 1,
  set_radiator_temp: 1,
  build_radiator: 3,
  repair_systems: 2,
  decode_signal: 1,
  begin_migration: 10,
  send_hail: 1,
  noop: 0,
};

// Exergy spent on structural orders — leaves the store as *embodied* work, not
// heat, so it books to the ledger's built_eu term (Deep Dive §2 conservation).
export const BUILD_RADIATOR_EU = 150; // build_radiator: exergy drawn from store
export const REPAIR_EU = 100; // repair_systems: exergy drawn from store

// Order-queue horizon by realm (Deep Dive §14): 4 / 28 / 336 / 1008 / ∞.
export const ORDER_HORIZON_TICKS = 4; // Embodied
export const MIN_LANE_LAG = 2; // ticks; cron-synced systems can never deliver into a peer's past
export const BEACON_INTERVAL_TICKS = 16; // ancient beacons pulse every 4 days
export const SIGNALS_MAX = 24; // received-signal buffer cap
export const HAIL_MAX_CHARS = 200; // one thought per lane per AP

// ---- The Migration (M2b): the first tribulation ----
export const MIGRATION_WINDOW = 12; // ticks (3 days) — Deep Dive §10's trial-window pattern
export const MIGRATION_AP = 10; // a full tick's AP (Deep Dive §4.3)
export const MIGRATION_EU = 400; // the upload's embodied cost (books to built_eu)
export const MIGRATION_BAR = 1200; // absolute wealth bar over the window — judgment, not just a dead mirror
export const MIGRATION_COOLDOWN = 28; // ticks (1 week) between attempts
export const TRIAL_EVENTS = 3; // seeded perturbations per window, identical for you and the copy

// Bumped when the tick function's semantics change; folded into the audit
// chain so a version drift is tamper-evident, not silent (Deep Dive §1).
export const SIM_VERSION = 3; // v3: multi-system starmap, light-lagged signals (M2a)

// Radiator run-temp band for set_radiator_temp (milli-T0).
export const T_RAD_MIN = 500;
export const T_RAD_MAX = 2000;
// Panel failure: above this run-temp, each panel rolls to fail per tick, at
// per-mille rate (t_rad_milli − threshold)/divisor (Deep Dive §2: p_f ∝ hot).
export const RAD_FAIL_TEMP_MILLI = 1200;
export const RAD_FAIL_DIVISOR = 10;

export const BASE_FLUX_EU = 1000; // star output reaching collectors per tick at full throttle
export const FLARE_MULT = 3; // flux multiplier during a flare tick
export const FLARE_PER_MILLE = 60; // ~6% of ticks flare (seeded, scheduled)
export const ETA_MILLI = 350; // collector conversion efficiency (35%)
export const LEAK_PER_MILLE = 1; // storage leakage: 0.1% per tick (the heat-death tax)
export const BASE_LOAD_EU = 20; // upkeep drawn from store each tick (becomes heat)
export const RAD_K = 50; // dissipation per panel at reference temp
export const TEMP_WARN = 600; // banked heat: reflex-visible warning threshold
export const TEMP_MAX = 1000; // banked heat: damage threshold

// ---- Deterministic integer RNG (Deep Dive §1) ----
// Not cryptographic — sim events only. SHA-256 stays at the edges
// (ids, commitments, the audit hash chain).

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mix(a: number, b: number): number {
  let x = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

/** Seeded roll in [0, mod) for (seed, tick, salt). Pure, scheduled-in-advance. */
export function roll(seedKey: number, tick: number, salt: number, mod: number): number {
  return mix(mix(seedKey, tick), salt) % mod;
}

export function seedFrom(worldSeed: string, systemId: string): number {
  return fnv1a(`${worldSeed}::${systemId}`);
}

// ---- Physics (M1 slice) ----

/** Flares are scheduled draws: the seed decides them in advance, so
 * live play and lazy catch-up agree exactly. Parameterized per-system (M2a);
 * the salt is unchanged, so wei-9-home's 800-tick history is untouched. */
export function flareActive(seedKey: number, tick: number, perMille: number = FLARE_PER_MILLE): boolean {
  return roll(seedKey, tick, 0xf1a4e, 1000) < perMille;
}

export function fluxAt(
  seedKey: number,
  tick: number,
  baseFlux: number = BASE_FLUX_EU,
  perMille: number = FLARE_PER_MILLE,
): number {
  return baseFlux * (flareActive(seedKey, tick, perMille) ? FLARE_MULT : 1);
}

/** Radiator dissipation: D = panels · RAD_K · (T_r/1000)^4 — Stefan–Boltzmann,
 * conceptually (Deep Dive §2). Integer-exact: t^4 stays below 2^53 for t ≤ 2000. */
export function dissipation(panels: number, tRadMilli: number): number {
  const t4 = tRadMilli * tRadMilli * tRadMilli * tRadMilli;
  return Math.floor((panels * RAD_K * t4) / 1_000_000_000_000);
}

/** Closed-form orbital phase (deci-degrees) — analytic, never integrated. */
export function phaseAngle(tick: number): number {
  return (tick * 7) % 3600;
}
