// Reflex language v0 (Deep Dive §5): trigger → conditions → actions.
// No loops, no self-modification; expressions may only reference metrics
// the identity legitimately observes (fog enforced in the language:
// the metric set below IS the observable surface for M1).

export type MetricKey = "system.flux" | "self.store" | "self.temp" | "self.margin";

export type Trigger =
  | { type: "tick" }
  | { type: "threshold_crossed"; metric: MetricKey; op: ">" | "<"; value: number };

export type Cond =
  | { lhs: MetricKey; op: ">" | "<" | ">=" | "<=" | "=="; rhs: number }
  | { not: Cond }
  | { all: Cond[] }
  | { any: Cond[] };

export type Action =
  | { type: "set_throttle"; target: "collectors"; value_milli: number }
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
  const v = m[c.lhs];
  switch (c.op) {
    case ">": return v > c.rhs;
    case "<": return v < c.rhs;
    case ">=": return v >= c.rhs;
    case "<=": return v <= c.rhs;
    case "==": return v === c.rhs;
  }
}

function triggered(t: Trigger, prev: Metrics, cur: Metrics): boolean {
  if (t.type === "tick") return true;
  const p = prev[t.metric];
  const c = cur[t.metric];
  return t.op === ">" ? p <= t.value && c > t.value : p >= t.value && c < t.value;
}

/** Deterministic evaluation: priority desc, then id asc. One pass per tick.
 * Returns fired actions in order; caller applies them (set_throttle: last wins). */
export function evaluate(
  rules: Rule[],
  prev: Metrics,
  cur: Metrics,
  tick: number,
  ruleMeta: Record<string, number>,
): { actions: Action[]; fired: string[] } {
  const ordered = [...rules].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  const actions: Action[] = [];
  const fired: string[] = [];
  for (const r of ordered) {
    const last = ruleMeta[r.id] ?? -1_000_000;
    if (r.cooldown_ticks && tick - last < r.cooldown_ticks) continue;
    if (!triggered(r.trigger, prev, cur)) continue;
    if (r.conditions && !r.conditions.every((c) => evalCond(c, cur))) continue;
    actions.push(...r.actions);
    fired.push(r.id);
    ruleMeta[r.id] = tick;
  }
  return { actions, fired };
}

/** Static complexity score (metered rule budget, Deep Dive §5). */
export function ruleCost(r: Rule): number {
  const condCost = (c: Cond): number =>
    "not" in c ? 1 + condCost(c.not)
    : "all" in c ? 1 + c.all.reduce((s, x) => s + condCost(x), 0)
    : "any" in c ? 1 + c.any.reduce((s, x) => s + condCost(x), 0)
    : 1;
  return 1 + (r.conditions ?? []).reduce((s, c) => s + condCost(c), 0) + r.actions.length;
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
