// SystemDO — one star system: state + deterministic sim + audit chain.
// Cold when unobserved; advances lazily on contact or cron (Deep Dive §1, §12).
// M2a: per-system identity (?sys=), light-lagged inbox, beacon outbox drain,
// and a public-view snapshot ring so neighbors can observe you as you WERE.

import { ORDER_HORIZON_TICKS, REFLEX_EDIT_COST, SIM_VERSION, seedFrom } from "../sim/core.js";
import { defaultInstincts, ruleCost, type Rule } from "../sim/reflex.js";
import { chargeReflexEdit, resolve } from "../sim/resolve.js";
import { getSystem } from "../sim/starmap.js";
import { chainLink, genesisState, stableStringify, stateHash } from "../sim/support.js";
import type { Envelope, Order, SimState } from "../sim/types.js";

export interface Env {
  SYSTEM_DO: DurableObjectNamespace;
  DEV_TOKEN: string;
  WORLD_SEED: string;
  GENESIS_EPOCH: string;
}

const MAX_RULES_M1 = 4; // Embodied slot count; 2 are locked instincts (Deep Dive §5/§14)
const SNAPSHOT_RING = 12; // ticks of public history kept for lagged observation

/** What a distant observer can see of this system: its thermal signature.
 * Stealth-is-heat (Deep Dive §2/§7) — the store is NOT here by design. */
interface PublicView {
  tick: number;
  phase_angle: number;
  radiated_eu: number;
  flare: boolean;
}

interface Persisted {
  sim: SimState;
  rules: Rule[];
  chain: string; // latest audit link
  systemId: string; // which star this DO is (M2a; pre-M2a blobs default wei-9-home)
  inbox: Envelope[]; // undelivered light-lagged mail, ordered on insert
}

export class SystemDO {
  constructor(private ctx: DurableObjectState, private env: Env) {}

  private async load(sysParam: string | null): Promise<Persisted> {
    const p = await this.ctx.storage.get<Persisted>("p");
    if (p) {
      // Migrate older blobs: default fields that predate their feature.
      let repaired = false;
      if (p.sim.stage === undefined) { p.sim.stage = "survive"; repaired = true; }
      if (p.sim.positiveStreak === undefined) { p.sim.positiveStreak = 0; repaired = true; }
      if (p.sim.receivedSignals === undefined) { p.sim.receivedSignals = []; repaired = true; }
      if (p.sim.decodedFrom === undefined) { p.sim.decodedFrom = []; repaired = true; }
      if (p.sim.outbox === undefined) { p.sim.outbox = []; repaired = true; }
      if (p.systemId === undefined) { p.systemId = sysParam ?? "wei-9-home"; repaired = true; }
      if (p.inbox === undefined) { p.inbox = []; repaired = true; }
      if (repaired) await this.ctx.storage.put("p", p);
      return p;
    }
    const fresh: Persisted = {
      sim: genesisState(),
      rules: defaultInstincts(),
      chain: "genesis",
      systemId: sysParam ?? "wei-9-home",
      inbox: [],
    };
    await this.ctx.storage.put("p", fresh);
    return fresh;
  }

