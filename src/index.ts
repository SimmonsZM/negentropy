// Negentropy worker entry — REST /v1/*, bearer auth, cron tick engine.
// The API is the game (GDD pillar 5); this file is deliberately thin.
// M2a: the world is a starmap; observation of neighbors is light-lagged.

import { SIM_VERSION, TICK_SECONDS } from "./sim/core.js";
import { REALM_LABELS, SIGHTS_BY_REALM, SLOTS_BY_REALM, STAGE_LABELS, type Realm, type Stage } from "./sim/stages.js";
import { allSystems, getSystem, laneLag, neighborsOf } from "./sim/starmap.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import type { Env } from "./do/SystemDO.js";
export { SystemDO } from "./do/SystemDO.js";
export { RegistryDO } from "./do/RegistryDO.js";
import { sha256Hex } from "./sim/support.js";

// Identities live in the RegistryDO (M2c). DEV_TOKEN remains the admin key
// and maps to the founding identity, so the original token keeps working.

function currentTick(env: Env, nowMs = Date.now()): number {
  const genesis = Number(env.GENESIS_EPOCH);
  return Math.max(0, Math.floor((nowMs / 1000 - genesis) / TICK_SECONDS));
}

function stubFor(env: Env, systemId: string) {
  return env.SYSTEM_DO.get(env.SYSTEM_DO.idFromName(systemId));
}

