import { describe, expect, it } from "vitest";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import { fuse } from "../src/sim/mindplace.js";
import { seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";
import type { Order, SimState } from "../src/sim/types.js";

const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();
const HOME = getSystem("wei-9-home")!;

function mkCtx(seed?: Map<string, unknown>) {
  const map = seed ?? new Map<string, unknown>();
  return { map, ctx: { storage: {
    get: async (k: string) => map.get(k),
    put: async (k: string, v: unknown) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  } } as unknown as DurableObjectState };
}
const NS = {
  idFromName: (n: string) => ({ name: n }),
  get: () => ({ fetch: async () => new Response("{}", { status: 200 }) }),
} as unknown as DurableObjectNamespace;
const ENV: Env = { SYSTEM_DO: NS, REGISTRY_DO: NS, DEV_TOKEN: "t", WORLD_SEED: "negentropy-season-0", GENESIS_EPOCH: "0" };

const stateAt = async (obj: SystemDO, t: number): Promise<SimState> =>
  ((await (await obj.fetch(new Request(`https://do/state?sys=wei-9-home&toTick=${t}`))).json()) as { sim: SimState }).sim;

describe("M5b: the storage split, gated as the spec demands", () => {
  it("a legacy FUSED blob is split lazily on first contact — and reads back hash-identical", async () => {
    // A production-shaped fused blob: 40 lived ticks, matter and mastery aboard.
    let sim: SimState = { ...genesisState(), store_eu: 4000 };
    const orders = new Map<number, Order[]>([
      [3, [{ kind: "build_radiator" }]],
      [7, [{ kind: "refine_alloy" }]],
      [11, [{ kind: "technique", id: "weave_material" }]],
    ]);
    sim = fastForward(sim, RULES, SEED, 40, orders, HOME);
    const truth = await stateHash(sim);

    const { map, ctx } = mkCtx();
    map.set("p", { sim, rules: RULES, chain: "genesis", systemId: "wei-9-home", inbox: [] }); // the old shape
    const obj = new SystemDO(ctx, ENV);
    const read = await stateAt(obj, 40);
    expect(await stateHash(read)).toBe(truth); // nothing drifted through the door

    const stored = map.get("p") as Record<string, unknown>;
    expect(stored.sim).toBeUndefined(); // the fused shape was never written again
    expect(stored.place).toBeDefined();
    expect(stored.mind).toBeDefined();
    expect(await stateHash(fuse(stored.place as never, stored.mind as never))).toBe(truth);
  });

  it("REPLAY EQUALITY: identical inputs through pure sim vs split-storage DO across three cold reloads", async () => {
    const orders = new Map<number, Order[]>([
      [2, [{ kind: "set_radiator_temp", value_milli: 1300 }]],
      [9, [{ kind: "send_hail", to: "cinder-veil", text: "split-storage speaks" }]],
      [15, [{ kind: "set_throttle", target: "collectors", value_milli: 800 }]],
    ]);
    // The fused truth: one uninterrupted pure-sim run. (Genesis-affordable
    // verbs only — an unaffordable order refuses identically on both paths
    // and proves nothing.)
    let truth: SimState = genesisState();
    truth = fastForward(truth, RULES, SEED, 24, orders, HOME);

    // The split path: the same history through the DO, torn down and
    // reloaded from split storage between segments — every boundary is a
    // full save/load cycle through placeOf/mindOf/fuse.
    const { map, ctx } = mkCtx();
    let obj = new SystemDO(ctx, ENV);
    await stateAt(obj, 1); // genesis is born and saved split
    for (const [t, os] of orders) {
      const upto = t - 1;
      await stateAt(obj, upto);
      await obj.fetch(new Request("https://do/orders?sys=wei-9-home&t=" + t, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ orders: os }),
      }));
      obj = new SystemDO(mkCtx(map).ctx, ENV); // cold reload from split blobs
    }
    const final = await stateAt(obj, 24);
    // Effect assertions first, so a silently dropped order can never hide
    // behind two identical DO-side no-op runs:
    expect(final.structures.radiators.t_rad_milli).toBe(1300);
    expect(final.structures.collectors.throttle_milli).toBe(800);
    expect(final.sentHail).toBe(true);
    expect(await stateHash(final)).toBe(await stateHash(truth));
  });

  it("after any write, the blob speaks only the new grammar", async () => {
    const { map, ctx } = mkCtx();
    const obj = new SystemDO(ctx, ENV);
    await stateAt(obj, 3);
    const stored = map.get("p") as Record<string, unknown>;
    expect(stored.sim).toBeUndefined();
    expect(stored.place).toBeDefined();
    expect(stored.mind).toBeDefined();
  });
});
