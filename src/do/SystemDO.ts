// SystemDO — one star system: state + deterministic sim + audit chain.
// Cold when unobserved; advances lazily on contact or cron (Deep Dive §1, §12).
// M2a: per-system identity (?sys=), light-lagged inbox, beacon outbox drain,
// and a public-view snapshot ring so neighbors can observe you as you WERE.

import { REFLEX_EDIT_COST, SIM_VERSION, seedFrom } from "../sim/core.js";
import { HORIZON_BY_REALM, SLOTS_BY_REALM } from "../sim/stages.js";
import { defaultInstincts, ruleCost, type NeighborBooks, type Rule } from "../sim/reflex.js";
import { chargeReflexEdit, resolve } from "../sim/resolve.js";
import { getSystem, neighborsOf } from "../sim/starmap.js";
import { WEBHOOK_MAX_FAILURES, buildDigest, notableSince, validWebhookUrl } from "./notify.js";
import { chainLink, genesisState, stableStringify, stateHash } from "../sim/support.js";
import type { Envelope, Order, SimState } from "../sim/types.js";

export interface Env {
  SYSTEM_DO: DurableObjectNamespace;
  REGISTRY_DO: DurableObjectNamespace;
  DEV_TOKEN: string;
  WORLD_SEED: string;
  WORLD_SEED_SECRET?: string; // production: `wrangler secret put WORLD_SEED_SECRET` and the sky stops being open-source
  GENESIS_EPOCH: string;
}

/** Foresight only means something if the flare schedule is not public.
 * The repo's WORLD_SEED stays as the dev/test default; the secret wins. */
export function worldSeed(env: Env): string {
  return env.WORLD_SEED_SECRET ?? env.WORLD_SEED;
}

const SNAPSHOT_RING = 12; // ticks of public history kept for lagged observation

/** What a distant observer can see of this system: its thermal signature.
 * Stealth-is-heat (Deep Dive §2/§7) — the store is NOT here by design. */
interface PublicView {
  tick: number;
  phase_angle: number;
  radiated_eu: number;
  flare: boolean;
  book: Array<{ id: number; side: string; good: string; qty: number; price_milli: number }>; // posted prices are broadcast
}

interface Persisted {
  sim: SimState;
  rules: Rule[];
  chain: string; // latest audit link
  systemId: string; // which star this DO is (M2a; pre-M2a blobs default wei-9-home)
  inbox: Envelope[]; // undelivered light-lagged mail, ordered on insert
  deliveredKeys?: string[]; // (from:emitted_t:seq) ring — idempotent delivery for ALL kinds
  webhookUrl?: string; // Watchtower (M2d): where notable events get pushed
  webhookFailures?: number;
  lastNotifiedTick?: number;
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
      if (p.sim.realm === undefined) { p.sim.realm = "embodied"; repaired = true; }
      if (p.sim.migrationCooldownUntil === undefined) { p.sim.migrationCooldownUntil = 0; repaired = true; }
      if (p.sim.forecasts === undefined) { p.sim.forecasts = []; repaired = true; }
      if (p.sim.forecastSeq === undefined) { p.sim.forecastSeq = 0; repaired = true; }
      if (p.sim.flareRing === undefined) { p.sim.flareRing = []; repaired = true; }
      if (p.sim.calibration === undefined) { p.sim.calibration = { n: 0, total_milli: 0 }; repaired = true; }
      if (p.sim.stock === undefined) { p.sim.stock = { isotopes: 0, alloy: 0 }; repaired = true; }
      if (p.sim.burnActive === undefined) { p.sim.burnActive = false; repaired = true; }
      if (p.sim.book === undefined) { p.sim.book = []; repaired = true; }
      if (p.sim.bookSeq === undefined) { p.sim.bookSeq = 0; repaired = true; }
      if (p.sim.committedEu === undefined) { p.sim.committedEu = 0; repaired = true; }
      if (p.sim.reflexEvents === undefined) { p.sim.reflexEvents = []; repaired = true; }
      if (p.sim.sanctifyCooldownUntil === undefined) { p.sim.sanctifyCooldownUntil = 0; repaired = true; }
      if (p.sim.bargainDebtUntil === undefined) { p.sim.bargainDebtUntil = 0; repaired = true; }
      if (p.sim.handsOffStreak === undefined) { p.sim.handsOffStreak = 0; repaired = true; }
      if (p.sim.mastery === undefined) { p.sim.mastery = {}; repaired = true; }
      if (p.sim.usageRing === undefined) { p.sim.usageRing = []; repaired = true; }
      if (p.sim.techCooldowns === undefined) { p.sim.techCooldowns = {}; repaired = true; }
      if (p.sim.buffs === undefined) { p.sim.buffs = { cryo_until: 0, shield_until: 0, weave_next: false, mend_at: 0 }; repaired = true; }
      if (p.sim.verbsUsed === undefined) { p.sim.verbsUsed = []; repaired = true; }
      if (p.sim.sentHail === undefined) { p.sim.sentHail = false; repaired = true; }
      if (p.sim.gotHail === undefined) { p.sim.gotHail = false; repaired = true; }
      if (p.sim.harmonizeCooldownUntil === undefined) { p.sim.harmonizeCooldownUntil = 0; repaired = true; }
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
    const seedKey = seedFrom(worldSeed(this.env), sys.id);