  private async advanceTo(p: Persisted, toTick: number): Promise<void> {
    const sys = getSystem(p.systemId);
    if (!sys) throw new Error(`unknown system ${p.systemId}`);
    const seedKey = seedFrom(this.env.WORLD_SEED, sys.id);

    while (p.sim.tick < toTick) {
      const t = p.sim.tick + 1;
      const orders = (await this.ctx.storage.get<Order[]>(`orders:${t}`)) ?? [];

      // This tick's mail: deterministic order (deliver_at, from, emitted_t).
      const due = p.inbox
        .filter((e) => e.deliver_at <= t)
        .sort((a, b) => a.deliver_at - b.deliver_at || (a.from < b.from ? -1 : 1) || a.emitted_t - b.emitted_t);
      p.inbox = p.inbox.filter((e) => e.deliver_at > t);

      p.sim = resolve(p.sim, orders, p.rules, seedKey, sys, due);

      const inputs = stableStringify({ v: SIM_VERSION, t, orders, rules: p.rules, inboxDue: due });
      p.chain = await chainLink(p.chain, inputs, await stateHash(p.sim));
      await this.ctx.storage.delete(`orders:${t}`);

      // Public-view snapshot ring: what the light leaving us this tick carries.
      const snap: PublicView = {
        tick: t,
        phase_angle: p.sim.phaseAngle,
        radiated_eu: p.sim.ledger.heatRadiated_eu,
        flare: p.sim.ledger.flare,
      };
      await this.ctx.storage.put(`snap:${t}`, snap);
      await this.ctx.storage.delete(`snap:${t - SNAPSHOT_RING}`);

      // Drain this tick's emissions — but only mail that can still ARRIVE.
      // During deep catch-up, pulses whose deliver_at already passed are light
      // that swept through the neighbor unheard; skipping them keeps first-contact
      // under the free tier's subrequest cap and makes catch-up retry-safe.
      for (const env of p.sim.outbox) {
        if (env.deliver_at < toTick) continue; // that light has passed
        const stub = this.env.SYSTEM_DO.get(this.env.SYSTEM_DO.idFromName(env.to));
        await stub.fetch(`https://do/deliver?sys=${env.to}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(env),
        });
      }
      p.sim.outbox = [];

      // Durability: persist progress periodically so a mid-catch-up crash
      // resumes instead of restarting (deliveries are idempotent, see /deliver).
      if (t % 48 === 0) await this.ctx.storage.put("p", p);
    }
    await this.ctx.storage.put("p", p);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = await this.load(url.searchParams.get("sys"));

    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v, null, 2), { status, headers: { "content-type": "application/json" } });

    const readJson = async () => {
      try {
        return await req.json();
      } catch {
        return null;
      }
    };

    // Mail drop: append to the inbox WITHOUT advancing (delivery must never
    // force the recipient's clock — its own cron/observers do that).
    if (req.method === "POST" && url.pathname === "/deliver") {
      const env = (await readJson()) as Envelope | null;
      if (!env || typeof env.deliver_at !== "number" || typeof env.from !== "string") {
        return json({ error: "invalid envelope" }, 400);
      }
      // Idempotent delivery: a retried catch-up may re-send the same pulse.
      const dup =
        p.inbox.some((e) => e.from === env.from && e.emitted_t === env.emitted_t) ||
        p.sim.receivedSignals.some((s) => s.from === env.from && s.emitted_t === env.emitted_t);
      if (dup) return json({ delivered_to: p.systemId, duplicate: true });
      if (env.deliver_at <= p.sim.tick) {
        // Defensive clamp: with MIN_LANE_LAG >= 2 and cron-synced clocks this
        // should be unreachable; if it fires, we deliver at the next tick.
        env.deliver_at = p.sim.tick + 1;
      }
      p.inbox.push(env);
      if (p.inbox.length > 64) p.inbox.splice(0, p.inbox.length - 64); // bounded, oldest first out
      await this.ctx.storage.put("p", p);
      return json({ delivered_to: p.systemId, deliver_at: env.deliver_at });
    }

    const toTick = Number(url.searchParams.get("toTick") ?? p.sim.tick);
    await this.advanceTo(p, toTick); // lazy catch-up on every contact

    if (req.method === "GET" && url.pathname === "/state") {
      const pending: Array<{ tick: number; orders: Order[] }> = [];
      for (let i = 1; i <= ORDER_HORIZON_TICKS; i++) {
        const tk = p.sim.tick + i;
        const o = await this.ctx.storage.get<Order[]>(`orders:${tk}`);
        if (o && o.length) pending.push({ tick: tk, orders: o });
      }
      return json({ sim: p.sim, chain: p.chain, rules: p.rules, systemId: p.systemId, pending });
    }

    if (req.method === "DELETE" && url.pathname === "/orders") {
      const body = ((await readJson()) ?? {}) as { tick?: number };
      const target = body.tick ?? p.sim.tick + 1;
      const existing = (await this.ctx.storage.get<Order[]>(`orders:${target}`)) ?? [];
      await this.ctx.storage.delete(`orders:${target}`);
      return json({ cleared_tick: target, count: existing.length });
    }

    // Lagged public view for a distant observer: the snapshot at (their now - lag).
    if (req.method === "GET" && url.pathname === "/snapshot") {
      const at = Number(url.searchParams.get("at"));
      const snap = await this.ctx.storage.get<PublicView>(`snap:${at}`);
      if (!snap) return json({ error: "too faint — light from that tick has not been kept" }, 404);
      return json(snap);
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
