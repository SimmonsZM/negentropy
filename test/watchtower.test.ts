import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import { buildDigest, notableSince, tickOf, validWebhookUrl } from "../src/do/notify.js";

describe("M2d: notable filtering and digests", () => {
  it("keeps verdicts and hails, drops ambient flares and reflex chatter", () => {
    const log = [
      "[t100] stellar flare (flux x3)",
      "[t101] reflex fired: r3-restore-after-cool",
      "[t102] HAIL from iron-halo (4 ticks in flight): \"hello\"",
      "[t103] MIGRATION VERDICT — you: 2400 eu · the copy: 1800 eu · bar: 1200",
      "[t103] BREAKTHROUGH — FOUNDATION. Mirror Sight opens: what ran you is now yours to author.",
    ];
    expect(notableSince(log, 99).map(tickOf)).toEqual([102, 103, 103]);
    expect(notableSince(log, 103)).toEqual([]); // forward-only

    const d = buildDigest("wei-9-home", "Amber Reach", 103, 5000, 12, notableSince(log, 99));
    expect(d.content).toContain("**NEGENTROPY**");
    expect(d.content).toContain("BREAKTHROUGH");
    expect(d.content.length).toBeLessThanOrEqual(1900);
    expect(validWebhookUrl("https://discord.com/api/webhooks/x/y")).toBe(true);
    expect(validWebhookUrl("http://sneaky")).toBe(false);
  });
});

function makeCtx() {
  const map = new Map<string, unknown>();
  return {
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
  const ns = {
    idFromName: (n: string) => ({ name: n }),
    get: () => ({ fetch: async () => new Response("{}", { status: 200 }) }),
  } as unknown as DurableObjectNamespace;
  return { SYSTEM_DO: ns, REGISTRY_DO: ns, DEV_TOKEN: "t", WORLD_SEED: "negentropy-season-0", GENESIS_EPOCH: "0" };
}

describe("M2d: the Watchtower fires once, forward-only, and gives up gracefully", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pushes a beacon-pulse digest exactly once, never replays history", async () => {
    const calls: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response("ok", { status: 204 });
    });

    const doObj = new SystemDO(makeCtx().ctx, makeEnv());
    // Cinder Veil pulses every 16 ticks; arm the hook at t10, advance past t16.
    await doObj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=10"));
    await doObj.fetch(new Request("https://do/webhook?sys=cinder-veil", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://hooks.example/x" }),
    }));
    await doObj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=20"));
    expect(calls.length).toBe(1);
    expect(calls[0].body.content).toContain("ancient beacon pulse");
    expect(calls[0].body.tick).toBe(20);

    // Same tick again: nothing new, nothing sent.
    await doObj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=20"));
    expect(calls.length).toBe(1);
  });

  it("counts failures and disables after the cap", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));
    const doObj = new SystemDO(makeCtx().ctx, makeEnv());
    await doObj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=10"));
    await doObj.fetch(new Request("https://do/webhook?sys=cinder-veil", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://hooks.example/x" }),
    }));
    for (let t = 16; t <= 96; t += 16) {
      await doObj.fetch(new Request(`https://do/state?sys=cinder-veil&toTick=${t}`));
    }
    const st = (await (await doObj.fetch(new Request("https://do/webhook?sys=cinder-veil"))).json()) as any;
    expect(st.failures).toBeGreaterThanOrEqual(5);
    expect(st.disabled).toBe(true);
  });
});
