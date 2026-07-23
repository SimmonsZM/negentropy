// SystemDO — one star system: state + deterministic sim + audit chain.
// Cold when unobserved; advances lazily on contact or cron (Deep Dive §1, §12).

import { ORDER_HORIZON_TICKS, REFLEX_EDIT_COST, SIM_VERSION, seedFrom } from "../sim/core.js";
import { defaultInstincts, ruleCost, type Rule } from "../sim/reflex.js";
import { chargeReflexEdit, resolve } from "../sim/resolve.js";
import { chainLink, genesisState, stableStringify, stateHash } from "../sim/support.js";
import type { Order, SimState } from "../sim/types.js";

export interface Env {
  SYSTEM_DO: DurableObjectNamespace;
  DEV_TOKEN: string;
  WORLD_SEED: string;
  GENESIS_EPOCH: string;
}

const MAX_RULES_M1 = 4; // Embodied slot count; 2 are locked instincts (Deep Dive §5/§14)

interface Persisted {
  sim: SimState;
  rules: Rule[];
  chain: string; // latest audit link
}

export class SystemDO {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  private async load(): Promise<Persisted> {
    const p = await this.ctx.storage.get<Persisted>("p");
    if (p) {
      // Migrate v1 blobs that predate the stage engine: default missing fields
      // and persist the repaired blob back only if a default was actually applied.
      let repaired = false;
      if (p.sim.stage === undefined) { p.sim.stage = "survive"; repaired = true; }
      if (p.sim.positiveStreak === undefined) { p.sim.positiveStreak = 0; repaired = true; }
      if (repaired) await this.ctx.storage.put("p", p);
      return p;
    }
    const fresh: Persisted = { sim: genesisState(), rules: defaultInstincts(), chain: "genesis" };
    await this.ctx.storage.put("p", fresh);
    return fresh;
  }

  private async advanceTo(p: Persisted, toTick: number): Promise<void> {
    const seedKey = seedFrom(this.env.WORLD_SEED, "wei-9-home");
    while (p.sim.tick < toTick) {
      const t = p.sim.tick + 1;
      const orders = (await this.ctx.storage.get<Order[]>(`orders:${t}`)) ?? [];
      p.sim = resolve(p.sim, orders, p.rules, seedKey);
      const inputs = stableStringify({ v: SIM_VERSION, t, orders, rules: p.rules });
      p.chain = await chainLink(p.chain, inputs, await stateHash(p.sim));
      await this.ctx.storage.delete(`orders:${t}`);
    }
    await this.ctx.storage.put("p", p);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = await this.load();
    const toTick = Number(url.searchParams.get("toTick") ?? p.sim.tick);
    await this.advanceTo(p, toTick); // lazy catch-up on every contact

    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v, null, 2), { status, headers: { "content-type": "application/json" } });

    const readJson = async () => {
      try {
        return await req.json();
      } catch {
        return null;
      }
    };

    if (req.method === "GET" && url.pathname === "/state") {
      return json({ sim: p.sim, chain: p.chain, rules: p.rules });
    }

    if (req.method === "POST" && url.pathname === "/orders") {
      const body = (await readJson()) as { tick?: number; orders?: Order[] } | null;
      if (!body || !Array.isArray(body.orders)) return json({ error: "invalid JSON body" }, 400);
      const target = body.tick ?? p.sim.tick + 1;
      if (target <= p.sim.tick) return json({ error: "tick already resolved" }, 409);
      if (target > p.sim.tick + ORDER_HORIZON_TICKS) {
        return json(
          { error: `order horizon exceeded — Embodied realm may queue at most ${ORDER_HORIZON_TICKS} ticks ahead` },
          400,
        );
      }
      const existing = (await this.ctx.storage.get<Order[]>(`orders:${target}`)) ?? [];
      await this.ctx.storage.put(`orders:${target}`, [...existing, ...body.orders]);
      return json({ queued_for_tick: target, count: body.orders.length });
    }

    if (req.method === "PUT" && url.pathname === "/rules") {
      const incoming = (await readJson()) as Rule[] | null;
      if (!incoming || !Array.isArray(incoming)) return json({ error: "invalid JSON body" }, 400);
      if (incoming.length > MAX_RULES_M1) return json({ error: `max ${MAX_RULES_M1} rules at this realm` }, 400);
      for (const locked of p.rules.filter((r) => r.locked)) {
        const match = incoming.find((r) => r.id === locked.id);
        if (!match || stableStringify(match) !== stableStringify(locked)) {
          return json({ error: `instinct '${locked.id}' is not yet yours to edit (Mirror Sight required)` }, 403);
        }
      }
      if (!chargeReflexEdit(p.sim, REFLEX_EDIT_COST)) return json({ error: "insufficient AP for reflex edit" }, 402);
      p.rules = incoming;
      await this.ctx.storage.put("p", p);
      return json({ ok: true, ap_remaining: p.sim.ap, cost: incoming.map((r) => ({ id: r.id, complexity: ruleCost(r) })) });
    }

    return json({ error: "not found" }, 404);
  }
}
