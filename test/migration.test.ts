import { describe, expect, it } from "vitest";
import { MIGRATION_COOLDOWN, MIGRATION_WINDOW, seedFrom } from "../src/sim/core.js";
import { defaultInstincts, type Rule } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import type { Order, SimState } from "../src/sim/types.js";

const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();

function readyState(): SimState {
  const s: SimState = { ...genesisState(), stage: "achieve", store_eu: 3000 };
  s.structures.radiators.panels = 20;
  s.structures.collectors.throttle_milli = 300;
  return s;
}

function toStart(s: SimState, start: number): SimState {
  while (s.tick < start - 1) s = resolve(s, [], RULES, SEED);
  return s;
}

describe("The Migration: eligibility", () => {
  it("rejects below Control, mid-trial, on cooldown, without AP or exergy — none spend AP", () => {
    let s: SimState = { ...readyState(), stage: "survive" };
    s = resolve(s, [{ kind: "begin_migration" }], RULES, SEED);
    expect(s.trial).toBeUndefined();
    expect(s.log.join("\n")).toContain("reach Achieve (5/9) first");

    s = { ...readyState(), store_eu: 100 };
    s = resolve(s, [{ kind: "begin_migration" }], RULES, SEED);
    expect(s.trial).toBeUndefined();
    expect(s.log.join("\n")).toContain("the upload costs");

    s = { ...readyState(), migrationCooldownUntil: 999 };
    s = resolve(s, [{ kind: "begin_migration" }], RULES, SEED);
    expect(s.trial).toBeUndefined();
    expect(s.log.join("\n")).toContain("cooldown until t999");
  });
});

describe("The Migration: the pass", () => {
  it("out-deciding your copy over 12 ticks breaks through to Foundation", () => {
    let s = toStart(readyState(), 10);
    s = resolve(s, [{ kind: "begin_migration" }], RULES, SEED);
    expect(s.trial).toBeDefined();
    expect(s.trial!.events.length).toBe(3);
    for (const ev of s.trial!.events) {
      expect(ev.tick).toBeGreaterThan(10);
      expect(ev.tick).toBeLessThanOrEqual(10 + MIGRATION_WINDOW);
    }
    expect(s.log.join("\n")).toContain("THE MIGRATION BEGINS");

    for (let i = 0; i < MIGRATION_WINDOW; i++) {
      s = resolve(s, [{ kind: "set_throttle", target: "collectors", value_milli: 600 }], RULES, SEED);
    }
    const log = s.log.join("\n");
    expect(log).toContain("MIGRATION VERDICT");
    expect(log).toContain("BREAKTHROUGH — FOUNDATION");
    expect(s.realm).toBe("foundation");
    expect(s.stage).toBe("survive"); // the climb begins again, higher
    expect(s.positiveStreak).toBe(0);
    expect(s.trial).toBeUndefined();
    expect(s.migrationCooldownUntil).toBe(0); // no cooldown on victory
    expect(log).toContain("TRIAL EVENT"); // the sky actually tested them
  });
});

describe("The Migration: the fail", () => {
  it("going dark loses to the copy, sets the cooldown, and the cooldown holds", () => {
    let s = toStart(readyState(), 10);
    s = resolve(s, [{ kind: "begin_migration" }], RULES, SEED);
    for (let i = 0; i < MIGRATION_WINDOW; i++) {
      s = resolve(s, [{ kind: "set_throttle", target: "collectors", value_milli: 0 }], RULES, SEED);
    }
    const end = 10 + MIGRATION_WINDOW;
    expect(s.realm).toBe("embodied");
    expect(s.log.join("\n")).toContain("THE MIGRATION FAILS");
    expect(s.migrationCooldownUntil).toBe(end + MIGRATION_COOLDOWN);

    s.store_eu = 3000; // wealth is not the blocker — the closed sky is
    s = resolve(s, [{ kind: "begin_migration" }], RULES, SEED);
    expect(s.trial).toBeUndefined();
    expect(s.log.join("\n")).toContain("the sky is not ready");
  });
});

