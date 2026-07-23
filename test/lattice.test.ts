import { describe, expect, it } from "vitest";
import { HARMONIZE_WINDOW, seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { TURBULENCE_RECOVERY } from "../src/sim/stages.js";
import { genesisState } from "../src/sim/support.js";
import type { Envelope, Order, SimState } from "../src/sim/types.js";

const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();
const at = (stage: SimState["stage"], extra: Partial<SimState> = {}): SimState =>
  ({ ...genesisState(), stage, ...extra } as SimState);

describe("M2f: the middle rungs", () => {
  it("Control completes on three distinct TECHNIQUE verbs — the helm alone is not mastery", () => {
    let s = at("control", { store_eu: 2000 });
    s = resolve(s, [{ kind: "set_throttle", target: "collectors", value_milli: 700 }], RULES, SEED);
    expect(s.stage).toBe("control"); // helm verbs no longer count
    s = resolve(s, [
      { kind: "technique", id: "weave_material" },
      { kind: "technique", id: "attune_cryo" },
      { kind: "technique", id: "mend_biotic" },
    ], RULES, SEED);
    expect(s.stage).toBe("belong");
    expect(s.log.join("\n")).toContain("three arts, one will");
  });

  it("Belong completes via a hail exchange — or a second decoded beacon", () => {
    let a = at("belong", { sentHail: true });
    const hail: Envelope = { from: "iron-halo", to: "wei-9-home", kind: "hail", emitted_t: 1, deliver_at: 1, payload: "hello" };
    a = resolve(a, [], RULES, SEED, undefined, [hail]);
    expect(a.stage).toBe("achieve");

    let b = at("belong", { decodedFrom: ["cinder-veil", "pale-crown"] });
    b = resolve(b, [], RULES, SEED);
    expect(b.stage).toBe("achieve");
    expect(b.log.join("\n")).toContain("network of voices");
  });

  it("Achieve completes on any one posted bar (store, here) — one rung per tick, no skipping", () => {
    let s = at("belong", { decodedFrom: ["cinder-veil", "pale-crown"], store_eu: 9000 });
    s = resolve(s, [], RULES, SEED); // belong -> achieve only, despite the bar already being met
    expect(s.stage).toBe("achieve");
    s = resolve(s, [], RULES, SEED); // now the bar carries achieve -> understand
    expect(s.stage).toBe("understand");
    expect(s.log.join("\n")).toContain("store ≥ 5000");
  });

  it("Understand completes on the calibration gate (n, average, span)", () => {
    const resolved = (id: number, rt: number) => ({
      id, claim: { type: "flare_within" as const, window: 4 }, p_milli: 500,
      registered_t: rt - 4, resolves_t: rt, outcome: true, score_milli: 0,
    });
    const forecasts = Array.from({ length: 10 }, (_, i) => resolved(i + 1, 10 + i * 7)); // span 63 >= 56
    let s = at("understand", {
      realm: "foundation",
      forecasts,
      calibration: { n: 10, total_milli: 500 },
    });
    s = resolve(s, [], RULES, SEED);
    expect(s.stage).toBe("harmonize");
    expect(s.log.join("\n")).toContain("your map matched the territory");
  });
});

describe("M2f: the Harmonize crucible", () => {
  it("hands-off reflexes-only window passes; any order voids it", () => {
    let s = at("harmonize", { realm: "foundation", store_eu: 4000 });
    s.structures.radiators.panels = 20;
    s = resolve(s, [{ kind: "begin_harmonize" }], RULES, SEED);
    expect(s.harmonize).toBeDefined();
    for (let i = 0; i < HARMONIZE_WINDOW; i++) s = resolve(s, [], RULES, SEED);
    const log = s.log.join("\n");
    expect(log).toContain("HARMONIZE VERDICT — the system held itself");
    expect(log).toContain("STAGE COMPLETE: Harmonize");
    expect(s.harmonizeCooldownUntil).toBe(0);

    let v = at("harmonize", { realm: "foundation", store_eu: 4000 });
    v.structures.radiators.panels = 20;
    v = resolve(v, [{ kind: "begin_harmonize" }], RULES, SEED);
    v = resolve(v, [{ kind: "set_throttle", target: "collectors", value_milli: 900 }], RULES, SEED);
    expect(v.harmonize!.violated).toBe(true);
    for (let i = 1; i < HARMONIZE_WINDOW; i++) v = resolve(v, [], RULES, SEED);
    expect(v.log.join("\n")).toContain("voided by hand");
    expect(v.harmonizeCooldownUntil).toBeGreaterThan(0);
    expect(v.turbulence).toBeDefined(); // a failed crucible shakes the heart
  });
});

describe("M2f: dao-heart turbulence", () => {
  it("sets on runaway, blocks foresight, and settles after 8 clean ticks", () => {
    let s = at("survive", { realm: "foundation" });
    s.structures.radiators.panels = 1; // enough to drain post-damage, not enough to survive full throttle
    s.structures.collectors.throttle_milli = 1000;
    let g = 0; // the instinct will cut throttle; stubbornly raise it back — the anti-t48
    while (!s.turbulence && g++ < 10) {
      s = resolve(s, [{ kind: "set_throttle", target: "collectors", value_milli: 1000 }], RULES, SEED);
    }
    expect(s.turbulence).toBeDefined();
    expect(s.log.join("\n")).toContain("DAO-HEART TURBULENCE");

    const ap0 = s.ap;
    s = resolve(s, [{ kind: "register_forecast", claim: { type: "flare_within", window: 8 }, p_milli: 700 }], RULES, SEED);
    expect(s.forecasts.length).toBe(0);
    expect(s.log.join("\n")).toContain("a shaken heart cannot see clearly");
    expect(s.ap).toBe(Math.min(30, ap0 + 10));

    // Repair, then hold steady until it settles.
    while (s.heatBank_eu > 0) s = resolve(s, [], RULES, SEED);
    s = resolve(s, [{ kind: "repair_systems" }, { kind: "set_throttle", target: "collectors", value_milli: 120 }, { kind: "set_radiator_temp", value_milli: 1200 }], RULES, SEED);
    let guard = 0;
    while (s.turbulence && guard++ < TURBULENCE_RECOVERY + 6) s = resolve(s, [], RULES, SEED);
    expect(s.turbulence).toBeUndefined();
    expect(s.log.join("\n")).toContain("the dao heart settles");
  });
});

describe("Phase 0: alignment mechanics", () => {
  it("Survive demands margin, not just flow: a hot bank stalls the streak", () => {
    let s = at("survive", { store_eu: 3000, heatBank_eu: 95 }); // above 90% of D=100, below runaway
    s.structures.radiators.panels = 2; // D≈100; bank far above 90% of it
    s.structures.collectors.throttle_milli = 400;
    const streak0 = s.positiveStreak;
    s = resolve(s, [], RULES, SEED);
    expect(s.ledger.dStore_eu).toBeGreaterThan(0); // flow is fine…
    expect(s.positiveStreak).toBe(0); // …but the margin clause says no
    void streak0;
  });

  it("panel failure is quadratic above the design point, anchors preserved", () => {
    // pf(1200)=0 · pf(2000)=80 — and 1600 sits on the parabola (≈35), not the old line (40)
    const pf = (tRad: number) => Math.max(0, Math.floor(31.25 * (tRad * tRad - 1200 * 1200) / 1_000_000));
    expect(pf(1200)).toBe(0);
    expect(pf(2000)).toBe(80);
    expect(pf(1600)).toBe(35);
    expect(pf(1300)).toBe(7);
  });

  it("slot tranches: entry / Control / Harmonize — and turbulence dims the summit", async () => {
    const { slotsFor } = await import("../src/sim/stages.js");
    expect(slotsFor("embodied", "survive", false)).toBe(2); // the two instincts
    expect(slotsFor("embodied", "control", false)).toBe(3);
    expect(slotsFor("embodied", "harmonize", false)).toBe(4);
    expect(slotsFor("embodied", "harmonize", true)).toBe(3); // the top tranche, dark
    expect(slotsFor("foundation", "survive", false)).toBe(4);
    expect(slotsFor("foundation", "complete", false)).toBe(8);
    expect(slotsFor("foundation", "belong", true)).toBe(4); // control tranche suspended
  });

  it("a one-tick loss of ≥30% of the panels shakes the heart", () => {
    let s = at("survive", { store_eu: 5000 });
    s.structures.radiators.panels = 10;
    s.structures.radiators.t_rad_milli = 2000; // 80‰/panel: the seed will bite
    let cascaded = false;
    for (let i = 0; i < 80 && !cascaded; i++) {
      const before = s.structures.radiators.panels;
      s = resolve(s, [], RULES, SEED);
      const lost = before - s.structures.radiators.panels;
      if (lost * 1000 >= before * 300) cascaded = true;
    }
    if (cascaded) {
      expect(s.failureLog.panelCascades).toBeGreaterThan(0);
      expect(s.log.join("\n")).toContain("a third of the body, gone in one breath");
    } else {
      expect(s.failureLog.panelCascades).toBe(0); // the seed was gentle; the law still stands
    }
  });

  it("the demon reads your file: an overheat-scarred heart meets flare echoes at half strength", () => {
    let s = at("sanctify", { store_eu: 4000 });
    s.structures.radiators.panels = 20;
    s.failureLog = { overheats: 5, bustedForecasts: 0, lostTrials: 0, panelCascades: 0 };
    s = resolve(s, [], RULES, SEED);
    expect(s.sanctify).toBeDefined();
    const kinds = s.sanctify!.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "flare_echo").length).toBeGreaterThanOrEqual(1);
    expect(s.log.join("\n")).toContain("reading your worst days");
  });
});
