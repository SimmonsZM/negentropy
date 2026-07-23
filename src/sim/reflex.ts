// Reflex language v1 — The Wider Tongue (M2h). Trigger → conditions → actions.
// No loops, no self-modification; expressions reference only metrics the
// identity legitimately observes (fog enforced in the language itself).
// v1 widens all three parts: more channels, EVENT triggers fed by last
// tick's phase-4/5 outcomes, and actions that are ORDERS — reflex actions
// execute through the exact validation path manual orders use, at 0 AP.
// Your automation obeys the same physics you do.

export type MetricKey =
  | "system.flux"
  | "self.store" | "self.temp" | "self.margin"
  | "self.panels" | "self.damaged" | "self.ap"
  | "self.isotopes" | "self.alloy" | "self.committed";

/** Events raised by phases 4–5 of tick N, visible to triggers at tick N+1.
 * Deterministic: the buffer is state, hashed and chained like everything. */
export type ReflexEvent =
  | "message_received.hail"
  | "message_received.beacon"
  | "cargo_received"
  | "order_filled"
  | "fill_bounced"
  | "forecast_resolved.true"
  | "forecast_resolved.false";

/** A neighbor's book as recorded at the live edge (lagged, fog-honest). */
export type PublicBook = Array<{ id: number; side: string; good: string; qty: number; price_milli: number }>;
export type NeighborBooks = Record<string, PublicBook>;

export type Trigger =
  | { type: "tick" }
  | { type: "threshold_crossed"; metric: MetricKey; op: ">" | "<"; value: number }
  | { type: "event"; event: ReflexEvent }
  | { type: "market"; system: string; side: "bid" | "ask"; good: "isotopes" | "alloy"; op: ">" | "<"; price_milli: number };

export type Cond =
  | { lhs: MetricKey; op: ">" | "<" | ">=" | "<=" | "=="; rhs: number }
  | { not: Cond }
  | { all: Cond[] }
  | { any: Cond[] };

/** Reflex actions ARE orders (minus AP). alert is the one pure exception. */
export type Action =
  | { type: "set_throttle"; target: "collectors"; value_milli: number }
  | { type: "set_radiator_temp"; value_milli: number }
  | { type: "repair_systems" }
  | { type: "burn_isotopes" }
  | { type: "place_order"; side: "bid" | "ask"; good: "isotopes" | "alloy"; qty: number; price_milli: number }
  | { type: "fill_order"; system: string; order_id: number | "best"; qty: number; side: "bid" | "ask"; good: "isotopes" | "alloy"; price_milli: number }
  | { type: "alert"; message: string };

export interface Rule {
  id: string;
  priority: number; // higher fires first
  trigger: Trigger;
  conditions?: Cond[];
  actions: Action[];
  cooldown_ticks?: number;
  locked?: boolean; // Embodied instincts (Deep Dive §14): present, running, not yet yours to edit
}

export type Metrics = Record<MetricKey, number>;

function evalCond(c: Cond, m: Metrics): boolean {
  if ("not" in c) return !evalCond(c.not, m);
  if ("all" in c) return c.all.every((x) => evalCond(x, m));
  if ("any" in c) return c.any.some((x) => evalCond(x, m));
  const v = m[c.lhs] ?? 0;
  switch (c.op) {
    case ">": return v > c.rhs;
    case "<": return v < c.rhs;
    case ">=": return v >= c.rhs;
    case "<=": return v <= c.rhs;
    case "==": return v === c.rhs;
  }
}

/** Best resting price on a side: asks quote low (min), bids quote high (max). */
export function bestPrice(book: PublicBook | undefined, side: string, good: string): number | undefined {
  const prices = (book ?? []).filter((o) => o.side === side && o.good === good).map((o) => o.price_milli);
  if (!prices.length) return undefined;
  return side === "ask" ? Math.min(...prices) : Math.max(...prices);
}

function triggered(t: Trigger, prev: Metrics, cur: Metrics, events: ReflexEvent[], books: NeighborBooks): boolean {
  if (t.type === "tick") return true;
  if (t.type === "event") return events.includes(t.event);
  if (t.type === "market") {
    const p = bestPrice(books[t.system], t.side, t.good);
    if (p === undefined) return false; // silence — nothing heard is nothing fired
    return t.op === "<" ? p < t.price_milli : p > t.price_milli;
  }
  const p = prev[t.metric] ?? 0;
  const c = cur[t.metric] ?? 0;
  return t.op === ">" ? p <= t.value && c > t.value : p >= t.value && c < t.value;
}

/** Deterministic evaluation: priority desc, then id asc. One pass per tick.
 * Returns fired actions in order; the caller runs them as 0-AP orders. */
export function evaluate(
  rules: Rule[],
  prev: Metrics,
  cur: Metrics,
  tick: number,
  ruleMeta: Record<string, number>,
  events: ReflexEvent[] = [],
  books: NeighborBooks = {},
): { actions: Action[]; fired: string[] } {
  const ordered = [...rules].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  const actions: Action[] = [];
  const fired: string[] = [];
  for (const r of ordered) {
    const last = ruleMeta[r.id] ?? -1_000_000;
    if (r.cooldown_ticks && tick - last < r.cooldown_ticks) continue;
    if (!triggered(r.trigger, prev, cur, events, books)) continue;
    if (r.conditions && !r.conditions.every((c) => evalCond(c, cur))) continue;
    actions.push(...r.actions);
    fired.push(r.id);
    ruleMeta[r.id] = tick;
  }
  return { actions, fired };
}

/** Static complexity score (metered rule budget, Deep Dive §5).
 * Consequential actions cost more than nudges; alerts are nearly free. */
const ACTION_WEIGHT: Record<Action["type"], number> = {
  alert: 0,
  set_throttle: 1,
  set_radiator_temp: 1,
  burn_isotopes: 2,
  repair_systems: 2,
  place_order: 3,
  fill_order: 3,
};

const TRIGGER_WEIGHT = (t: Trigger): number => (t.type === "market" ? 2 : 0); // sensing beyond the self costs

export function ruleCost(r: Rule): number {
  const condCost = (c: Cond): number =>
    "not" in c ? 1 + condCost(c.not)
    : "all" in c ? 1 + c.all.reduce((s, x) => s + condCost(x), 0)
    : "any" in c ? 1 + c.any.reduce((s, x) => s + condCost(x), 0)
    : 1;
  const actCost = r.actions.reduce((s, a) => s + 1 + ACTION_WEIGHT[a.type], 0);
  return 1 + TRIGGER_WEIGHT(r.trigger) + (r.conditions ?? []).reduce((s, c) => s + condCost(c), 0) + actCost;
}

export function defaultInstincts(): Rule[] {
  return [
    {
      id: "instinct-overheat-guard",
      priority: 100,
      locked: true,
      trigger: { type: "threshold_crossed", metric: "self.temp", op: ">", value: 600 },
      actions: [
        { type: "set_throttle", target: "collectors", value_milli: 0 },
        { type: "alert", message: "INSTINCT: overheat — collectors cut" },
      ],
    },
    {
      id: "instinct-starvation-warning",
      priority: 90,
      locked: true,
      trigger: { type: "threshold_crossed", metric: "self.store", op: "<", value: 50 },
      actions: [{ type: "alert", message: "INSTINCT: exergy store critical" }],
    },
  ];
}
