// M3c: The Second Citizen. Every prior test saw the universe through wei-9's
// eyes. This one lives an entire second life — mint, claim, physics, feats,
// a cross-lane trade with the founder, the banner, the wall — and every
// assumption that quietly believed wei-9 was alone gets a witness.
import { describe, expect, it } from "vitest";
import { RegistryDO } from "../src/do/RegistryDO.js";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import { FEATS, featPointsMilli } from "../src/season.js";
import { sha256Hex } from "../src/sim/support.js";

function mem() {
  const map = new Map<string, unknown>();
  return { map, ctx: { storage: {
    get: async (k: string) => map.get(k),
    put: async (k: string, v: unknown) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  } } as unknown as DurableObjectState };
}

/** One namespace that routes by name: 'registry' → RegistryDO, else SystemDO. */
function universe() {
  const regMem = mem();
  const registry = new RegistryDO(regMem.ctx);
  const systems = new Map<string, SystemDO>();
  const ns = {
    idFromName: (n: string) => ({ name: n }),
    get: (id: { name: string }) => ({
      fetch: async (url: string | Request, init?: RequestInit) => {
        const u = typeof url === "string" ? url : url.url;
        const i = typeof url === "string" ? init : url;
        if (id.name === "registry") return registry.fetch(new Request(u, i as RequestInit));
        let sys = systems.get(id.name);
        if (!sys) {
          sys = new SystemDO(mem().ctx, env);
          systems.set(id.name, sys);
        }
        return sys.fetch(new Request(u, i as RequestInit));
      },
    }),
  } as unknown as DurableObjectNamespace;
  const env: Env = { SYSTEM_DO: ns, REGISTRY_DO: ns, DEV_TOKEN: "t", WORLD_SEED: "negentropy-season-0", GENESIS_EPOCH: "0" };
  return { registry, regMap: regMem.map, env, ns };
}

describe("a second life, end to end", () => {
  it("mint → auth → physics → feat → trade → banner → wall", async () => {
    const { registry, regMap, env } = universe();
    const reg = (path: string, init?: RequestInit) => registry.fetch(new Request(`https://do${path}`, init));
    const post = (path: string, body: object) => reg(path, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });

    // ---- Mint: li-3 is born and iron-halo is claimed ----
    const mint = (await (await post("/mint", { name: "li-3" })).json()) as any;
    expect(mint.minted.systemId).toBe("iron-halo");
    expect(mint.token).toMatch(/^[0-9a-f]{64}$/);

    // ---- Auth: the worker hashes; the registry only ever sees the digest ----
    const h = await sha256Hex(mint.token);
    const auth = (await (await reg(`/auth?h=${h}`)).json()) as any;
    expect(auth.name).toBe("li-3");
    expect(auth.systemId).toBe("iron-halo");
    // The raw token exists nowhere in the registry's entire storage.
    expect(JSON.stringify([...regMap.entries()])).not.toContain(mint.token);

    // ---- Physics: iron-halo runs its own star (K, Z 900) ----
    // Everything routes through the namespace: one name, one instance —
    // exactly the guarantee production DOs live by.
    const stub = (name: string) => env.SYSTEM_DO.get(env.SYSTEM_DO.idFromName(name));
    const halo = stub("iron-halo");
    const haloFetch = (path: string, init?: RequestInit) =>
      halo.fetch(`https://do${path}${path.includes("?") ? "&" : "?"}sys=iron-halo`, init);
    await haloFetch("/state?toTick=4");
    await halo.fetch("https://do/orders?sys=iron-halo", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: 5, orders: [{ kind: "refine_alloy" }] }),
    });
    const s5 = (await (await haloFetch("/state?toTick=5")).json()) as any;
    expect(s5.sim.log.join("\n")).toContain("refined 9 alloy from 500 eu (Z 900)");

    // ---- Feats: li-3's survive reports to the registry under HER name ----
    let st = s5;
    while (!st.sim.log.join("\n").includes("STAGE COMPLETE: Survive")) {
      st = (await (await haloFetch(`/state?toTick=${st.sim.tick + 1}`)).json()) as any;
      expect(st.sim.tick).toBeLessThan(40); // sanity rail
    }
    const feats = (await (await reg("/feats")).json()) as any;
    expect(feats.feats.survive_embodied[0].identity).toBe("li-3");

    // ---- Decay across citizens: wei-9 arriving second takes the √2 cut ----
    await post("/feat", { systemId: "wei-9-home", featId: "survive_embodied", t: 900 });
    const feats2 = (await (await reg("/feats")).json()) as any;
    expect(feats2.feats.survive_embodied.map((c: any) => c.identity)).toEqual(["li-3", "wei-9"]);
    expect(featPointsMilli(FEATS.survive_embodied, 1)).toBe(10000);
    expect(featPointsMilli(FEATS.survive_embodied, 2)).toBe(7071);

    // ---- Trade across the longest lane in the game (lag 4) ----
    await halo.fetch("https://do/orders?sys=iron-halo", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: st.sim.tick + 1, orders: [{ kind: "place_order", side: "ask", good: "alloy", qty: 5, price_milli: 30000 }] }),
    });
    st = (await (await haloFetch(`/state?toTick=${st.sim.tick + 1}`)).json()) as any;
    expect(st.sim.book.length).toBe(1);
    const askTick = st.sim.tick;

    const home = stub("wei-9-home");
    const homeFetch = (path: string) => home.fetch(`https://do${path}${path.includes("?") ? "&" : "?"}sys=wei-9-home`);
    await homeFetch(`/state?toTick=${askTick}`);
    await home.fetch("https://do/orders?sys=wei-9-home", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tick: askTick + 1, orders: [{ kind: "fill_order", system: "iron-halo", order_id: 1, qty: 5, side: "ask", good: "alloy", price_milli: 30000 }] }),
    });
    const w1 = (await (await homeFetch(`/state?toTick=${askTick + 1}`)).json()) as any;
    expect(w1.sim.ledger.transmitted_eu).toBe(150); // 5 × 30 eu, audited out

    // The fill flies 4 ticks; the goods fly 4 back.
    const sellerAfter = (await (await haloFetch(`/state?toTick=${askTick + 5}`)).json()) as any;
    expect(sellerAfter.sim.log.join("\n")).toContain("FILLED by wei-9-home: 5 alloy");
    const buyerAfter = (await (await homeFetch(`/state?toTick=${askTick + 9}`)).json()) as any;
    expect(buyerAfter.sim.log.join("\n")).toContain("+0 isotopes, +5 alloy");

    // ---- The banner has two names; the wall has two seals ----
    await post("/sect?hall=wei-9-home", { action: "found", name: "first light", charter: "we answer", identity: "wei-9" });
    const joined = (await (await post("/sect", { action: "join", name: "first light", identity: "li-3" })).json()) as any;
    expect(joined.joined.members).toEqual(["wei-9", "li-3"]);

    const seal = await sha256Hex("li-3 will out-calibrate the founder");
    expect(((await (await post("/wallfacer", { action: "commit", commit: seal, identity: "li-3", t: 850 })).json()) as any).committed).toBe(true);
    const walls = (await (await reg("/wallfacer")).json()) as any;
    expect(Object.keys(walls.wallfacers)).toContain("li-3");
  }, 30000);
});
