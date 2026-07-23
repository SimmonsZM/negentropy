import { describe, expect, it } from "vitest";
import { fuse, MIND_KEYS, mindOf, PLACE_KEYS, placeOf } from "../src/sim/mindplace.js";
import { seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { genesisState, stateHash } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";
import type { Order, SimState } from "../src/sim/types.js";

const HOME = getSystem("wei-9-home")!;
const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();

/** A state with as many organs alive as one mind can manage: matter,
 * markets, mastery, mail, claims, debt, damage, turbulence, a vault. */
function livedIn(): SimState {
  let s: SimState = { ...genesisState(), store_eu: 4000 };
  const days: Array<Order[]> = [
    [{ kind: "build_radiator" }],
    [{ kind: "refine_alloy" }],
    [{ kind: "technique", id: "weave_material" }],
    [{ kind: "send_hail", to: "cinder-veil", text: "the founder greets the red dwarf" }],
    [{ kind: "register_forecast", claim: { type: "flare_within", window: 8 }, p_milli: 700 }],
    [{ kind: "place_order", side: "ask", good: "alloy", qty: 2, price_milli: 900 }],
    [{ kind: "technique", id: "attune_cryo" }],
    [{ kind: "build_radiator" }],
  ];
  for (const orders of days) s = resolve(s, orders, RULES, SEED, HOME);
  for (let i = 0; i < 12; i++) s = resolve(s, [], RULES, SEED, HOME);
  // organs the calm days can't reach, grafted deliberately:
  s.vault = { isotopes: 3, alloy: 1 };
  s.turbulence = { since: s.tick, recovery: 2 };
  s.bargainDebtUntil = s.tick + 9;
  s.damaged = true;
  s.failureLog.overheats = 2;
  return s;
}

describe("M5a: the partition is total and disjoint", () => {
  it("every runtime field of a lived-in state is classified exactly once", () => {
    const s = livedIn();
    const mind = new Set<string>(MIND_KEYS as readonly string[]);
    const place = new Set<string>(PLACE_KEYS as readonly string[]);
    for (const k of Object.keys(s)) {
      expect(mind.has(k) || place.has(k), `unclassified field: ${k}`).toBe(true);
      expect(mind.has(k) && place.has(k), `doubly classified field: ${k}`).toBe(false);
    }
  });
});

describe("M5a: projections are pure and fuse is lossless", () => {
  it("fuse(placeOf, mindOf) is hash-identical to the original — genesis and lived-in", async () => {
    for (const s of [genesisState(), livedIn()]) {
      const before = await stateHash(s);
      const rebuilt = fuse(placeOf(s), mindOf(s));
      expect(await stateHash(rebuilt)).toBe(before);
      expect(await stateHash(s)).toBe(before); // projecting mutated nothing
    }
  });

  it("the halves carry what the spec says they carry", () => {
    const s = livedIn();
    const m = mindOf(s);
    const p = placeOf(s);
    expect(m.mastery.material).toBeGreaterThan(0); // mastery travels
    expect(m.bargainDebtUntil).toBeGreaterThan(0); // debt follows the debtor
    expect(m.turbulence).toBeDefined(); // the shaken heart is yours
    expect(p.book.length).toBeGreaterThan(0); // the market is the place's
    expect(p.vault).toEqual({ isotopes: 3, alloy: 1 }); // matter stays where it sits
    expect(p.buffs).toBeDefined(); // attunements are of THESE radiators
    expect((m as unknown as Record<string, unknown>).store_eu).toBeUndefined();
    expect((p as unknown as Record<string, unknown>).mastery).toBeUndefined();
  });

  it("a fused-and-rebuilt state resolves forward identically to the original", async () => {
    const a = livedIn();
    const b = fuse(placeOf(a), mindOf(a));
    const a2 = resolve(a, [{ kind: "repair_systems" }], RULES, SEED, HOME);
    const b2 = resolve(b, [{ kind: "repair_systems" }], RULES, SEED, HOME);
    expect(await stateHash(b2)).toBe(await stateHash(a2));
  });
});
