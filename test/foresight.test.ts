import { describe, expect, it } from "vitest";
import { FORECAST_PTS, forecastScore, seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import type { Order, SimState } from "../src/sim/types.js";

const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();

function foundation(): SimState {
  return { ...genesisState(), realm: "foundation", stage: "survive" };
}

describe("M2e: the score table is a proper rule", () => {
  it("honesty maximizes: symmetric, zero at coin-flip, brutal when arrogant", () => {
    expect(forecastScore(500, true)).toBe(0);
    expect(forecastScore(500, false)).toBe(0);
    expect(forecastScore(900, true)).toBe(848);
    expect(forecastScore(900, false)).toBe(FORECAST_PTS[100]); // -2322
    expect(forecastScore(950, false)).toBe(-3322);
    // Expected value under true chance q is maximized by stating q (spot-check q=0.7):
    const ev = (state: number, q: number) => q * forecastScore(state, true) + (1 - q) * forecastScore(state, false);
    expect(ev(700, 0.7)).toBeGreaterThan(ev(900, 0.7));
    expect(ev(700, 0.7)).toBeGreaterThan(ev(500, 0.7));
  });
});

describe("M2e: registration gates", () => {
  it("Embodied minds cannot register — Mirror Sight is the key", () => {
    let s = genesisState();
    const ap0 = Math.min(30, s.ap + 10);
    s = resolve(s, [{ kind: "register_forecast", claim: { type: "flare_within", window: 8 }, p_milli: 700 }], RULES, SEED);
    expect(s.forecasts.length).toBe(0);
    expect(s.ap).toBe(ap0);
    expect(s.log.join("\n")).toContain("Mirror Sight required");
  });

  it("rejects off-table probabilities and bad windows without spending", () => {
    let s = foundation();
    s = resolve(s, [
      { kind: "register_forecast", claim: { type: "flare_within", window: 8 }, p_milli: 723 },
      { kind: "register_forecast", claim: { type: "flare_within", window: 99 }, p_milli: 700 },
    ], RULES, SEED);
    expect(s.forecasts.length).toBe(0);
    expect(s.log.join("\n")).toContain("5% steps");
    expect(s.log.join("\n")).toContain("1..28");
  });
});

describe("M2e: resolution is deterministic and remembered", () => {
  it("a claim resolves at its tick against the flare ring, scores, and accumulates", () => {
    let s = foundation();
    s = resolve(s, [{ kind: "register_forecast", claim: { type: "flare_within", window: 20 }, p_milli: 800 }], RULES, SEED);
    const target = s.forecasts[0].resolves_t;
    while (s.tick < target) s = resolve(s, [], RULES, SEED);
    const f = s.forecasts[0];
    expect(f.outcome).toBeDefined();
    const hadFlare = s.flareRing.some((ft) => ft > f.registered_t && ft <= f.resolves_t);
    expect(f.outcome).toBe(hadFlare);
    expect(f.score_milli).toBe(forecastScore(800, hadFlare));
    expect(s.calibration.n).toBe(1);
    expect(s.calibration.total_milli).toBe(f.score_milli);
    expect(s.log.join("\n")).toContain("FORECAST RESOLVED");
  });

  it("catch-up walks registrations and resolutions to an identical hash", async () => {
    const orders = new Map<number, Order[]>();
    orders.set(3, [{ kind: "register_forecast", claim: { type: "flare_within", window: 12 }, p_milli: 650 }]);
    orders.set(5, [{ kind: "register_forecast", claim: { type: "flare_within", window: 4 }, p_milli: 350 }]);
    let live = foundation();
    for (let t = 1; t <= 30; t++) live = resolve(live, orders.get(t) ?? [], RULES, SEED);
    const cold = fastForward(foundation(), RULES, SEED, 30, orders);
    expect(await stateHash(cold)).toBe(await stateHash(live));
    expect(cold.calibration.n).toBe(2);
  });

  it("caps open claims at 8", () => {
    let s = foundation();
    const batch: Order[] = Array.from({ length: 10 }, () => (
      { kind: "register_forecast", claim: { type: "flare_within", window: 28 }, p_milli: 500 } as Order
    ));
    s = resolve(s, batch, RULES, SEED);
    expect(s.forecasts.filter((f) => f.outcome === undefined).length).toBe(8);
    expect(s.log.join("\n")).toContain("8 claims already open");
  });
});
