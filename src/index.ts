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
import { FEATS, REF_PRICE, SEASON_END_TICK, SEASON_ID, computeSeason, featPointsMilli, type SeasonComponents } from "./season.js";
import { aspectsOf, pathOf, TECHNIQUES } from "./sim/aspects.js";

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
    "/v1/season": { get: { summary: "Standings: wealth 50 · feats 20 · calibration 15 · conduct 15" } },
    "/v1/wallfacer": {
      get: { summary: "All sealed strategies (hashes always; texts once revealed)" },
      post: { summary: "commit {sha-256 hex} | reveal {plaintext} — the server never sees unsealed strategy" },
    },
    "/v1/spec": { get: { summary: "This document" } },
  },
} as const;

async function readJsonBody(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return null; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v, null, 2), { status, headers: { "content-type": "application/json" } });

    if (url.pathname === "/healthz") return json({ ok: true, tick: currentTick(env) });
    if (url.pathname === "/v1/spec") return json(OPENAPI);
    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }
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

    const registry = () => env.REGISTRY_DO.get(env.REGISTRY_DO.idFromName("registry"));

    // ---- Sects (M2j): banner at the registry, vault at the hall ----
    if (url.pathname === "/v1/sect") {
      if (req.method === "GET") {
        const r = await registry().fetch("https://do/sect", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "mine", identity: ident.name }),
        });
        return new Response(r.body, r);
      }
      if (req.method === "POST") {
        const body = ((await readJsonBody(req)) ?? {}) as { action?: string; name?: string; charter?: string };
        const r = await registry().fetch(`https://do/sect?hall=${ident.systemId}`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, identity: ident.name }),
        });
        return new Response(r.body, r);
      }
    }
    if (req.method === "GET" && url.pathname === "/v1/sects") {
      const r = await registry().fetch("https://do/sects");
      return new Response(r.body, r);
    }

    // ---- The Season (M3a): a read layer over the audited world ----
    if (req.method === "GET" && url.pathname === "/v1/season") {
      const listR = await registry().fetch("https://do/list");
      const { claims } = (await listR.json()) as { claims: Record<string, string> };
      const holders: Array<{ identity: string; systemId: string }> = [
        { identity: "wei-9", systemId: "wei-9-home" },
        ...Object.entries(claims).map(([systemId, identity]) => ({ identity, systemId })),
      ];
      const featsR = await registry().fetch("https://do/feats");
      const { feats } = (await featsR.json()) as { feats: Record<string, Array<{ identity: string }>> };

      const rows: SeasonComponents[] = [];
      for (const h of holders) {
        const r = await stubFor(env, h.systemId).fetch(`https://do/state?sys=${h.systemId}&toTick=${t}`);
        const { sim } = (await r.json()) as any;
        const wealth =
          (sim.store_eu ?? 0) +
          REF_PRICE.panel * (sim.structures?.radiators?.panels ?? 0) +
          REF_PRICE.alloy * ((sim.stock?.alloy ?? 0) + (sim.vault?.alloy ?? 0)) +
          REF_PRICE.isotope * ((sim.stock?.isotopes ?? 0) + (sim.vault?.isotopes ?? 0));
        let featMilli = 0;
        for (const [featId, claimants] of Object.entries(feats)) {
          const idx = claimants.findIndex((c) => c.identity === h.identity);
          if (idx >= 0) featMilli += featPointsMilli(FEATS[featId] ?? 0, idx + 1);
        }
        rows.push({
          identity: h.identity,
          wealth_eu: wealth,
          feats_milli: featMilli,
          calibration_milli: Math.max(0, sim.calibration?.total_milli ?? 0),
          conduct_milli: 1000,
        });
      }
      return json({
        season: SEASON_ID,
        tick: t,
        ends_tick: SEASON_END_TICK,
        ticks_remaining: Math.max(0, SEASON_END_TICK - t),
        weights: "wealth 50 · feats 20 · calibration 15 · conduct 15",
        standings: computeSeason(rows),
      });
    }

    if (url.pathname === "/v1/wallfacer") {
      if (req.method === "GET") {
        const r = await registry().fetch("https://do/wallfacer");
        return new Response(r.body, r);
      }
      if (req.method === "POST") {
        const body = ((await readJsonBody(req)) ?? {}) as { action?: string; commit?: string; reveal?: string };
        const r = await registry().fetch("https://do/wallfacer", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, identity: ident.name, t }),
        });
        return new Response(r.body, r);
      }
    }

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
          vault: sim.vault ?? null,
          aspects: aspectsOf(getSystem(ident.systemId)!),
          mastery: sim.mastery ?? {},
          path: pathOf(sim.mastery ?? {}),
          techniques: Object.values(TECHNIQUES).map((x) => ({
            id: x.id, verb: x.verb, aspects: x.aspects, x_cost_eu: x.x_cost_eu,
            h_out_eu: x.h_out_eu, cooldown_ticks: x.cooldown_ticks,
            mastery_req_milli: x.mastery_req_milli, next_usable: sim.techCooldowns?.[x.id] ?? 0,
          })),
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
        vault: sim.vault ?? null,
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
        const raw = await req.text();
        let parsed: { orders?: Array<{ kind?: string }> } | null = null;
        try { parsed = JSON.parse(raw); } catch { /* DO will reject */ }
        const touchesVault = parsed?.orders?.some((o) => o.kind === "deposit_vault" || o.kind === "withdraw_vault");
        if (touchesVault) {
          const sr = await registry().fetch("https://do/sect", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "mine", identity: ident.name }),
          });
          const { sect } = (await sr.json()) as { sect: { founder: string; hall: string } | null };
          if (!sect) return json({ error: "vault orders need a banner — found or join a sect" }, 403);
          if (sect.founder !== ident.name) return json({ error: "only the founder keeps the vault's seal (roles come later)" }, 403);
          if (sect.hall !== ident.systemId) return json({ error: `the vault stands at ${sect.hall} — orders must issue from the hall` }, 403);
        }
        return homeFetch("/orders", { method: "POST", body: raw, headers: { "content-type": "application/json" } });
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
