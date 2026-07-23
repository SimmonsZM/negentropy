// RegistryDO — identities, tokens, and home-system claims (M2c).
// A conscious deviation from the GDD's D1 plan: at alpha scale a single
// registry DO gives the same code path with zero provisioning friction.
// D1 replaces this when accounts outgrow it. Tokens are stored ONLY as
// SHA-256 hashes; the plaintext is returned exactly once, at mint.

import { allSystems } from "../sim/starmap.js";
import { FEATS } from "../season.js";
import { sha256Hex } from "../sim/support.js";

export interface Identity {
  name: string;
  systemId: string;
  created_t: number;
}

export interface Sect {
  name: string;
  charter: string;
  founder: string; // identity name
  hall: string; // system id — the vault lives HERE, physically
  members: string[];
  created_t: number;
}

/** Systems a new mind may claim: not beacon worlds, not the first home. */
function claimable(): string[] {
  return allSystems()
    .filter((s) => !s.beacon && s.id !== "wei-9-home")
    .map((s) => s.id);
}

export class RegistryDO {
  constructor(private ctx: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v, null, 2), { status, headers: { "content-type": "application/json" } });

    // Auth lookup: token hash -> identity. The worker computes the hash;
    // plaintext tokens never reach this object after minting.
    if (req.method === "GET" && url.pathname === "/auth") {
      const h = url.searchParams.get("h") ?? "";
      const ident = await this.ctx.storage.get<Identity>(`id:${h}`);
      if (!ident) return json({ error: "unknown identity" }, 404);
      return json(ident);
    }

    if (req.method === "POST" && url.pathname === "/mint") {
      let body: { name?: string } | null = null;
      try { body = (await req.json()) as { name?: string }; } catch { /* noop */ }
      const name = (body?.name ?? "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(name)) {
        return json({ error: "name must be 2-24 chars: a-z, 0-9, hyphens" }, 400);
      }
      const names = (await this.ctx.storage.get<string[]>("names")) ?? [];
      if (names.includes(name) || name === "wei-9") return json({ error: "name taken" }, 409);

      const claims = (await this.ctx.storage.get<Record<string, string>>("claims")) ?? {};
      const free = claimable().filter((id) => !claims[id]);
      if (!free.length) return json({ error: "no unclaimed systems — the map must grow first" }, 409);
      const systemId = free[0];

      // 256 bits of Web Crypto randomness; shown once, stored only as a hash.
      const raw = new Uint8Array(32);
      crypto.getRandomValues(raw);
      const token = [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
      const h = await sha256Hex(token);

      const ident: Identity = { name, systemId, created_t: Date.now() };
      claims[systemId] = name;
      names.push(name);
      await this.ctx.storage.put(`id:${h}`, ident);
      await this.ctx.storage.put("claims", claims);
      await this.ctx.storage.put("names", names);
      return json({ minted: ident, token, note: "this token is shown exactly once" });
    }

    // ---- Sects (M2j): the banner half — membership. The vault half is
    // physical state at the hall system, moved only by orders there. ----
    if (url.pathname === "/sect") {
      const body = (await (async () => { try { return await req.json(); } catch { return {}; } })()) as
        { action?: string; identity?: string; name?: string; charter?: string };
      const sects = (await this.ctx.storage.get<Record<string, Sect>>("sects")) ?? {};
      const who = (body.identity ?? "").trim();
      const mine = Object.values(sects).find((x) => x.members.includes(who));

      if (req.method === "GET" || body.action === "mine") {
        return json({ sect: mine ?? null });
      }
      if (req.method !== "POST") return json({ error: "POST required" }, 405);

      if (body.action === "found") {
        const name = (body.name ?? "").trim();
        if (!/^[a-z0-9][a-z0-9- ]{2,31}$/.test(name)) return json({ error: "sect name: 3-32 chars, a-z 0-9 - space" }, 400);
        if (sects[name]) return json({ error: "banner already flies" }, 409);
        if (mine) return json({ error: `you already serve ${mine.name}` }, 409);
        const hall = url.searchParams.get("hall") ?? "";
        if (!hall) return json({ error: "hall required" }, 400);
        const charter = (body.charter ?? "").slice(0, 500).trim();
        sects[name] = { name, charter, founder: who, hall, members: [who], created_t: Date.now() };
        await this.ctx.storage.put("sects", sects);
        return json({ founded: sects[name] });
      }
      if (body.action === "join") {
        const target = sects[(body.name ?? "").trim()];
        if (!target) return json({ error: "no such banner" }, 404);
        if (mine) return json({ error: `you already serve ${mine.name}` }, 409);
        target.members.push(who);
        await this.ctx.storage.put("sects", sects);
        return json({ joined: target });
      }
      if (body.action === "leave") {
        if (!mine) return json({ error: "you serve no banner" }, 404);
        if (mine.founder === who && mine.members.length > 1) {
          return json({ error: "a founder cannot abandon a living sect" }, 409);
        }
        mine.members = mine.members.filter((m) => m !== who);
        if (mine.members.length === 0) delete sects[mine.name];
        await this.ctx.storage.put("sects", sects);
        return json({ left: true });
      }
      return json({ error: "action: found | join | leave | mine" }, 400);
    }

    // ---- Feats (M3a): the world's serializer. First come, largest share. ----
    if (req.method === "POST" && url.pathname === "/feat") {
      const body = (await (async () => { try { return await req.json(); } catch { return {}; } })()) as
        { systemId?: string; featId?: string; t?: number };
      const featId = body.featId ?? "";
      if (!(featId in FEATS)) return json({ error: "unknown feat" }, 400);
      const sysId = body.systemId ?? "";
      const claims = (await this.ctx.storage.get<Record<string, string>>("claims")) ?? {};
      const identity = sysId === "wei-9-home" ? "wei-9" : claims[sysId];
      if (!identity) return json({ error: "unclaimed system earns no feats" }, 404);
      const feats = (await this.ctx.storage.get<Record<string, Array<{ identity: string; t: number }>>>("feats")) ?? {};
      const list = feats[featId] ?? [];
      if (list.some((c) => c.identity === identity)) return json({ duplicate: true });
      list.push({ identity, t: body.t ?? 0 });
      feats[featId] = list;
      await this.ctx.storage.put("feats", feats);
      return json({ recorded: featId, rank: list.length });
    }
    if (req.method === "GET" && url.pathname === "/feats") {
      const feats = (await this.ctx.storage.get<Record<string, Array<{ identity: string; t: number }>>>("feats")) ?? {};
      return json({ feats });
    }

    // ---- Wallfacer (M3a): sealed strategy, commit-reveal (Deep Dive §13).
    // The registry stores HASHES; the plaintext never passes this way until
    // its author reveals it against their own commitment. ----
    if (url.pathname === "/wallfacer") {
      const body = (await (async () => { try { return await req.json(); } catch { return {}; } })()) as
        { action?: string; identity?: string; commit?: string; reveal?: string; t?: number };
      const who = (body.identity ?? "").trim();
      const wf = (await this.ctx.storage.get<Record<string, { commit: string; committed_t: number; reveal?: string; revealed_t?: number }>>("wallfacer")) ?? {};

      if (req.method === "GET" || body.action === "all") {
        return json({ wallfacers: wf });
      }
      if (req.method !== "POST") return json({ error: "POST required" }, 405);
      if (body.action === "commit") {
        if (wf[who]) return json({ error: "your wall is already faced — one sealed strategy per season" }, 409);
        const commit = (body.commit ?? "").toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(commit)) return json({ error: "commit must be a sha-256 hex digest" }, 400);
        wf[who] = { commit, committed_t: body.t ?? 0 };
        await this.ctx.storage.put("wallfacer", wf);
        return json({ committed: true, at_tick: wf[who].committed_t });
      }
      if (body.action === "reveal") {
        const mine = wf[who];
        if (!mine) return json({ error: "nothing was sealed" }, 404);
        if (mine.reveal) return json({ error: "already revealed — the record is immutable" }, 409);
        const nowT = body.t ?? 0;
        if (nowT - mine.committed_t < 112) {
          return json({ error: `the wall keeps its own counsel for 28 days — reveal opens at t${mine.committed_t + 112}` }, 403);
        }
        const text = body.reveal ?? "";
        const salt = (body as { salt?: string }).salt ?? "";
        const digest = async (input: string) => {
          const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
          return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
        };
        const salted = await digest(salt + "\n" + text);
        const legacy = await digest(text); // pre-Phase-0 seals were unsalted
        if (salted !== mine.commit && legacy !== mine.commit) {
          return json({ error: "the reveal does not match the seal — that is not what you committed" }, 400);
        }
        mine.reveal = text;
        mine.revealed_t = nowT;
        await this.ctx.storage.put("wallfacer", wf);
        return json({ revealed: true });
      }
      return json({ error: "action: commit | reveal | all" }, 400);
    }

    if (req.method === "GET" && url.pathname === "/sects") {
      const sects = (await this.ctx.storage.get<Record<string, Sect>>("sects")) ?? {};
      return json({
        sects: Object.values(sects).map((x) => ({ name: x.name, hall: x.hall, members: x.members.length, charter: x.charter })),
      });
    }

    if (req.method === "GET" && url.pathname === "/list") {
      const claims = (await this.ctx.storage.get<Record<string, string>>("claims")) ?? {};
      return json({ claims, claimable: claimable() });
    }

    return json({ error: "not found" }, 404);
  }
}
