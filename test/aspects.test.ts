import { describe, expect, it } from "vitest";
import { ASPECTS, aspectsOf, noveltyMilli, pathOf, TECHNIQUES } from "../src/sim/aspects.js";
import { flareActive, seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";
import type { SimState } from "../src/sim/types.js";

const HOME = getSystem("wei-9-home")!;
const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();

describe("M4a: your star is your available madra", () => {
  it("availability is asymmetric local physics — builds cannot transfer", () => {
    const home = aspectsOf(HOME);
    const cinder = aspectsOf(getSystem("cinder-veil")!);
    const crown = aspectsOf(getSystem("pale-crown")!);
    expect(home.material).toBe(1000); // Z 1000 — the founder's ore
    expect(home.biotic).toBeGreaterThan(800); // temperate K, calm sky
    expect(cinder.cryo).toBeGreaterThan(cinder.photonic); // dim M: cold beats light
    expect(cinder.plasma).toBeGreaterThan(home.plasma); // flare-rich
    expect(crown.cryo).toBe(0); // a G-star's neighborhood knows no deep cold
    for (const sys of ["wei-9-home", "cinder-veil", "pale-crown", "iron-halo"]) {
      const a = aspectsOf(getSystem(sys)!);
      for (const k of ASPECTS) expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(aspectsOf(getSystem(sys)!)).toEqual(a); // deterministic
    }
  });
});

describe("M4a: mastery grows by variety, not repetition", () => {
  it("identical contexts decay toward zero: 1000, 500, 200, 100…", () => {
    const ring: string[] = [];
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) { gains.push(noveltyMilli("x", ring)); ring.push("x"); }
    expect(gains).toEqual([1000, 500, 200, 100]);
    expect(noveltyMilli("fresh", ring)).toBe(1000); // variation restores full gain
  });

  it("in the sim: grinding weave flattens; the log says so", () => {
    let s: SimState = { ...genesisState(), store_eu: 3000 };
    s = resolve(s, [{ kind: "technique", id: "weave_material" }], RULES, SEED, HOME);
    const first = s.mastery.material ?? 0;
    expect(first).toBe(40); // full novelty × richness 1000
    // burn cooldowns, repeat identical context
    for (let i = 0; i < 6; i++) s = resolve(s, [], RULES, SEED, HOME);
    s = resolve(s, [{ kind: "technique", id: "weave_material" }], RULES, SEED, HOME);
    expect((s.mastery.material ?? 0) - first).toBe(20); // half
    expect(s.log.join("\n")).not.toContain("repetition teaches nothing"); // not yet zero
  });
});

