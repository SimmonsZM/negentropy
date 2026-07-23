import { describe, expect, it } from "vitest";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import type { Envelope } from "../src/sim/types.js";

// Mock DO plumbing: in-memory storage + a SYSTEM_DO namespace that records
// every cross-DO deliver call instead of performing it.
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

function makeEnv(delivered: string[]): Env {
  return {
    SYSTEM_DO: {
      idFromName: (n: string) => ({ name: n }),
      get: () => ({
        fetch: async (url: string, init?: RequestInit) => {
          delivered.push(String(init?.body ?? url));
          return new Response("{}", { status: 200 });
        },
      }),
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

describe("M2a.1: first-contact catch-up is bounded and retry-safe", () => {
  it("a fresh beacon system catching up 815 ticks skips stale pulses (few deliveries, well under subrequest caps)", async () => {
    const { ctx, map } = makeCtx();
    const delivered: string[] = [];
    const doObj = new SystemDO(ctx, makeEnv(delivered));

    const r = await doObj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=815"));
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.sim.tick).toBe(815);

    // Pulses fire every 16 ticks (~50 of them in catch-up); only ones whose
    // deliver_at >= 815 may actually send: that is the t=800 pulse alone
    // for lag<=15 lanes — bounded regardless of history depth.
    expect(delivered.length).toBeLessThanOrEqual(4);
    for (const raw of delivered) {
      const env = JSON.parse(raw) as Envelope;
      expect(env.deliver_at).toBeGreaterThanOrEqual(815);
    }

    // Progress persisted (mid-loop checkpoints ran): the blob is at 815.
    const p = map.get("p") as any;
    expect(p.sim.tick).toBe(815);
  });

  it("/deliver is idempotent on (from, emitted_t)", async () => {
    const { ctx } = makeCtx();
    const doObj = new SystemDO(ctx, makeEnv([]));
    await doObj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=5")); // init

    const env: Envelope = {
      from: "cinder-veil", to: "wei-9-home", kind: "beacon",
      emitted_t: 4, deliver_at: 8, payload: "pulse",
    };
    const post = () =>
      doObj.fetch(new Request("https://do/deliver?sys=wei-9-home", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(env),
      }));

    const r1 = (await (await post()).json()) as any;
    expect(r1.duplicate).toBeUndefined();
    const r2 = (await (await post()).json()) as any;
    expect(r2.duplicate).toBe(true);

    // Advance past delivery: exactly ONE signal arrives despite the retry.
    const st = await doObj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=10"));
    const body = (await st.json()) as any;
    expect(body.sim.receivedSignals.filter((s: any) => s.emitted_t === 4).length).toBe(1);
  });
});

describe("M2a.2: the helm's API", () => {
  it("/state lists pending orders; DELETE /orders clears a tick", async () => {
    const { ctx } = makeCtx();
    const doObj = new SystemDO(ctx, makeEnv([]));
    await doObj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=3"));

    await doObj.fetch(new Request("https://do/orders?sys=wei-9-home&toTick=3", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orders: [{ kind: "set_throttle", target: "collectors", value_milli: 800 }] }),
    }));

    let st = (await (await doObj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=3"))).json()) as any;
    expect(st.pending.length).toBe(1);
    expect(st.pending[0].tick).toBe(4);
    expect(st.pending[0].orders[0].kind).toBe("set_throttle");

    const del = (await (await doObj.fetch(new Request("https://do/orders?sys=wei-9-home&toTick=3", {
      method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ tick: 4 }),
    }))).json()) as any;
    expect(del.count).toBe(1);

    st = (await (await doObj.fetch(new Request("https://do/state?sys=wei-9-home&toTick=3"))).json()) as any;
    expect(st.pending.length).toBe(0);
  });
});

describe("M2a.2: dashboard template sanity", () => {
  it("ships the helm, queue, and reflex editor markup", async () => {
    const { DASHBOARD_HTML } = await import("../src/dashboard.js");
    for (const id of ["h-send", "h-thr", "h-temp", "h-build", "queue", "pending", "reflex-ta", "rx-save", "tpreview"]) {
      expect(DASHBOARD_HTML).toContain('id="' + id + '"');
    }
    expect(DASHBOARD_HTML).toContain("stageOrder");
    expect(DASHBOARD_HTML).not.toContain("${"); // template stayed literal-safe
  });
});
