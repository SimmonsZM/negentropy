import { describe, expect, it } from "vitest";
import { seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { RegistryDO } from "../src/do/RegistryDO.js";
import { genesisState } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";
import type { Envelope } from "../src/sim/types.js";

const RULES = defaultInstincts();
const HOME = getSystem("wei-9-home")!;
const SEED = seedFrom("negentropy-season-0", "wei-9-home");

describe("M2c: hails — minds talking at lightspeed", () => {
  it("a hail costs 1 AP, rides the lane lag, and arrives readable", () => {
    let s = genesisState();
    const ap0 = Math.min(30, s.ap + 10);
    s = resolve(s, [{ kind: "send_hail", to: "cinder-veil", text: "  anyone out there?  " }], RULES, SEED, HOME);
    expect(s.ap).toBe(ap0 - 1);
    expect(s.outbox.length).toBe(1);
    const env = s.outbox[0];
    expect(env.kind).toBe("hail");
    expect(env.deliver_at).toBe(env.emitted_t + 2); // wei-9-home ↔ cinder-veil lag
    expect(env.payload).toBe("anyone out there?");

    // Deliver it to a recipient: readable on arrival, no decode required.
    let r = genesisState();
    const arriving: Envelope = { ...env, deliver_at: r.tick + 1 };
    r = resolve(r, [], RULES, seedFrom("negentropy-season-0", "cinder-veil"), getSystem("cinder-veil")!, [arriving]);
    expect(r.receivedSignals[0].kind).toBe("hail");
    expect(r.receivedSignals[0].decoded).toBe(true);
    expect(r.log.join("\n")).toContain('HAIL from wei-9-home');
  });

  it("rejects hails with no lane or no words, spending nothing", () => {
    let s = genesisState();
    const ap0 = Math.min(30, s.ap + 10);
    s = resolve(s, [
      { kind: "send_hail", to: "sable-drift", text: "too far" },
      { kind: "send_hail", to: "cinder-veil", text: "   " },
    ], RULES, SEED, HOME);
    expect(s.ap).toBe(ap0);
    expect(s.outbox.length).toBe(0);
    const log = s.log.join("\n");
    expect(log).toContain("no lane");
    expect(log).toContain("an empty hail is just heat");
  });
});

describe("M2c: the registry — minting minds", () => {
  function makeCtx() {
    const map = new Map<string, unknown>();
    return {
      storage: {
        get: async (k: string) => map.get(k),
        put: async (k: string, v: unknown) => void map.set(k, v),
        delete: async (k: string) => void map.delete(k),
      },
    } as unknown as DurableObjectState;
  }

  it("mints once per name, claims real systems, and auths only the minted token", async () => {
    const reg = new RegistryDO(makeCtx());
    const mint = (name: string) =>
      reg.fetch(new Request("https://do/mint", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
      }));

    const r1 = (await (await mint("li-3")).json()) as any;
    expect(r1.minted.systemId).toBe("iron-halo"); // first claimable, non-beacon
    expect(r1.token).toMatch(/^[0-9a-f]{64}$/);

    expect((await mint("li-3")).status).toBe(409); // name taken
    expect((await mint("X!")).status).toBe(400); // invalid name

    const { sha256Hex } = await import("../src/sim/support.js");
    const good = await reg.fetch(new Request("https://do/auth?h=" + (await sha256Hex(r1.token))));
    expect(good.status).toBe(200);
    expect(((await good.json()) as any).name).toBe("li-3");
    const bad = await reg.fetch(new Request("https://do/auth?h=" + (await sha256Hex("wrong"))));
    expect(bad.status).toBe(404);

    const r2 = (await (await mint("mo-7")).json()) as any;
    expect(r2.minted.systemId).toBe("far-hearth"); // second claimable
    expect((await mint("qi-1")).status).toBe(409); // map is full
  });
});

describe("M2f: cargo dedupe honors seq — two same-tick shipments both arrive", () => {
  it("assigns seq in the outbox; the recipient accepts both, rejects a retry", async () => {
    const { getSystem } = await import("../src/sim/starmap.js");
    let s = genesisState();
    s.stock.isotopes = 100;
    s = resolve(s, [
      { kind: "send_shipment", to: "cinder-veil", isotopes: 30 },
      { kind: "send_shipment", to: "cinder-veil", isotopes: 20 },
    ], RULES, SEED, getSystem("wei-9-home")!);
    expect(s.outbox.length).toBe(2);
    expect(s.outbox.map((e) => e.seq)).toEqual([0, 1]);
    expect(s.stock.isotopes).toBe(51); // 100 − 50 shipped + 1 stellar-wind byproduct this tick

    const { SystemDO } = await import("../src/do/SystemDO.js");
    const map = new Map<string, unknown>();
    const ctx = { storage: {
      get: async (k: string) => map.get(k),
      put: async (k: string, v: unknown) => void map.set(k, v),
      delete: async (k: string) => void map.delete(k),
    } } as unknown as DurableObjectState;
    const ns = { idFromName: (n: string) => ({ name: n }), get: () => ({ fetch: async () => new Response("{}") }) } as unknown as DurableObjectNamespace;
    const doObj = new SystemDO(ctx, { SYSTEM_DO: ns, REGISTRY_DO: ns, DEV_TOKEN: "t", WORLD_SEED: "negentropy-season-0", GENESIS_EPOCH: "0" });
    await doObj.fetch(new Request("https://do/state?sys=cinder-veil&toTick=1"));

    const deliver = (env: unknown) => doObj.fetch(new Request("https://do/deliver?sys=cinder-veil", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(env),
    }));
    const r1 = (await (await deliver(s.outbox[0])).json()) as any;
    const r2 = (await (await deliver(s.outbox[1])).json()) as any;
    const r3 = (await (await deliver(s.outbox[1])).json()) as any; // catch-up retry
    expect(r1.duplicate).toBeUndefined();
    expect(r2.duplicate).toBeUndefined(); // seq made it distinct
    expect(r3.duplicate).toBe(true);

    const target = Math.max(s.outbox[0].deliver_at, s.outbox[1].deliver_at);
    const st = (await (await doObj.fetch(new Request(`https://do/state?sys=cinder-veil&toTick=${target}`))).json()) as any;
    const log = st.sim.log.join("\n");
    expect(log).toContain("+30 isotopes"); // first hold, exactly once
    expect(log).toContain("+20 isotopes"); // second hold — seq kept it alive
    expect(st.sim.stock.isotopes).toBeGreaterThanOrEqual(50); // cargo + its own wind
  });
});
