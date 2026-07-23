import { describe, expect, it } from "vitest";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import { STAGE_LABELS } from "../src/sim/stages.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { genesisState } from "../src/sim/support.js";

// Minimal in-memory DurableObjectState — SystemDO only touches ctx.storage.
function makeCtx(seed?: Map<string, unknown>) {
  const map = seed ?? new Map<string, unknown>();
  return {
    storage: {
      get: async (k: string) => map.get(k),
      put: async (k: string, v: unknown) => { map.set(k, v); },
      delete: async (k: string) => { map.delete(k); },
    },
  } as unknown as DurableObjectState;
}

const ENV: Env = {
  SYSTEM_DO: {} as unknown as DurableObjectNamespace,
  DEV_TOKEN: "t",
  WORLD_SEED: "negentropy-season-0",
  GENESIS_EPOCH: "0",
};

function post(doi: SystemDO, target: number) {
  return doi.fetch(new Request("https://do/orders?toTick=0", {
    method: "POST",
    body: JSON.stringify({ tick: target, orders: [{ kind: "noop" }] }),
    headers: { "content-type": "application/json" },
  }));
}

describe("M1.5: order horizon (Embodied = 4 ticks)", () => {
  it("rejects orders more than 4 ticks ahead with a 400 naming the cap", async () => {
    const doi = new SystemDO(makeCtx(), ENV); // genesis sits at tick 0
    const res = await post(doi, 5); // 5 > 0 + 4
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("horizon");
    expect(body.error).toContain("4");
  });

  it("accepts orders exactly at the horizon", async () => {
    const doi = new SystemDO(makeCtx(), ENV);
    const res = await post(doi, 4); // 4 === 0 + 4
    expect(res.status).toBe(200);
    const body = (await res.json()) as { queued_for_tick: number };
    expect(body.queued_for_tick).toBe(4);
  });
});

describe("M1.5: stage labels", () => {
  it("maps stage ids to their nine-fold-climb labels", () => {
    expect(STAGE_LABELS.survive).toBe("Survive (1/9)");
    expect(STAGE_LABELS.connect).toBe("Connect (2/9)");
  });
});

describe("migration: v1 state predates the stage engine", () => {
  it("defaults missing stage/positiveStreak and keeps counting from there", async () => {
    // Seed a v1 Persisted blob: genesis sim with the two stage-engine fields removed.
    const sim = genesisState();
    delete (sim as any).stage;
    delete (sim as any).positiveStreak;
    const map = new Map<string, unknown>([
      ["p", { sim, rules: defaultInstincts(), chain: "genesis" }],
    ]);
    const doi = new SystemDO(makeCtx(map), ENV);

    // Reading /state at the persisted tick must surface the defaulted stage.
    const s0 = await doi.fetch(new Request("https://do/state?toTick=0"));
    const b0 = (await s0.json()) as { sim: { stage: string; positiveStreak: number } };
    expect(b0.sim.stage).toBe("survive");
    expect(b0.sim.positiveStreak).toBe(0);

    // One positive tick advances the streak from the repaired baseline.
    const s1 = await doi.fetch(new Request("https://do/state?toTick=1"));
    const b1 = (await s1.json()) as { sim: { positiveStreak: number } };
    expect(b1.sim.positiveStreak).toBe(1);
  });
});