describe("M4a: the arts do real thermodynamic work", () => {
  it("a technique books X−H as embodied work; the invariant never blinks", () => {
    let s: SimState = { ...genesisState(), store_eu: 2000 };
    s = resolve(s, [{ kind: "technique", id: "weave_material" }], RULES, SEED, HOME);
    expect(s.ledger.built_eu).toBe(60); // 100 in, 40 waste heat, 60 embodied
  });

  it("your sky must speak the aspect: attune_cryo is refused under a G-star", () => {
    let s: SimState = { ...genesisState(), store_eu: 2000 };
    s = resolve(s, [{ kind: "technique", id: "attune_cryo" }], RULES, SEED, getSystem("pale-crown")!);
    expect(s.log.join("\n")).toContain("your sky does not speak cryo");
    expect(s.buffs.cryo_until).toBe(0);
  });

  it("harvest_plasma only bends a storm that is actually here", () => {
    let s: SimState = { ...genesisState(), store_eu: 2000 };
    // find a calm tick and a flare tick under the fixed seed
    while (flareActive(SEED, s.tick + 1)) s = resolve(s, [], RULES, SEED, HOME);
    s = resolve(s, [{ kind: "technique", id: "harvest_plasma" }], RULES, SEED, HOME);
    expect(s.log.join("\n")).toContain("the storm is not here");
    while (!flareActive(SEED, s.tick + 1)) s = resolve(s, [], RULES, SEED, HOME);
    s = resolve(s, [{ kind: "technique", id: "harvest_plasma" }], RULES, SEED, HOME);
    expect(s.log.join("\n")).toContain("HARVEST — the storm bends");
    expect(s.ledger.intake_eu).toBe(2250); // 3000 flare × 1.5 × 50% throttle
  });

  it("mend knits the hull at t+4 if the heat is gone — and fizzles if not", () => {
    let a: SimState = { ...genesisState(), store_eu: 2000, damaged: true, heatBank_eu: 0 };
    a = resolve(a, [{ kind: "technique", id: "mend_biotic" }], RULES, SEED, HOME);
    const at = a.buffs.mend_at;
    while (a.tick < at) a = resolve(a, [], RULES, SEED, HOME);
    expect(a.damaged).toBe(false);
    expect(a.log.join("\n")).toContain("MEND completes");

    let b: SimState = { ...genesisState(), store_eu: 2000, damaged: true, heatBank_eu: 800 };
    b.structures.radiators.panels = 0; // the heat cannot leave
    b = resolve(b, [{ kind: "technique", id: "mend_biotic" }], RULES, SEED, HOME);
    while (b.tick < b.buffs.mend_at) b = resolve(b, [], RULES, SEED, HOME);
    expect(b.damaged).toBe(true);
    expect(b.log.join("\n")).toContain("MEND fizzles");
  });

  it("attune_cryo measurably raises dissipation while the buff holds", () => {
    const hot = (): SimState => {
      const s: SimState = { ...genesisState(), store_eu: 3000, heatBank_eu: 2000 };
      s.structures.collectors.throttle_milli = 0;
      s.mastery.cryo = 400;
      return s;
    };
    let plain = hot();
    let tuned = hot();
    tuned = resolve(tuned, [{ kind: "technique", id: "attune_cryo" }], RULES, SEED, HOME);
    plain = resolve(plain, [], RULES, SEED, HOME);
    tuned = resolve(tuned, [], RULES, SEED, HOME);
    plain = resolve(plain, [], RULES, SEED, HOME);
    expect(tuned.heatBank_eu).toBeLessThan(plain.heatBank_eu); // the cold is real, net of the art's own 20
  });

  it("the shield turns aside a panel failure the seed had already written", () => {
    // Reproduce the known seeded-failure scenario, then stand in its way.
    let probe = genesisState();
    probe.structures.radiators.t_rad_milli = 2000;
    let failTick = 0;
    for (let t = 1; t <= 60 && !failTick; t++) {
      probe = resolve(probe, [], RULES, SEED, HOME);
      if (probe.log.join("\n").includes("panel failure")) failTick = probe.tick;
    }
    expect(failTick).toBeGreaterThan(0);

    let s: SimState = { ...genesisState(), store_eu: 5000 };
    s.structures.radiators.t_rad_milli = 2000;
    s.mastery.gravitic = 200; s.mastery.material = 200;
    while (s.tick < failTick - 1) s = resolve(s, [], RULES, SEED, HOME);
    s = resolve(s, [{ kind: "technique", id: "shield_gravitic_material" }], RULES, SEED, HOME);
    const panels = s.structures.radiators.panels;
    while (s.tick < failTick) s = resolve(s, [], RULES, SEED, HOME);
    expect(s.log.join("\n")).toContain("SHIELD holds");
    expect(s.structures.radiators.panels).toBe(panels);
  });

  it("sense reads the star's true schedule", () => {
    let s: SimState = { ...genesisState(), store_eu: 2000 };
    s.mastery.photonic = 200; s.mastery.informational = 200;
    s = resolve(s, [{ kind: "technique", id: "sense_photonic_informational" }], RULES, SEED, HOME);
    const m = s.log.join("\n").match(/next flare at t(\d+)/);
    let expected = 0;
    for (let tau = s.tick + 1; tau <= s.tick + 24; tau++) {
      if (flareActive(SEED, tau)) { expected = tau; break; }
    }
    if (expected) expect(Number(m![1])).toBe(expected);
    else expect(s.log.join("\n")).toContain("no storm within 24");
  });
});

describe("M4a: the Path is the name your choices earn", () => {
  it("the canon holds: Patient Ice, Forge Tyrant, Whisper Cartographer", () => {
    expect(pathOf({ cryo: 600, photonic: 400 })).toBe("Patient Ice");
    expect(pathOf({ plasma: 500, material: 700 })).toBe("Forge Tyrant");
    expect(pathOf({ informational: 300, photonic: 250 })).toBe("Whisper Cartographer");
    expect(pathOf({ material: 150 })).toBe("Adept of Material");
    expect(pathOf({})).toBeNull();
  });
});

describe("M4a: replay walks the arts identically", () => {
  it("cold catch-up through techniques matches live, hash-exact", async () => {
    const orders = new Map([[2, [{ kind: "technique", id: "weave_material" } as const]],
                           [9, [{ kind: "refine_alloy" } as const]]]);
    const seedState = (): SimState => ({ ...genesisState(), store_eu: 2000 });
    let live = seedState();
    for (let t = 1; t <= 12; t++) live = resolve(live, orders.get(t) ?? [], RULES, SEED, HOME);
    const cold = fastForward(seedState(), RULES, SEED, 12, orders, HOME);
    expect(await stateHash(cold)).toBe(await stateHash(live));
    expect(cold.log.join("\n")).toContain("the weave holds");
  });
});
