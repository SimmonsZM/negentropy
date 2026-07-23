// Negentropy worker entry — REST /v1/*, bearer auth, cron tick engine.
// The API is the game (GDD pillar 5); this file is deliberately thin.

import { SIM_VERSION, TICK_SECONDS } from "./sim/core.js";
import { STAGE_LABELS, type Stage } from "./sim/stages.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import type { Env } from "./do/SystemDO.js";
export { SystemDO } from "./do/SystemDO.js";

const SYSTEM_NAME = "wei-9-home"; // M1: single system. Registry lands with D1 in M2.

function currentTick(env: Env, nowMs = Date.now()): number {
  const genesis = Number(env.GENESIS_EPOCH);
  return Math.max(0, Math.floor((nowMs / 1000 - genesis) / TICK_SECONDS));
}

function stub(env: Env) {
  return env.SYSTEM_DO.get(env.SYSTEM_DO.idFromName(SYSTEM_NAME));
}

const OPENAPI = {
  openapi: "3.0.3",
  info: { title: "Negentropy API", version: "0.1.0" },
  paths: {
    "/v1/self": { get: { summary: "Identity, realm, AP, chain head" } },
    "/v1/systems/home": { get: { summary: "Observed system state (fog by omission)" } },
    "/v1/orders": { post: { summary: "Queue orders for the next tick (AP-metered)" } },
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
    const doFetch = (path: string, init?: RequestInit) =>
      stub(env).fetch(`https://do${path}?toTick=${t}`, init);

    if (req.method === "GET" && (url.pathname === "/v1/self" || url.pathname === "/v1/systems/home")) {
      const r = await doFetch("/state");
      const { sim, chain, rules } = (await r.json()) as any;
      if (url.pathname === "/v1/self") {
        return json({
          identity: "wei-9",
          realm: "Embodied",
          stage: STAGE_LABELS[sim.stage as Stage] ?? sim.stage,
          sights: ["flow"],
          sim_version: SIM_VERSION,
          ap: sim.ap,
          tick: sim.tick,
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
        log_tail: sim.log.slice(-20),
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/orders") {
      return doFetch("/orders", { method: "POST", body: await req.text(), headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/v1/reflexes") {
      if (req.method === "GET") {
        const r = await doFetch("/state");
        const { rules } = (await r.json()) as any;
        return json(rules);
      }
      if (req.method === "PUT") {
        return doFetch("/rules", { method: "PUT", body: await req.text(), headers: { "content-type": "application/json" } });
      }
    }

    return json({ error: "not found" }, 404);
  },

  // The tick engine: cron pokes active systems; cold ones catch up on contact.
  async scheduled(_ctl: ScheduledController, env: Env): Promise<void> {
    await stub(env).fetch(`https://do/state?toTick=${currentTick(env)}`);
  },
} satisfies ExportedHandler<Env>;
