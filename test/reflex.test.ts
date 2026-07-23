import { describe, expect, it } from "vitest";
import { evaluate, ruleCost, type Metrics, type Rule } from "../src/sim/reflex.js";
import { chargeReflexEdit } from "../src/sim/resolve.js";
import { genesisState } from "../src/sim/support.js";

const m = (flux: number, store: number, temp: number): Metrics => ({
  "system.flux": flux,
  "self.store": store,
  "self.temp": temp,
  "self.margin": 400 - temp,
  "self.panels": 0,
  "self.damaged": 0,
  "self.ap": 0,
  "self.isotopes": 0,
  "self.alloy": 0,
  "self.committed": 0,
});

describe("reflex language v0", () => {
  it("threshold_crossed fires on the crossing only, and respects cooldown", () => {
    const meta: Record<string, number> = {};
    const r: Rule = {
      id: "flare-harvest",
      priority: 20,
      trigger: { type: "threshold_crossed", metric: "system.flux", op: ">", value: 2000 },
      actions: [{ type: "set_throttle", target: "collectors", value_milli: 1000 }],
      cooldown_ticks: 4,
    };
    expect(evaluate([r], m(1000, 500, 0), m(3000, 500, 0), 5, meta).fired).toEqual(["flare-harvest"]);
    expect(evaluate([r], m(3000, 500, 0), m(3000, 500, 0), 6, meta).fired).toEqual([]); // no crossing
    expect(evaluate([r], m(1000, 500, 0), m(3000, 500, 0), 7, meta).fired).toEqual([]); // cooldown
    expect(evaluate([r], m(1000, 500, 0), m(3000, 500, 0), 9, meta).fired).toEqual(["flare-harvest"]);
  });

  it("conditions gate firing; priority orders application (last set_throttle wins)", () => {
    const meta: Record<string, number> = {};
    const hi: Rule = {
      id: "a-hi", priority: 50,
      trigger: { type: "tick" },
      actions: [{ type: "set_throttle", target: "collectors", value_milli: 100 }],
    };
    const lo: Rule = {
      id: "b-lo", priority: 10,
      trigger: { type: "tick" },
      conditions: [{ lhs: "self.store", op: ">", rhs: 400 }],
      actions: [{ type: "set_throttle", target: "collectors", value_milli: 900 }],
    };
    const { actions } = evaluate([lo, hi], m(1000, 500, 0), m(1000, 500, 0), 1, meta);
    expect(actions.map((a) => (a.type === "set_throttle" ? a.value_milli : -1))).toEqual([100, 900]);
  });

  it("rule complexity is metered", () => {
    const r: Rule = {
      id: "x", priority: 1,
      trigger: { type: "tick" },
      conditions: [{ all: [{ lhs: "self.temp", op: "<", rhs: 500 }, { not: { lhs: "self.store", op: "<", rhs: 50 } }] }],
      actions: [{ type: "alert", message: "ok" }],
    };
    expect(ruleCost(r)).toBe(6); // 1 base + (1 all + 1 cmp + 1 not + 1 cmp) + 1 action
  });

  it("edits cost AP; execution costs none", () => {
    const s = genesisState(); // ap = 10
    expect(chargeReflexEdit(s, 2)).toBe(true);
    expect(s.ap).toBe(8);
    s.ap = 1;
    expect(chargeReflexEdit(s, 2)).toBe(false);
    expect(s.ap).toBe(1);
  });
});
