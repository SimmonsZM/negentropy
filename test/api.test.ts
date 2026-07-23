import { describe, expect, it } from "vitest";
import { SystemDO, type Env } from "../src/do/SystemDO.js";
import { STAGE_LABELS } from "../src/sim/stages.js";

// Minimal in-memory DurableObjectState — SystemDO only touches ctx.storage.
function makeCtx() {
  const map = new Map<string, unknown>();
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
