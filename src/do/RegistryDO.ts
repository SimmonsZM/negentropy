// RegistryDO — identities, tokens, and home-system claims (M2c).
// A conscious deviation from the GDD's D1 plan: at alpha scale a single
// registry DO gives the same code path with zero provisioning friction.
// D1 replaces this when accounts outgrow it. Tokens are stored ONLY as
// SHA-256 hashes; the plaintext is returned exactly once, at mint.

import { allSystems } from "../sim/starmap.js";
import { sha256Hex } from "../sim/support.js";

export interface Identity {
  name: string;
  systemId: string;
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

    if (req.method === "GET" && url.pathname === "/list") {
      const claims = (await this.ctx.storage.get<Record<string, string>>("claims")) ?? {};
      return json({ claims, claimable: claimable() });
    }

    return json({ error: "not found" }, 404);
  }
}
