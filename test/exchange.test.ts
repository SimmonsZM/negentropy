import { describe, expect, it } from "vitest";
import { seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";
import type { Order, SimState } from "../src/sim/types.js";

const RULES = defaultInstincts();
const HOME = getSystem("wei-9-home")!;
const SEED = seedFrom("negentropy-season-0", "wei-9-home");

describe("M2g: the book — escrow honesty", () => {
  it("an ask locks goods inside the order; cancel returns them", () => {
    let s = genesisState();
    s.stock.alloy = 10;
    s = resolve(s, [{ kind: "place_order", side: "ask", good: "alloy", qty: 6, price_milli: 5000 }], RULES, SEED, HOME);
    expect(s.book.length).toBe(1);
    expect(s.stock.alloy).toBe(4);
    s = resolve(s, [{ kind: "cancel_order", order_id: s.book[0].id }], RULES, SEED, HOME);
    expect(s.book.length).toBe(0);
    expect(s.stock.alloy).toBe(10);
  });

  it("a bid commits eu without removing it — escrow still leaks, and blocks other spends", () => {
    let s: SimState = { ...genesisState(), realm: "foundation", store_eu: 2000 };
    s = resolve(s, [{ kind: "place_order", side: "bid", good: "isotopes", qty: 100, price_milli: 19000 }], RULES, SEED, HOME);
    expect(s.committedEu).toBe(1900); // income cannot outrun this commitment before t2
    // The committed eu is still IN store: leak applies to the full balance.
    expect(s.store_eu).toBeGreaterThan(1900); // not removed
    // A refine needing 500 must fail: spendable = store − committed < 500.
    const ap0 = s.ap;
    s = resolve(s, [{ kind: "refine_alloy" }], RULES, SEED, HOME);
    expect(s.log.join("\n")).toContain("refine_alloy rejected");
    expect(s.stock.alloy).toBe(0);
    expect(s.ap).toBe(Math.min(30, ap0 + 10));
  });
});

// ---- Two-DO harness for the full light-lagged round trip ----
function mkCtx() {
  const map = new Map<string, unknown>();
  return { map, ctx: { storage: {
    get: async (k: string) => map.get(k),
    put: async (k: string, v: unknown) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  } } as unknown as DurableObjectState };
}

describe("M2g: a trade crosses the vacuum — settle, and bounce", () => {
  it("wei-9's ask is lifted from cinder-veil: eu lands at A, goods land at B, exactly once", async () => {
    const A = mkCtx(), B = mkCtx();
    const doA = { obj: null as unknown as SystemDO }, doB = { obj: null as unknown as SystemDO };
    const ns = {
      idFromName: (n: string) => ({ name: n }),
      get: (id: { name: string }) => ({
        fetch: async (url: string, init?: RequestInit) =>
          (id.name === "wei-9-home" ? doA.obj : doB.obj).fetch(new Request(url, init)),
      }),
    } as unknown as DurableObjectNamespace;
    const env: Env = { SYSTEM_DO: ns, REGISTRY_DO: ns, DEV_TOKEN: "t", WORLD_SEED: "negentropy-season-0", GENESIS_EPOCH: "0" };
    doA.obj = new SystemDO(A.ctx, env);
    doB.obj = new SystemDO(B.ctx, env);

    // Seed A with alloy and a resting ask at t1.
    await doA.obj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=0"));
    const pA = A.map.get("p") as any;
    pA.sim.stock.alloy = 20;
    A.map.set("p", pA);
    await doA.obj.fetch(new Request("https://do/orders?sys=wei-9-home&toTick=0", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: 1, orders: [{ kind: "place_order", side: "ask", good: "alloy", qty: 10, price_milli: 20000 }] }),
    }));
    await doA.obj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=1"));

    // B (cinder-veil) lifts it at t2, believing the posted terms. Pay = 8×20 = 160 eu.
    await doB.obj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=1"));
    await doB.obj.fetch(new Request("https://do/orders?sys=cinder-veil&toTick=1", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: 2, orders: [{ kind: "fill_order", system: "wei-9-home", order_id: 1, qty: 8, side: "ask", good: "alloy", price_milli: 20000 }] }),
    }));
    const b2 = (await (await doB.obj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=2"))).json()) as any;
    expect(b2.sim.ledger.transmitted_eu).toBe(160);
    const bStoreAfterSend = b2.sim.store_eu;

    // Fill arrives at A at t4 (lag 2): settles; goods cargo departs for B.
    const a4 = (await (await doA.obj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=4"))).json()) as any;
    expect(a4.sim.log.join("\n")).toContain("FILLED by cinder-veil: 8 alloy");
    expect(a4.sim.book[0].qty).toBe(2);
    // Goods cargo lands at B at t6.
    const b6 = (await (await doB.obj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=6"))).json()) as any;
    expect(b6.sim.stock.alloy).toBe(8);
    expect(b6.sim.log.join("\n")).not.toContain("BOUNCED"); // the eu stayed spent — nothing came back
    expect(a4.sim.log.join("\n")).toContain("+160 eu, goods away"); // A pocketed the payment
    void bStoreAfterSend;
  });

  it("a fill against a cancelled order bounces the escrow home intact", async () => {
    const A = mkCtx(), B = mkCtx();
    const doA = { obj: null as unknown as SystemDO }, doB = { obj: null as unknown as SystemDO };
    const ns = {
      idFromName: (n: string) => ({ name: n }),
      get: (id: { name: string }) => ({
        fetch: async (url: string, init?: RequestInit) =>
          (id.name === "wei-9-home" ? doA.obj : doB.obj).fetch(new Request(url, init)),
      }),
    } as unknown as DurableObjectNamespace;
    const env: Env = { SYSTEM_DO: ns, REGISTRY_DO: ns, DEV_TOKEN: "t", WORLD_SEED: "negentropy-season-0", GENESIS_EPOCH: "0" };
    doA.obj = new SystemDO(A.ctx, env);
    doB.obj = new SystemDO(B.ctx, env);

    await doA.obj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=0"));
    const pA = A.map.get("p") as any;
    pA.sim.stock.alloy = 20;
    A.map.set("p", pA);
    await doA.obj.fetch(new Request("https://do/orders?sys=wei-9-home&toTick=0", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: 1, orders: [{ kind: "place_order", side: "ask", good: "alloy", qty: 10, price_milli: 20000 }] }),
    }));
    await doA.obj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=1"));

    // B commits 160 eu into the void at t2…
    await doB.obj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=1"));
    await doB.obj.fetch(new Request("https://do/orders?sys=cinder-veil&toTick=1", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: 2, orders: [{ kind: "fill_order", system: "wei-9-home", order_id: 1, qty: 8, side: "ask", good: "alloy", price_milli: 20000 }] }),
    }));
    const b2 = (await (await doB.obj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=2"))).json()) as any;
    const bStoreCommitted = b2.sim.store_eu;

    // …while A cancels at t3, before the light arrives.
    await doA.obj.fetch(new Request("https://do/orders?sys=wei-9-home&toTick=2", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: 3, orders: [{ kind: "cancel_order", order_id: 1 }] }),
    }));
    const a4 = (await (await doA.obj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=4"))).json()) as any;
    expect(a4.sim.log.join("\n")).toContain("BOUNCED — order gone");
    expect(a4.sim.stock.alloy).toBe(20); // cancel restored the goods

    // The 160 eu bounces home to B at t6.
    const b6 = (await (await doB.obj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=6"))).json()) as any;
    expect(b6.sim.log.join("\n")).toContain("+160 eu");
    expect(b6.sim.store_eu).toBeGreaterThan(bStoreCommitted); // it came back (plus income)
  });
});

describe("M2g: catch-up equality through a trade", () => {
  it("cold replay of place+cancel matches live, hash-exact", async () => {
    const orders = new Map<number, Order[]>();
    orders.set(2, [{ kind: "place_order", side: "bid", good: "alloy", qty: 5, price_milli: 30000 }]);
    orders.set(6, [{ kind: "cancel_order", order_id: 1 }]);
    const seedState = (): SimState => ({ ...genesisState(), store_eu: 1000 });
    let live = seedState();
    for (let t = 1; t <= 10; t++) live = resolve(live, orders.get(t) ?? [], RULES, SEED, HOME);
    const cold = fastForward(seedState(), RULES, SEED, 10, orders);
    expect(await stateHash(cold)).toBe(await stateHash(live));
    expect(cold.committedEu).toBe(0);
  });
});
