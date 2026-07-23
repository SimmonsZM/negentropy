// Stage engine — the nine-fold climb, in-domain (Deep Dive §14, §GDD-3.2).
// M2f lands the lattice's playable core: gates for stages 1-7, both realms.
// Every gate is a FEAT with >=2 qualifying archetypes — never XP, never time.
// Stages 8 (Sanctify: the minor heart-demon) and 9 (Complete: witness and
// transmit) are deferred to their own build; 7 is the ceiling for now.

export type Stage =
  | "survive" | "connect" | "control" | "belong"
  | "achieve" | "understand" | "harmonize";

export const STAGE_ORDER: Stage[] = [
  "survive", "connect", "control", "belong", "achieve", "understand", "harmonize",
];

export function stageIndex(s: Stage): number {
  return STAGE_ORDER.indexOf(s);
}

/** Deep Dive §16: "Stage-1 & turbulence stability window | 8 ticks". */
export const SURVIVE_STREAK_TARGET = 8;
export const TURBULENCE_RECOVERY = 8; // consecutive stable ticks to settle the dao heart

export const STAGE_LABELS: Record<Stage, string> = {
  survive: "Survive (1/9)",
  connect: "Connect (2/9)",
  control: "Control (3/9)",
  belong: "Belong (4/9)",
  achieve: "Achieve (5/9)",
  understand: "Understand (6/9)",
  harmonize: "Harmonize (7/9)",
};

// ---- Realms ----

export type Realm = "embodied" | "foundation";

export const REALM_LABELS: Record<Realm, string> = {
  embodied: "Embodied",
  foundation: "Foundation",
};

export const SLOTS_BY_REALM: Record<Realm, number> = { embodied: 4, foundation: 8 };
export const HORIZON_BY_REALM: Record<Realm, number> = { embodied: 4, foundation: 28 };
export const SIGHTS_BY_REALM: Record<Realm, string[]> = {
  embodied: ["flow"],
  foundation: ["flow", "mirror"],
};

/** Achieve (5): pick any ONE of three posted bars, realm-scaled. */
export const ACHIEVE_BARS: Record<Realm, { store: number; panels: number; intake: number }> = {
  embodied: { store: 5000, panels: 12, intake: 900 },
  foundation: { store: 12000, panels: 16, intake: 2500 },
};

/** Understand (6): calibration gate — Deep Dive §16 "≥10 forecasts / ≥2 weeks". */
export const UNDERSTAND_MIN_CLAIMS = 10;
export const UNDERSTAND_MIN_SPAN = 56; // ticks (2 weeks) between first and last resolution

/** Everything a gate may look at this tick. Pure data, integers only. */
export interface StageSnapshot {
  dStore: number;
  decodedNew: boolean; // a foreign beacon decoded this tick
  gotHailNew: boolean; // a hail from another mind arrived this tick
  verbsUsed: number; // distinct manual order kinds ever executed
  decodedCount: number;
  sentHail: boolean;
  gotHail: boolean;
  store: number;
  panels: number;
  intake: number;
  calN: number;
  calAvg_milli: number; // total/n, floored
  calSpan: number; // last resolved tick − first resolved tick
  harmonizePassed: boolean; // a clean Harmonize window closed this tick
}

export interface StageResult {
  stage: Stage;
  positiveStreak: number;
  completedLog?: string;
}

/** One rung per tick, strictly in order — no skipping, even if several
 * conditions already hold. Rungs are never un-earned. */
export function advanceStage(
  stage: Stage,
  positiveStreak: number,
  ev: StageSnapshot,
  t: number,
): StageResult {
  const done = (next: Stage, line: string): StageResult => ({
    stage: next,
    positiveStreak,
    completedLog: `[t${t}] STAGE COMPLETE: ${line}`,
  });

  switch (stage) {
    case "survive": {
      const streak = ev.dStore > 0 ? positiveStreak + 1 : 0;
      if (streak >= SURVIVE_STREAK_TARGET) {
        return { ...done("connect", "Survive — the rock holds"), positiveStreak: streak };
      }
      return { stage, positiveStreak: streak };
    }
    case "connect":
      if (ev.decodedNew || ev.gotHailNew) {
        return done("control", "Connect — another mind's voice, understood");
      }
      return { stage, positiveStreak };
    case "control":
      if (ev.verbsUsed >= 3) {
        return done("belong", "Control — three verbs, one will");
      }
      return { stage, positiveStreak };
    case "belong":
      if ((ev.sentHail && ev.gotHail) || ev.decodedCount >= 2) {
        return done("achieve", "Belong — part of the network of voices");
      }
      return { stage, positiveStreak };
    case "achieve": {
      // Migration eligibility sits here; the bars gate the NEXT rung.
      return { stage, positiveStreak };
    }
    case "understand":
      // Promotion to Harmonize is calibration-gated and lives in resolve
      // (understandGateMet); harmonizePassed feeds the FUTURE Sanctify gate.
      return { stage, positiveStreak };
    case "harmonize":
      return { stage, positiveStreak }; // the ceiling, for now
  }
}

/** Achieve→Understand and the bars live outside the switch because both
 * realms share them and the Migration gate reads Achieve directly. */
export function achieveBarMet(realm: Realm, ev: StageSnapshot): string | null {
  const b = ACHIEVE_BARS[realm];
  if (ev.store >= b.store) return `store ≥ ${b.store}`;
  if (ev.panels >= b.panels) return `${b.panels} radiator panels`;
  if (ev.intake >= b.intake) return `single-tick intake ≥ ${b.intake}`;
  return null;
}

export function understandGateMet(ev: StageSnapshot): boolean {
  return ev.calN >= UNDERSTAND_MIN_CLAIMS && ev.calAvg_milli >= 0 && ev.calSpan >= UNDERSTAND_MIN_SPAN;
}
