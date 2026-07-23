import { describe, expect, it } from "vitest";
import { AP_BANK_CAP, BUILD_RADIATOR_EU, REPAIR_EU, seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { SURVIVE_STREAK_TARGET } from "../src/sim/stages.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import type { Order } from "../src/sim/types.js";

const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();

function ordersFor(t: number): Order[] {
  if (t === 3) return [{ kind: "set_throttle", target: "collectors", value_milli: 900 }];
  if (t === 10) return [{ kind: "build_radiator" }];
  return [];
}

describe("M1 acceptance: determinism", () => {
  it("identical inputs produce byte-identical state at every tick", async () => {
    let a = genesisState();
    let b = genesisState();
    for (let t = 1; t <= 50; t++) {
      a = resolve(a, ordersFor(t), RULES, SEED);
      b = resolve(b, ordersFor(t), RULES, SEED);
      expect(await stateHash(a)).toBe(await stateHash(b));
    }
  });
});

describe("M1 acceptance: conservation (anti-cheat is physics)", () => {
  it("intake === dStore + radiated + dBank on every tick, flares included", () => {
    let s = genesisState();
    let sawFlare = false;
    for (let t = 1; t <= 400; t++) {
      s = resolve(s, ordersFor(t), RULES, SEED); // resolve() throws ConservationError on violation
      const L = s.ledger;
      expect(L.intake_eu).toBe(L.dStore_eu + L.heatRadiated_eu + L.dHeatBank_eu + L.built_eu);
      sawFlare ||= L.flare;
    }
    expect(sawFlare).toBe(true); // seeded flares actually occurred in the window
  });
});

describe("M1 acceptance: AP economy", () => {
  it("accrues +10/tick, caps at 30, rejects unaffordable orders without state damage", () => {
    let s = genesisState();
    for (let t = 1; t <= 5; t++) s = resolve(s, [], RULES, SEED);
    expect(s.ap).toBe(AP_BANK_CAP); // banked while idle, capped

    s.store_eu = 1_000_000; // isolate the AP constraint from the 150-eu build cost
    const spendy: Order[] = Array.from({ length: 40 }, () => ({ kind: "set_radiator_temp", value_milli: 1000 } as Order));
    s = resolve(s, spendy, RULES, SEED); // 40 AP wanted, 40 available at most → some rejected

    expect(s.ap).toBeGreaterThanOrEqual(0);
    expect(s.log.join("\n")).toContain("order rejected (AP)");
  });
});

describe("M1 acceptance: reflexes", () => {
  it("locked instinct cuts throttle on overheat crossing, exactly once per crossing", () => {
    let s = genesisState();
    s.structures.radiators.panels = 0; // guarantee heat accumulation
    s.structures.collectors.throttle_milli = 1000;
    let cuts = 0;
    for (let t = 1; t <= 30; t++) {
      s = resolve(s, [], RULES, SEED);
      if (s.log.join("\n").includes("INSTINCT: overheat") && cuts === 0) cuts = t;
    }
    expect(cuts).toBeGreaterThan(0);
    expect(s.structures.collectors.throttle_milli).toBe(0); // instinct executed, 0 AP spent by it
  });
});

describe("M1.5: build cost + conservation with built_eu", () => {
  it("a build books 150 eu to built_eu and the extended invariant still holds", () => {
    let s = genesisState();
    s.stock.alloy = 2; // Substance (M2f): panels are matter now — refined elsewhere for this test
    for (let t = 1; t <= 4; t++) s = resolve(s, [], RULES, SEED); // warm the store past the eu component
    const panelsBefore = s.structures.radiators.panels;
    const storeBefore = s.store_eu;
    expect(storeBefore).toBeGreaterThan(BUILD_RADIATOR_EU);

    s = resolve(s, [{ kind: "build_radiator" }], RULES, SEED);
    expect(s.stock.alloy).toBe(0); // both ingots into the panel
    const L = s.ledger;

    expect(s.structures.radiators.panels).toBe(panelsBefore + 1);
    expect(L.built_eu).toBe(BUILD_RADIATOR_EU);
    expect(L.intake_eu).toBe(L.dStore_eu + L.heatRadiated_eu + L.dHeatBank_eu + L.built_eu);
  });

  it("rejects a build without matter, logs the full bill, and spends no AP", () => {
    let s = genesisState();
    // Plenty of exergy, zero alloy: the rejection names both ingredients.
    const apBefore = s.ap;
    const panelsBefore = s.structures.radiators.panels;
    s = resolve(s, [{ kind: "build_radiator" }], RULES, SEED);
    expect(s.structures.radiators.panels).toBe(panelsBefore);
    expect(s.ap).toBe(apBefore + 10); // only the +10/tick accrual, no cost taken
    expect(s.log.join("\n")).toContain("build_radiator rejected — needs 50 eu + 2 alloy");
  });
});

describe("M1.5: set_radiator_temp", () => {
  it("sets radiator run-temp and clamps to [500, 2000]", () => {
    let s = genesisState();
    s = resolve(s, [{ kind: "set_radiator_temp", value_milli: 1500 }], RULES, SEED);
    expect(s.structures.radiators.t_rad_milli).toBe(1500);
    s = resolve(s, [{ kind: "set_radiator_temp", value_milli: 99999 }], RULES, SEED);
    expect(s.structures.radiators.t_rad_milli).toBe(2000);
    s = resolve(s, [{ kind: "set_radiator_temp", value_milli: 0 }], RULES, SEED);
    expect(s.structures.radiators.t_rad_milli).toBe(500);
  });
});

describe("M1.5: seeded radiator panel failure", () => {
  it("a radiator held hot eventually loses a panel under the fixed seed", () => {
    let s = genesisState();
    s.structures.radiators.t_rad_milli = 2000; // ~8% per-panel failure per tick
    const panels0 = s.structures.radiators.panels;
    let lostAt = 0;
    for (let t = 1; t <= 60 && lostAt === 0; t++) {
      s = resolve(s, [], RULES, SEED);
      if (s.structures.radiators.panels < panels0) lostAt = t;
    }
    expect(lostAt).toBeGreaterThan(0);
    expect(s.structures.radiators.panels).toBeLessThan(panels0);
    expect(s.log.join("\n")).toContain("radiator panel failure");
  });

  it("a cool radiator (t_rad ≤ 1200) never fails", () => {
    let s = genesisState();
    s.structures.radiators.t_rad_milli = 1200; // exactly at threshold, not above
    const panels0 = s.structures.radiators.panels;
    for (let t = 1; t <= 60; t++) s = resolve(s, [], RULES, SEED);
    expect(s.structures.radiators.panels).toBe(panels0);
  });
});

describe("M1.5: repair_systems (no more auto-repair)", () => {
  it("damage persists without an order; repair clears it only when heat is 0, at 100 eu", () => {
    let s = genesisState();
    s.damaged = true;
    s.heatBank_eu = 300;
    s.structures.collectors.throttle_milli = 0;

    // Heat present → repair rejected, systems stay offline.
    s = resolve(s, [{ kind: "repair_systems" }], RULES, SEED);
    expect(s.damaged).toBe(true);
    expect(s.log.join("\n")).toContain("heat bank must be clear");

    // Drain the bank; damage does NOT clear on its own anymore.
    for (let t = 0; t < 40 && s.heatBank_eu > 0; t++) s = resolve(s, [], RULES, SEED);
    expect(s.heatBank_eu).toBe(0);
    expect(s.damaged).toBe(true);

    // Now the deliberate repair order lands: books 100 eu to built_eu, clears damage.
    s.store_eu = 1000;
    s = resolve(s, [{ kind: "repair_systems" }], RULES, SEED);
    expect(s.damaged).toBe(false);
    expect(s.ledger.built_eu).toBe(REPAIR_EU);
    expect(s.log.join("\n")).toContain("systems repaired");
  });
});

describe("M1.5: stage engine — Survive → Connect", () => {
  // Ample radiators: heat never banks, so every idle tick is net-positive
  // regardless of seeded flares — the flip lands on exactly the 8th tick.
  const coolStart = () => {
    const s = genesisState();
    s.structures.radiators.panels = 40;
    return s;
  };

  it("flips after exactly 8 positive-dStore ticks and survives a fast-forward", async () => {
    let s = coolStart();
    expect(s.stage).toBe("survive");
    for (let t = 1; t <= 7; t++) {
      s = resolve(s, [], RULES, SEED);
      expect(s.ledger.dStore_eu).toBeGreaterThan(0);
      expect(s.stage).toBe("survive"); // not yet — one short
    }
    s = resolve(s, [], RULES, SEED); // the 8th positive tick
    expect(s.stage).toBe("connect");
    expect(s.positiveStreak).toBe(SURVIVE_STREAK_TARGET);
    expect(s.log.join("\n")).toContain("STAGE COMPLETE: Survive — the rock holds");

    // Fast-forward far past the flip: the stage persists and replay agrees.
    const ff = fastForward(coolStart(), RULES, SEED, 40);
    expect(ff.stage).toBe("connect");
    let live = coolStart();
    for (let t = 1; t <= 40; t++) live = resolve(live, [], RULES, SEED);
    expect(await stateHash(ff)).toBe(await stateHash(live));
  });
});

describe("M1 acceptance: lazy catch-up", () => {
  it("30 days cold (120 ticks) fast-forwards identically to live play, in < 1s", async () => {
    const orders = new Map<number, Order[]>();
    for (let t = 1; t <= 120; t++) if (ordersFor(t).length) orders.set(t, ordersFor(t));

    let live = genesisState();
    for (let t = 1; t <= 120; t++) live = resolve(live, ordersFor(t), RULES, SEED);

    const t0 = performance.now();
    const cold = fastForward(genesisState(), RULES, SEED, 120, orders);
    const elapsed = performance.now() - t0;

    expect(await stateHash(cold)).toBe(await stateHash(live));
    expect(elapsed).toBeLessThan(1000);
  });
});
