import { describe, expect, it } from "vitest";
import { BEACON_INTERVAL_TICKS, SIGNALS_MAX, seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { allSystems, getSystem, laneLag, neighborsOf } from "../src/sim/starmap.js";
import { genesisState, sha256Hex, stableStringify } from "../src/sim/support.js";
import type { Envelope, SimState } from "../src/sim/types.js";

const RULES = defaultInstincts();
const HOME_SEED = seedFrom("negentropy-season-0", "wei-9-home");

describe("M2a: wei-9-home physics are PINNED across the multi-system refactor", () => {
  it("behavioral projection at t=50 matches the pre-M2a hash exactly", async () => {
    let s = genesisState();
    for (let t = 1; t <= 50; t++) s = resolve(s, [], RULES, HOME_SEED); // default sys = wei-9-home
    const proj = {
      tick: s.tick, store: s.store_eu, bank: s.heatBank_eu, ap: s.ap,
      panels: s.structures.radiators.panels, throttle: s.structures.collectors.throttle_milli,
      tRad: s.structures.radiators.t_rad_milli, damaged: s.damaged, stage: s.stage, streak: s.positiveStreak,
    };
    expect(await sha256Hex(stableStringify(proj)))
      .toBe("b4f8f067662d03b1db0576fb565962bf7734f5dc1bdf1f333af93b0ca867e2e7");
  });
});

describe("M2a: starmap", () => {
  it("loads, validates, and answers lane queries symmetrically", () => {
    expect(allSystems().length).toBe(5);
    expect(laneLag("wei-9-home", "cinder-veil")).toBe(2);
    expect(laneLag("cinder-veil", "wei-9-home")).toBe(2);
    expect(laneLag("wei-9-home", "sable-drift")).toBeUndefined(); // no direct lane
    expect(neighborsOf("wei-9-home").map((n) => n.sys.id)).toEqual(["cinder-veil", "iron-halo", "pale-crown"]);
  });

  it("per-system physics actually differ (Cinder Veil is a dimmer, angrier star)", () => {
    const cv = getSystem("cinder-veil")!;
    const cvSeed = seedFrom("negentropy-season-0", cv.id);
    let s = genesisState();
    s = resolve(s, [], RULES, cvSeed, cv);
    // Base flux 600 at genesis throttle 500 → intake 300 (or 900 on a flare tick).
    expect([300, 900]).toContain(s.ledger.intake_eu);
  });
});

describe("M2a: beacons, delivery, and the Connect gate", () => {
  it("a beacon system emits on its interval, addressed with lane lag", () => {
    const cv = getSystem("cinder-veil")!;
    const cvSeed = seedFrom("negentropy-season-0", cv.id);
    let s = genesisState();
    s.tick = BEACON_INTERVAL_TICKS - 1; // next resolved tick is the pulse tick
    s = resolve(s, [], RULES, cvSeed, cv);
    expect(s.outbox.length).toBe(2); // wei-9-home + sable-drift
    const toHome = s.outbox.find((e) => e.to === "wei-9-home")!;
    expect(toHome.deliver_at).toBe(BEACON_INTERVAL_TICKS + 2); // lag 2
    expect(s.log.join("\n")).toContain("ancient beacon pulse");
  });

  it("delivered mail is readable next tick; decoding completes Connect exactly once", () => {
    const home = getSystem("wei-9-home")!;
    let s: SimState = { ...genesisState(), stage: "connect" };
    const env: Envelope = {
      from: "cinder-veil", to: "wei-9-home", kind: "beacon",
      emitted_t: 14, deliver_at: 16, payload: "…the gradient endures…",
    };

    // Tick 1 (t=1): mail arrives in phase 5 — held, not yet decoded.
    s = resolve(s, [], RULES, HOME_SEED, home, [env]);
    expect(s.receivedSignals.length).toBe(1);
    expect(s.log.join("\n")).toContain("signal received from cinder-veil");

    // Same tick as arrival, a decode order was not possible; next tick it is.
    const apBefore = s.ap;
    s = resolve(s, [{ kind: "decode_signal" }], RULES, HOME_SEED, home);
    expect(s.decodedFrom).toEqual(["cinder-veil"]);
    expect(s.stage).toBe("control");
    expect(s.log.join("\n")).toContain("STAGE COMPLETE: Connect");
    expect(s.ap).toBe(Math.min(30, apBefore + 10) - 1); // decode costs 1 AP

    // A second decode with nothing new to decode: rejected, no AP spent.
    const ap2 = s.ap;
    s = resolve(s, [{ kind: "decode_signal" }], RULES, HOME_SEED, home);
    expect(s.stage).toBe("control");
    expect(s.ap).toBe(Math.min(30, ap2 + 10));
    expect(s.log.join("\n")).toContain("decode_signal rejected");
  });

  it("the signal buffer caps at SIGNALS_MAX, dropping oldest", () => {
    const home = getSystem("wei-9-home")!;
    let s = genesisState();
    for (let i = 0; i < SIGNALS_MAX + 6; i++) {
      const env: Envelope = {
        from: "pale-crown", to: "wei-9-home", kind: "beacon",
        emitted_t: i, deliver_at: s.tick + 1, payload: `pulse ${i}`,
      };
      s = resolve(s, [], RULES, HOME_SEED, home, [env]);
    }
    expect(s.receivedSignals.length).toBe(SIGNALS_MAX);
    expect(s.receivedSignals[0].payload).toBe("pulse 6");
  });
});