describe("The Migration: the copy is frozen", () => {
  it("mid-trial reflex edits do not reach the mirror", () => {
    let s = toStart(readyState(), 10);
    s = resolve(s, [{ kind: "begin_migration" }], RULES, SEED);
    const frozen = JSON.stringify(s.trial!.rulesFrozen);

    const edited: Rule[] = [...RULES, {
      id: "r-new-mid-trial", priority: 5,
      trigger: { type: "tick" },
      actions: [{ type: "alert", message: "new me" }],
    }];
    s = resolve(s, [], edited, SEED);
    s = resolve(s, [], edited, SEED);
    expect(JSON.stringify(s.trial!.rulesFrozen)).toBe(frozen);
  });
});

describe("The Migration: lazy catch-up walks the whole trial identically", () => {
  it("fast-forward through begin + window equals live play", async () => {
    const start = 10;
    const orders = new Map<number, Order[]>();
    orders.set(start, [{ kind: "begin_migration" }]);
    for (let t = start + 1; t <= start + MIGRATION_WINDOW; t++) {
      orders.set(t, [{ kind: "set_throttle", target: "collectors", value_milli: 600 }]);
    }
    let live = readyState();
    for (let t = live.tick + 1; t <= 30; t++) live = resolve(live, orders.get(t) ?? [], RULES, SEED);
    const cold = fastForward(readyState(), RULES, SEED, 30, orders);
    expect(await stateHash(cold)).toBe(await stateHash(live));
    expect(cold.realm).toBe("foundation");
  });
});

// ---- DO integration: ascension unlocks instincts, slots, and horizon ----

function makeCtx() {
  const map = new Map<string, unknown>();
  return {
    map,
    ctx: {
      storage: {
        get: async (k: string) => map.get(k),
        put: async (k: string, v: unknown) => void map.set(k, v),
        delete: async (k: string) => void map.delete(k),
      },
    } as unknown as DurableObjectState,
  };
}

function makeEnv(): Env {
  return {
    SYSTEM_DO: {
      idFromName: (n: string) => ({ name: n }),
      get: () => ({ fetch: async () => new Response("{}", { status: 200 }) }),
    } as unknown as DurableObjectNamespace,
    REGISTRY_DO: {
      idFromName: (n: string) => ({ name: n }),
      get: () => ({ fetch: async () => new Response("{}", { status: 200 }) }),
    } as unknown as DurableObjectNamespace,
    DEV_TOKEN: "t",
    WORLD_SEED: "negentropy-season-0",
    GENESIS_EPOCH: "0",
  };
}

describe("The Migration: what Foundation unlocks at the DO", () => {
  it("instincts unlock, slots grow to 8, horizon grows to 28", async () => {
    const { ctx, map } = makeCtx();
    map.set("p", {
      sim: { ...toStart(readyState(), 10) },
      rules: defaultInstincts(),
      chain: "genesis",
      systemId: "wei-9-home",
      inbox: [],
    });
    const doObj = new SystemDO(ctx, makeEnv());

    const post = (tick: number, orders: Order[]) =>
      doObj.fetch(new Request("https://do/orders?sys=wei-9-home", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tick, orders }),
      }));

    await post(10, [{ kind: "begin_migration" }]);
    for (let t = 10; t <= 10 + MIGRATION_WINDOW; t++) {
      if (t > 10) await post(t, [{ kind: "set_throttle", target: "collectors", value_milli: 600 }]);
      await doObj.fetch(new Request(`https://do/state?sys=wei-9-home&toTick=${t}`));
    }

    const st = (await (await doObj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=22"))).json()) as any;
    expect(st.sim.realm).toBe("foundation");
    expect(st.rules.every((r: any) => !r.locked)).toBe(true); // Mirror Sight's prize

    // Slots: 5 rules now legal (was max 4 at Embodied).
    const five: Rule[] = [...st.rules, {
      id: "r-fifth", priority: 1, trigger: { type: "tick" }, actions: [{ type: "alert", message: "room to grow" }],
    }];
    const put = await doObj.fetch(new Request("https://do/rules?sys=wei-9-home&toTick=22", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(five),
    }));
    expect(put.status).toBe(200);

    // Horizon: queueing 20 ticks ahead is legal at Foundation (28), not Embodied (4).
    const far = await post(42, [{ kind: "noop" }]);
    expect(far.status).toBe(200);
  });
});
