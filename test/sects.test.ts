import { describe, expect, it } from "vitest";
import { RegistryDO } from "../src/do/RegistryDO.js";
import { seedFrom } from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { genesisState } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";

const HOME = getSystem("wei-9-home")!;
const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();

function makeCtx() {
  const map = new Map<string, unknown>();
  return { storage: {
    get: async (k: string) => map.get(k),
    put: async (k: string, v: unknown) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  } } as unknown as DurableObjectState;
}

describe("M2j: the banner — found, join, leave, and the founder's chain", () => {
  it("one banner per mind; founders cannot abandon a living sect", async () => {
    const reg = new RegistryDO(makeCtx());
    const sect = (identity: string, body: object, hall = "wei-9-home") =>
      reg.fetch(new Request(`https://do/sect?hall=${hall}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identity, ...body }),
      }));

    const f = (await (await sect("wei-9", { action: "found", name: "gradient ascent", charter: "we climb" })).json()) as any;
    expect(f.founded.hall).toBe("wei-9-home");
    expect(f.founded.members).toEqual(["wei-9"]);

    expect((await sect("wei-9", { action: "found", name: "second banner" })).status).toBe(409); // one banner per mind
    expect((await sect("li-3", { action: "found", name: "gradient ascent" }, "iron-halo")).status).toBe(409); // name taken

    const j = (await (await sect("li-3", { action: "join", name: "gradient ascent" })).json()) as any;
    expect(j.joined.members).toEqual(["wei-9", "li-3"]);

    expect((await sect("wei-9", { action: "leave" })).status).toBe(409); // founder chained to a living sect
    expect((await (await sect("li-3", { action: "leave" })).json() as any).left).toBe(true);
    expect((await (await sect("wei-9", { action: "leave" })).json() as any).left).toBe(true); // now sole member: may fall

    const list = (await (await reg.fetch(new Request("https://do/sects"))).json()) as any;
    expect(list.sects.length).toBe(0); // the empty banner dissolved
  });
});

describe("M2j: the vault is physical", () => {
  it("deposits and withdrawals are stock moves; shortfalls reject without AP", () => {
    let s = genesisState();
    s.stock.isotopes = 40;
    s.stock.alloy = 6;
    s = resolve(s, [{ kind: "deposit_vault", isotopes: 30, alloy: 4 }], RULES, SEED, HOME);
    expect(s.vault).toEqual({ isotopes: 30, alloy: 4 });
    expect(s.stock.alloy).toBe(2);

    const ap0 = s.ap;
    s = resolve(s, [{ kind: "withdraw_vault", alloy: 99 }], RULES, SEED, HOME);
    expect(s.log.join("\n")).toContain("the vault holds");
    expect(s.ap).toBe(Math.min(30, ap0 + 10)); // rejection spends nothing

    s = resolve(s, [{ kind: "withdraw_vault", isotopes: 10, alloy: 4 }], RULES, SEED, HOME);
    expect(s.vault!.alloy).toBe(0);
    expect(s.stock.alloy).toBe(6);
    expect(s.log.join("\n")).toContain("VAULT WITHDRAWAL");
  });
});
