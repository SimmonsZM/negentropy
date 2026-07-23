// Genesis state, lazy catch-up, and the audit hash chain (Deep Dive §1).

import { resolve } from "./resolve.js";
import type { SystemDef } from "./starmap.js";
import type { Rule } from "./reflex.js";
import type { Envelope, Order, SimState } from "./types.js";

export function genesisState(): SimState {
  return {
    tick: 0,
    phaseAngle: 0,
    store_eu: 500,
    heatBank_eu: 0,
    ap: 10,
    structures: {
      collectors: { throttle_milli: 500 },
      radiators: { panels: 8, t_rad_milli: 1000 },
    },
    damaged: false,
    metricsPrev: {},
    ruleMeta: {},
    log: ["[t0] genesis — a cold rock, a dim star, a mind that persists"],
    ledger: { tick: 0, intake_eu: 0, dStore_eu: 0, heatRadiated_eu: 0, dHeatBank_eu: 0, built_eu: 0, transmitted_eu: 0, flare: false },
    stage: "survive",
    positiveStreak: 0,
    receivedSignals: [],
    decodedFrom: [],
    outbox: [],
    realm: "embodied",
    migrationCooldownUntil: 0,
    verbsUsed: [],
    sentHail: false,
    gotHail: false,
    harmonizeCooldownUntil: 0,
    forecasts: [],
    forecastSeq: 0,
    flareRing: [],
    calibration: { n: 0, total_milli: 0 },
    stock: { isotopes: 0, alloy: 0 },
    book: [],
    bookSeq: 0,
    committedEu: 0,
    reflexEvents: [],
    sanctifyCooldownUntil: 0,
    bargainDebtUntil: 0,
    handsOffStreak: 0,
    mastery: {},
    usageRing: [],
    techCooldowns: {},
    buffs: { cryo_until: 0, shield_until: 0, weave_next: false, mend_at: 0 },
    burnActive: false,
  };
}

/** Lazy catch-up: replay ticks with no orders. Deterministic and cheap
 * (thousands of ticks per second). Closed-form skip of event-free spans is a
 * planned optimization — the replay IS the correctness reference either way. */
export function fastForward(
  s: SimState,
  rules: Rule[],
  seedKey: number,
  toTick: number,
  ordersByTick?: Map<number, Order[]>,
  sys?: SystemDef,
  inboxByTick?: Map<number, Envelope[]>,
): SimState {
  let cur = s;
  while (cur.tick < toTick) {
    const orders = ordersByTick?.get(cur.tick + 1) ?? [];
    const due = inboxByTick?.get(cur.tick + 1) ?? [];
    cur = resolve(cur, orders, rules, seedKey, sys, due);
  }
  return cur;
}

// ---- Canonical hashing (audit chain) ----

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function stateHash(s: SimState): Promise<string> {
  return sha256Hex(stableStringify(s));
}

/** chain_t = H(chain_{t-1} ∥ H(inputs) ∥ H(state_t)) — tamper-evident tick log. */
export async function chainLink(prevLink: string, inputsJson: string, stateHashHex: string): Promise<string> {
  return sha256Hex(`${prevLink}|${await sha256Hex(inputsJson)}|${stateHashHex}`);
}