const OPENAPI = {
  openapi: "3.0.3",
  info: { title: "Negentropy API", version: "0.2.0" },
  paths: {
    "/v1/self": { get: { summary: "Identity, realm, stage, AP, signals, chain head" } },
    "/v1/map": { get: { summary: "The known starmap: systems, lanes, lags, decode status" } },
    "/v1/systems/home": { get: { summary: "Your home system, live (fog by omission)" } },
    "/v1/systems/{id}": { get: { summary: "A neighbor's thermal signature, as it WAS (light-lagged)" } },
    "/v1/orders": {
      post: { summary: "Queue orders for the next tick (AP-metered, horizon-capped)" },
      get: { summary: "Orders already queued for upcoming ticks" },
      delete: { summary: "Clear queued orders for a tick (default: next)" },
    },
    "/v1/reflexes": { get: { summary: "List rules" }, put: { summary: "Replace rules (costs AP; instincts locked)" } },
    "/v1/webhook": {
      put: { summary: "Arm the Watchtower: https URL (a raw Discord webhook works natively)" },
      get: { summary: "Watchtower status" },
      delete: { summary: "Disarm" },
    },
    "/v1/spec": { get: { summary: "This document" } },
  },
} as const;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v, null, 2), { status, headers: { "content-type": "application/json" } });

    if (url.pathname === "/healthz") return json({ ok: true, tick: currentTick(env) });
    if (url.pathname === "/v1/spec") return json(OPENAPI);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
      return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!bearer || !env.DEV_TOKEN) return json({ error: "unauthorized" }, 401);

    let ident: { name: string; systemId: string; admin: boolean };
    if (bearer === env.DEV_TOKEN) {
      ident = { name: "wei-9", systemId: "wei-9-home", admin: true };
    } else {
      const reg = env.REGISTRY_DO.get(env.REGISTRY_DO.idFromName("registry"));
      const r = await reg.fetch(`https://do/auth?h=${await sha256Hex(bearer)}`);
      if (r.status !== 200) return json({ error: "unauthorized" }, 401);
      const found = (await r.json()) as { name: string; systemId: string };
      ident = { name: found.name, systemId: found.systemId, admin: false };
    }

    const t = currentTick(env);
    const HOME = ident.systemId;
    const homeFetch = (path: string, init?: RequestInit) =>
      stubFor(env, HOME).fetch(`https://do${path}?sys=${HOME}&toTick=${t}`, init);

    // Admin: mint a new mind. Token is returned exactly once — hand it over.
    if (req.method === "POST" && url.pathname === "/v1/admin/identities") {
      if (!ident.admin) return json({ error: "admin only" }, 403);
      const reg = env.REGISTRY_DO.get(env.REGISTRY_DO.idFromName("registry"));
      return reg.fetch("https://do/mint", { method: "POST", body: await req.text(), headers: { "content-type": "application/json" } });
    }

    if (req.method === "GET" && (url.pathname === "/v1/self" || url.pathname === "/v1/systems/home")) {
      const r = await homeFetch("/state");
      const { sim, chain, rules } = (await r.json()) as any;
      if (url.pathname === "/v1/self") {
        const undecoded = (sim.receivedSignals as any[]).filter(
          (x) => !x.decoded && !(sim.decodedFrom as string[]).includes(x.from),
        ).length;
        const realm = (sim.realm ?? "embodied") as Realm;
        return json({
          identity: ident.name,
          realm: REALM_LABELS[realm],
          stage: STAGE_LABELS[sim.stage as Stage] ?? sim.stage,
          sights: SIGHTS_BY_REALM[realm],
          sim_version: SIM_VERSION,
          ap: sim.ap,
          tick: sim.tick,
          signals: { held: sim.receivedSignals.length, undecoded, decoded_from: sim.decodedFrom },
          calibration: sim.calibration ?? { n: 0, total_milli: 0 },
          turbulence: sim.turbulence ?? null,
          trial: sim.trial
            ? { kind: sim.trial.kind, ends_tick: sim.trial.endTick, you: sim.trial.playerWealth, copy: sim.trial.mirror.wealth }
            : null,
          migration_cooldown_until: sim.migrationCooldownUntil,
          chain_head: chain,
          rule_slots: { used: rules.length, max: SLOTS_BY_REALM[realm], locked: rules.filter((x: any) => x.locked).length },
        });
      }
      // Fog by omission: only Flow-Sight fields leave the server (GDD §12.0, DD §14).
      return json({
        tick: sim.tick,
        phase_angle: sim.phaseAngle,
        flows: { store_eu: sim.store_eu, heat_bank_eu: sim.heatBank_eu, ledger: sim.ledger },
        structures: sim.structures,
        damaged: sim.damaged,
        signals: sim.receivedSignals.slice(-8),
        stock: sim.stock ?? { isotopes: 0, alloy: 0 },
        trial: sim.trial
          ? {
              kind: sim.trial.kind,
              started_tick: sim.trial.startedTick,
              ends_tick: sim.trial.endTick,
              you_wealth: sim.trial.playerWealth,
              copy_wealth: sim.trial.mirror.wealth,
              copy_damaged: sim.trial.mirror.damaged,
              bar: 1200,
            }
          : null,
        harmonize: sim.harmonize ?? null,
        turbulence: sim.turbulence ?? null,
        forecasts: (sim.forecasts ?? []).slice(-12),
        calibration: sim.calibration ?? { n: 0, total_milli: 0 },
        realm: sim.realm ?? "embodied",
        stage: sim.stage,
        migration_cooldown_until: sim.migrationCooldownUntil ?? 0,
        log_tail: sim.log.slice(-20),
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/map") {
      const r = await homeFetch("/state");
      const { sim } = (await r.json()) as any;
      const decoded: string[] = sim.decodedFrom ?? [];
      return json({
        home: HOME,
        systems: allSystems().map((s) => ({
          id: s.id,
          name: s.name,
          class: s.class,
          lag_ticks: s.id === HOME ? 0 : laneLag(HOME, s.id) ?? null,
          decoded: decoded.includes(s.id),
        })),
        neighbors: neighborsOf(HOME).map((n) => ({ id: n.sys.id, lag_ticks: n.lag_ticks })),
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/book") {
      const r = await homeFetch("/state");
      const { sim } = (await r.json()) as any;
      return json({ tick: sim.tick, book: sim.book ?? [], committed_eu: sim.committedEu ?? 0 });
    }

    // Light-lagged observation of a neighbor: you see them as they WERE.
    const bookMatch = url.pathname.match(/^\/v1\/systems\/([a-z0-9-]+)\/book$/);
    if (req.method === "GET" && bookMatch) {
      const id = bookMatch[1];
      const sys = getSystem(id);
      if (!sys) return json({ error: "unknown system" }, 404);
      const lag = laneLag(HOME, id);
      if (lag === undefined) return json({ error: "too faint — no direct lane" }, 404);
      const asOf = t - lag;
      const target = stubFor(env, id);
      await target.fetch(`https://do/state?sys=${id}&toTick=${t}`);
      const snapR = await target.fetch(`https://do/snapshot?sys=${id}&at=${asOf}`);
      if (snapR.status !== 200) return json({ error: "too faint — that light has passed" }, 404);
      const snap = (await snapR.json()) as any;
      return json({ system: id, lag_ticks: lag, as_of_tick: asOf, book: snap.book ?? [] });
    }

    const sysMatch = url.pathname.match(/^\/v1\/systems\/([a-z0-9-]+)$/);
    if (req.method === "GET" && sysMatch) {
      const id = sysMatch[1];
      const sys = getSystem(id);
      if (!sys) return json({ error: "unknown system" }, 404);
      const lag = laneLag(HOME, id);
      if (lag === undefined) return json({ error: "too faint — no direct lane from Amber Reach" }, 404);
      const asOf = t - lag;
      const target = stubFor(env, id);
      await target.fetch(`https://do/state?sys=${id}&toTick=${t}`); // ensure their light has been emitted
      const snapR = await target.fetch(`https://do/snapshot?sys=${id}&at=${asOf}`);
      if (snapR.status !== 200) return json({ error: "too faint — that light has passed" }, 404);
      const snap = (await snapR.json()) as any;
      return json({
        system: { id: sys.id, name: sys.name, class: sys.class },
        lag_ticks: lag,
        as_of_tick: asOf,
        signature: { radiated_eu: snap.radiated_eu, flare: snap.flare, phase_angle: snap.phase_angle },
        note: "thermal signature only — you observe heat, never holdings (stealth is heat)",
      });
    }

    if (url.pathname === "/v1/orders") {
      if (req.method === "POST") {
        return homeFetch("/orders", { method: "POST", body: await req.text(), headers: { "content-type": "application/json" } });
      }
      if (req.method === "GET") {
        const r = await homeFetch("/state");
        const { sim, pending } = (await r.json()) as any;
        return json({ tick: sim.tick, pending: pending ?? [] });
      }
      if (req.method === "DELETE") {
        return homeFetch("/orders", { method: "DELETE", body: await req.text(), headers: { "content-type": "application/json" } });
      }
    }
    if (url.pathname === "/v1/webhook") {
      if (req.method === "GET") return homeFetch("/webhook");
      if (req.method === "PUT" || req.method === "DELETE") {
        return homeFetch("/webhook", { method: req.method, body: await req.text(), headers: { "content-type": "application/json" } });
      }
    }
    if (url.pathname === "/v1/reflexes") {
      if (req.method === "GET") {
        const r = await homeFetch("/state");
        const { rules } = (await r.json()) as any;
        return json(rules);
      }
      if (req.method === "PUT") {
        return homeFetch("/rules", { method: "PUT", body: await req.text(), headers: { "content-type": "application/json" } });
      }
    }

    return json({ error: "not found" }, 404);
  },

  // The tick engine: cron advances every mapped system so emissions are
  // real-time and mail can never target a peer's past (MIN_LANE_LAG >= 2).
  async scheduled(_ctl: ScheduledController, env: Env): Promise<void> {
    const t = currentTick(env);
    for (const s of allSystems()) {
      await stubFor(env, s.id).fetch(`https://do/state?sys=${s.id}&toTick=${t}`);
    }
  },
} satisfies ExportedHandler<Env>;
