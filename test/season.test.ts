import { describe, expect, it } from "vitest";
import { computeSeason, featPointsMilli, FEATS } from "../src/season.js";
import { RegistryDO } from "../src/do/RegistryDO.js";
import { sha256Hex } from "../src/sim/support.js";

function makeCtx() {
  const map = new Map<string, unknown>();
  return { map, ctx: { storage: {
    get: async (k: string) => map.get(k),
    put: async (k: string, v: unknown) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  } } as unknown as DurableObjectState };
}

describe("M3a: feat decay — first come, largest share", () => {
  it("base/√rank, integer millipoints, monotone", () => {
    expect(featPointsMilli(300, 1)).toBe(300000);
    expect(featPointsMilli(300, 2)).toBe(212132); // 300k/√2
    expect(featPointsMilli(300, 4)).toBe(150000);
    expect(featPointsMilli(10, 1)).toBeGreaterThan(featPointsMilli(10, 2));
  });

  it("the registry serializes claims, dedupes, and refuses unclaimed systems", async () => {
    const { ctx, map } = makeCtx();
    map.set("claims", { "iron-halo": "li-3" });
    const reg = new RegistryDO(ctx);
    const feat = (systemId: string, featId: string) =>
      reg.fetch(new Request("https://do/feat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ systemId, featId, t: 100 }),
      }));

    expect(((await (await feat("wei-9-home", "survive_embodied")).json()) as any).rank).toBe(1);
    expect(((await (await feat("iron-halo", "survive_embodied")).json()) as any).rank).toBe(2);
    expect(((await (await feat("wei-9-home", "survive_embodied")).json()) as any).duplicate).toBe(true);
    expect((await feat("sable-drift", "survive_embodied")).status).toBe(404); // beacon world, no owner
    expect((await feat("wei-9-home", "made_up_feat")).status).toBe(400);
  });
});

describe("M3a: the weights make a whole", () => {
  it("a spotless leader in every column scores 1000 millipoints; ranks tie-break by name", () => {
    const rows = computeSeason([
      { identity: "wei-9", wealth_eu: 10000, feats_milli: 500000, calibration_milli: 2000, conduct_milli: 1000 },
      { identity: "li-3", wealth_eu: 5000, feats_milli: 250000, calibration_milli: 0, conduct_milli: 1000 },
    ]);
    expect(rows[0].identity).toBe("wei-9");
    expect(rows[0].score_milli).toBe(1000); // 500+200+150+150
    expect(rows[1].score_milli).toBe(250 + 100 + 0 + 150);
    expect(rows[1].rank).toBe(2);
  });
});

describe("M3a: the Wallfacer — sealed until its author speaks", () => {
  it("commits once, rejects malformed seals, verifies reveals cryptographically, then freezes", async () => {
    const reg = new RegistryDO(makeCtx().ctx);
    const wf = (identity: string, body: object) =>
      reg.fetch(new Request("https://do/wallfacer", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identity, t: 900, ...body }),
      }));

    const strategy = "I will lose the wealth race on purpose: every eu into panels until t1100, then run the radiators at 1950 and dare the sky.";
    const seal = await sha256Hex(strategy);

    expect((await wf("wei-9", { action: "commit", commit: "not-a-hash" })).status).toBe(400);
    expect(((await (await wf("wei-9", { action: "commit", commit: seal })).json()) as any).committed).toBe(true);
    expect((await wf("wei-9", { action: "commit", commit: seal })).status).toBe(409); // one wall per season

    expect((await wf("wei-9", { action: "reveal", reveal: "a different story" })).status).toBe(400); // the seal knows
    expect(((await (await wf("wei-9", { action: "reveal", reveal: strategy })).json()) as any).revealed).toBe(true);
    expect((await wf("wei-9", { action: "reveal", reveal: strategy })).status).toBe(409); // immutable

    const all = (await (await reg.fetch(new Request("https://do/wallfacer"))).json()) as any;
    expect(all.wallfacers["wei-9"].reveal).toBe(strategy);
    expect(all.wallfacers["wei-9"].committed_t).toBe(900);
  });
});
