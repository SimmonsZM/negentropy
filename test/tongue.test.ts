import { describe, expect, it } from "vitest";
import { seedFrom } from "../src/sim/core.js";
import { defaultInstincts, type Rule } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";
import type { Envelope, Order, SimState } from "../src/sim/types.js";

const HOME = getSystem("wei-9-home")!;
const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const BASE = defaultInstincts();

describe("M2h: events cross the tick boundary, exactly once", () => {
  it("a hail delivered at tick N fires an event trigger at N+1, then never again", () => {
    const rules: Rule[] = [...BASE, {
      id: "r-greeter", priority: 10,
      trigger: { type: "event", event: "message_received.hail" },
      actions: [{ type: "alert", message: "someone spoke" }],
    }];
    let s = genesisState();
    const hail: Envelope = { from: "cinder-veil", to: "wei-9-home", kind: "hail", emitted_t: 0, deliver_at: 1, payload: "hi" };
    s = resolve(s, [], rules, SEED, HOME, [hail]); // t1: delivery, phase 5
    expect(s.log.join("\n")).not.toContain("someone spoke");
    s = resolve(s, [], rules, SEED, HOME); // t2: event consumed
    expect(s.log.join("\n")).toContain("someone spoke");
    expect(s.reflexEvents).toEqual([]);
    const alerts = (s.log.join("\n").match(/someone spoke/g) ?? []).length;
    s = resolve(s, [], rules, SEED, HOME); // t3: silent
    expect((s.log.join("\n").match(/someone spoke/g) ?? []).length).toBe(alerts);
  });
});

describe("M2h: reflex actions are orders — physics included", () => {
  it("auto-repair fires at 0 AP, spends real exergy, obeys the heat gate", () => {
    const rules: Rule[] = [...BASE, {
      id: "r-medic", priority: 50,
      trigger: { type: "tick" },
      conditions: [{ all: [{ lhs: "self.damaged", op: "==", rhs: 1 }, { lhs: "self.temp", op: "==", rhs: 0 }] }],
      actions: [{ type: "repair_systems" }],
    }];
    let s: SimState = { ...genesisState(), damaged: true, heatBank_eu: 0, store_eu: 500 };
    const apBefore = s.ap;
    s = resolve(s, [], rules, SEED, HOME);
    expect(s.damaged).toBe(false);
    expect(s.log.join("\n")).toContain("systems repaired");
    expect(s.ap).toBe(Math.min(30, apBefore + 10)); // zero AP taken
    expect(s.ledger.built_eu).toBe(100); // the eu was very real
  });

  it("a market-maker reflex reposts when its ask fills", () => {
    const rules: Rule[] = [...BASE, {
      id: "r-maker", priority: 40,
      trigger: { type: "event", event: "order_filled" },
      actions: [{ type: "place_order", side: "ask", good: "alloy", qty: 5, price_milli: 25000 }],
    }];
    let s = genesisState();
    s.stock.alloy = 20;
    s = resolve(s, [{ kind: "place_order", side: "ask", good: "alloy", qty: 5, price_milli: 25000 }], rules, SEED, HOME);
    const fill: Envelope = {
      from: "cinder-veil", to: "wei-9-home", kind: "fill", emitted_t: 1, deliver_at: 2,
      payload: JSON.stringify({ orderId: 1, qty: 5, side: "ask", good: "alloy", price_milli: 25000, escrow: { eu: 125 }, replyTo: "cinder-veil" }),
    };
    s = resolve(s, [], rules, SEED, HOME, [fill]); // t2: fill settles, event raised
    expect(s.book.length).toBe(0);
    s = resolve(s, [], rules, SEED, HOME); // t3: the maker reposts, hands-free
    expect(s.book.length).toBe(1);
    expect(s.book[0].id).toBe(2);
    expect(s.stock.alloy).toBe(10); // 20 − 5 escrowed − 5 sold+shipped... = 10 held outside orders
  });

  it("flare-reactive fusion-assist: burn on the same tick the flux spikes", () => {
    const rules: Rule[] = [...BASE, {
      id: "r-stormrider", priority: 60,
      trigger: { type: "threshold_crossed", metric: "system.flux", op: ">", value: 2500 },
      actions: [{ type: "burn_isotopes" }],
    }];
    let s = genesisState();
    s.stock.isotopes = 100;
    let burned = false;
    for (let i = 0; i < 40 && !burned; i++) {
      s = resolve(s, [], rules, SEED, HOME);
      if (s.log.join("\n").includes("fusion-assist")) burned = true;
    }
    expect(burned).toBe(true);
    expect(s.log.join("\n")).toContain("25 isotopes into the stream"); // the fuel was spent; the wind keeps giving
    // The tick it burned during a flare: intake = 3000 × 1.5 × 50% throttle = 2250.
    expect(s.ledger.intake_eu).toBe(2250);
  });

  it("manual orders override reflex orders; synthetic verbs never count", () => {
    const rules: Rule[] = [...BASE, {
      id: "r-fixed", priority: 10,
      trigger: { type: "tick" },
      actions: [{ type: "set_throttle", target: "collectors", value_milli: 300 }, { type: "set_radiator_temp", value_milli: 1100 }],
    }];
    let s = genesisState();
    s = resolve(s, [{ kind: "set_throttle", target: "collectors", value_milli: 700 }], rules, SEED, HOME);
    expect(s.structures.collectors.throttle_milli).toBe(700); // the hand wins
    expect(s.structures.radiators.t_rad_milli).toBe(1100); // uncontested reflex holds
    expect(s.verbsUsed).toEqual(["set_throttle"]); // only the manual one
  });
});

describe("M2h: the copy speaks the wider tongue", () => {
  it("a frozen set_radiator_temp rule steers the mirror", () => {
    const rules: Rule[] = [...BASE, {
      id: "r-mirror-hot", priority: 20,
      trigger: { type: "tick" },
      actions: [{ type: "set_radiator_temp", value_milli: 1150 }],
    }];
    let s: SimState = { ...genesisState(), stage: "achieve", store_eu: 3000 };
    s.structures.radiators.panels = 20;
    while (s.tick < 9) s = resolve(s, [], rules, SEED, HOME);
    s = resolve(s, [{ kind: "begin_migration" }], rules, SEED, HOME);
    s = resolve(s, [], rules, SEED, HOME);
    expect(s.trial!.mirror.structures.radiators.t_rad_milli).toBe(1150);
  });
});

describe("M2h: catch-up equality through an event chain", () => {
  it("cold replay with deliveries and reflex reactions matches live", async () => {
    const rules: Rule[] = [...BASE, {
      id: "r-echo", priority: 5,
      trigger: { type: "event", event: "message_received.beacon" },
      actions: [{ type: "alert", message: "the old drum" }],
    }];
    const mail = new Map<number, Envelope[]>();
    mail.set(3, [{ from: "pale-crown", to: "wei-9-home", kind: "beacon", emitted_t: 0, deliver_at: 3, payload: "…" }]);
    let live = genesisState();
    for (let t = 1; t <= 8; t++) live = resolve(live, [], rules, SEED, HOME, mail.get(t) ?? []);
    const cold = fastForward(genesisState(), rules, SEED, 8, undefined, HOME, mail);
    expect(await stateHash(cold)).toBe(await stateHash(live));
    expect(cold.log.join("\n")).toContain("the old drum");
  });
});
