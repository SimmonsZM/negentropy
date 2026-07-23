// Negentropy worker entry — REST /v1/*, bearer auth, cron tick engine.
// The API is the game (GDD pillar 5); this file is deliberately thin.
// M2a: the world is a starmap; observation of neighbors is light-lagged.

import { SIM_VERSION, TICK_SECONDS } from "./sim/core.js";
import { STAGE_LABELS, type Stage } from "./sim/stages.js";
import { allSystems, getSystem, laneLag, neighborsOf } from "./sim/starmap.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import type { Env } from "./do/SystemDO.js";
export { SystemDO } from "./do/SystemDO.js";

const HOME = "wei-9-home"; // M2a: single identity, fixed home. D1 identities land in M2b.

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
    if (!env.DEV_TOKEN || auth !== `Bearer ${env.DEV_TOKEN}`) {
      return json({ error: "unauthorized" }, 401);
    }

    const t = currentTick(env);
    const homeFetch = (path: string, init?: RequestInit) =>
      stubFor(env, HOME).fetch(`https://do${path}?sys=${HOME}&toTick=${t}`, init);

    if (req.method === "GET" && (url.pathname === "/v1/self" || url.pathname === "/v1/systems/home")) {
      const r = await homeFetch("/state");
      const { sim, chain, rules } = (await r.json()) as any;
      if (url.pathname === "/v1/self") {
        const undecoded = (sim.receivedSignals as any[]).filter(
          (x) => !x.decoded && !(sim.decodedFrom as string[]).includes(x.from),
        ).length;
        return json({
          identity: "wei-9",
          realm: "Embodied",
          stage: STAGE_LABELS[sim.stage as Stage] ?? sim.stage,
          sights: ["flow"],
          sim_version: SIM_VERSION,
          ap: sim.ap,
          tick: sim.tick,
          signals: { held: sim.receivedSignals.length, undecoded, decoded_from: sim.decodedFrom },
          chain_head: chain,
          rule_slots: { used: rules.length, max: 4, locked: rules.filter((x: any) => x.locked).length },
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

    // Light-lagged observation of a neighbor: you see them as they WERE.
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