    while (p.sim.tick < toTick) {
      const t = p.sim.tick + 1;
      const stageBefore = p.sim.stage;
      const realmBefore = p.sim.realm;
      const orders = (await this.ctx.storage.get<Order[]>(`orders:${t}`)) ?? [];

      // This tick's mail: deterministic order (deliver_at, from, emitted_t).
      const due = p.inbox
        .filter((e) => e.deliver_at <= t)
        .sort((a, b) => a.deliver_at - b.deliver_at || (a.from < b.from ? -1 : 1) || a.emitted_t - b.emitted_t);
      p.inbox = p.inbox.filter((e) => e.deliver_at > t);

      // The Listening Market (M3d): ears open ONLY at the live edge. Each
      // heard book is a lagged snapshot; whatever is heard is RECORDED into
      // this tick's chain inputs, so replay hears exactly what live heard —
      // and catch-up ticks hear nothing, which is itself deterministic.
      let books: NeighborBooks = {};
      const hasEars = p.rules.some((r) => r.trigger.type === "market");
      if (hasEars && t === toTick) {
        for (const n of neighborsOf(p.systemId)) {
          try {
            const asOf = t - n.lag_ticks;
            if (asOf < 0) continue;
            const stub = this.env.SYSTEM_DO.get(this.env.SYSTEM_DO.idFromName(n.sys.id));
            await stub.fetch(`https://do/state?sys=${n.sys.id}&toTick=${t}`);
            const snapR = await stub.fetch(`https://do/snapshot?sys=${n.sys.id}&at=${asOf}`);
            if (snapR.status === 200) {
              const snap = (await snapR.json()) as { book?: NeighborBooks[string] };
              if (snap.book?.length) books[n.sys.id] = snap.book;
            }
          } catch { /* a deaf tick is a valid tick */ }
        }
      }

      p.sim = resolve(p.sim, orders, p.rules, seedKey, sys, due, books);

      const inputs = stableStringify({ v: SIM_VERSION, t, orders, rules: p.rules, inboxDue: due, books });
      p.chain = await chainLink(p.chain, inputs, await stateHash(p.sim));
      await this.ctx.storage.delete(`orders:${t}`);

      // Feat reporting (M3a): stage and realm crossings go to the registry,
      // the world's serializer. Best-effort; the registry dedupes.
      if (p.sim.stage !== stageBefore || p.sim.realm !== realmBefore) {
        const reg = this.env.REGISTRY_DO.get(this.env.REGISTRY_DO.idFromName("registry"));
        const report = async (featId: string) => {
          try {
            await reg.fetch("https://do/feat", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ systemId: p.systemId, featId, t }),
            });
          } catch { /* feats are best-effort history, not physics */ }
        };
        if (p.sim.realm !== realmBefore) await report("migration_pass");
        if (p.sim.stage !== stageBefore) {
          // On ascension the stage RESETS to survive; that reset is not a feat.
          if (p.sim.realm === realmBefore) await report(`${stageBefore}_${p.sim.realm}`);
        }
      }
      // The capstone has no exit transition: it fires on the sixteenth
      // silent tick at the summit. The registry dedupes repeats.
      if (p.sim.stage === "complete" && p.sim.handsOffStreak === 16) {
        const reg = this.env.REGISTRY_DO.get(this.env.REGISTRY_DO.idFromName("registry"));
        try {
          await reg.fetch("https://do/feat", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ systemId: p.systemId, featId: `complete_${p.sim.realm}`, t }),
          });
        } catch { /* best-effort */ }
      }

      // Mirror Sight's prize: once Foundation is reached, the instincts are
      // yours to author. Idempotent; the rules used each tick are chain inputs.
      if (p.sim.realm === "foundation" && p.rules.some((r) => r.locked)) {
        p.rules = p.rules.map((r) => ({ ...r, locked: false }));
      }

      // Public-view snapshot ring: what the light leaving us this tick carries.
      const snap: PublicView = {
        tick: t,
        phase_angle: p.sim.phaseAngle,
        radiated_eu: p.sim.ledger.heatRadiated_eu,
        flare: p.sim.ledger.flare,
        book: p.sim.book.map((b) => ({ id: b.id, side: b.side, good: b.good, qty: b.qty, price_milli: b.price_milli })),
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
    await this.notify(p, sys.name);
  }

  /** Watchtower: push notable lines from newly resolved ticks. Lossy by
   * contract — one attempt, failures counted, disabled after too many. */
  private async notify(p: Persisted, systemName: string): Promise<void> {
    if (!p.webhookUrl || (p.webhookFailures ?? 0) >= WEBHOOK_MAX_FAILURES) return;
    const after = p.lastNotifiedTick ?? p.sim.tick; // first save arms it forward-only
    const lines = notableSince(p.sim.log, after);
    if (p.lastNotifiedTick === undefined || p.sim.tick <= after) {
      p.lastNotifiedTick = p.sim.tick;
      await this.ctx.storage.put("p", p);
      return;
    }
    p.lastNotifiedTick = p.sim.tick;
    if (lines.length) {
      const digest = buildDigest(p.systemId, systemName, p.sim.tick, p.sim.store_eu, p.sim.heatBank_eu, lines);
      try {
        const r = await fetch(p.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(digest),
        });
        p.webhookFailures = r.ok ? 0 : (p.webhookFailures ?? 0) + 1;
      } catch {
        p.webhookFailures = (p.webhookFailures ?? 0) + 1;
      }
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
      // Idempotent delivery for every kind — including cargo, which never
      // enters the signal buffer. Key includes seq so two same-tick envelopes
      // on one lane both arrive; a retried catch-up re-sending one does not.
      const key = `${env.from}:${env.emitted_t}:${env.seq ?? 0}`;
      p.deliveredKeys ??= [];
      if (p.deliveredKeys.includes(key)) return json({ delivered_to: p.systemId, duplicate: true });
      p.deliveredKeys.push(key);
      if (p.deliveredKeys.length > 128) p.deliveredKeys.splice(0, p.deliveredKeys.length - 128);
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

    if (url.pathname === "/webhook") {
      if (req.method === "PUT") {
        const body = ((await readJson()) ?? {}) as { url?: string };
        if (!body.url || !validWebhookUrl(body.url)) return json({ error: "https URL required" }, 400);
        p.webhookUrl = body.url;
        p.webhookFailures = 0;
        p.lastNotifiedTick = p.sim.tick; // forward-only: never replay history into a fresh hook
        await this.ctx.storage.put("p", p);
        return json({ ok: true, armed_from_tick: p.sim.tick });
      }
      if (req.method === "DELETE") {
        delete p.webhookUrl;
        await this.ctx.storage.put("p", p);
        return json({ ok: true });
      }
      if (req.method === "GET") {
        return json({
          configured: !!p.webhookUrl,
          url_tail: p.webhookUrl ? "…" + p.webhookUrl.slice(-12) : null,
          failures: p.webhookFailures ?? 0,
          disabled: (p.webhookFailures ?? 0) >= WEBHOOK_MAX_FAILURES,
          last_notified_tick: p.lastNotifiedTick ?? null,
        });
      }
    }

    if (req.method === "GET" && url.pathname === "/state") {
      const pending: Array<{ tick: number; orders: Order[] }> = [];
      for (let i = 1; i <= HORIZON_BY_REALM[p.sim.realm]; i++) {
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
      const base = HORIZON_BY_REALM[p.sim.realm];
      const horizon = p.sim.turbulence ? Math.max(1, Math.floor(base / 2)) : base;
      if (target > p.sim.tick + horizon) {
        return json(
          { error: `order horizon exceeded — ${p.sim.turbulence ? "a turbulent heart sees half as far: " : ""}the ${p.sim.realm} realm may queue at most ${horizon} ticks ahead` },
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
      const slots = SLOTS_BY_REALM[p.sim.realm];
      if (incoming.length > slots) return json({ error: `max ${slots} rules at this realm` }, 400);
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
