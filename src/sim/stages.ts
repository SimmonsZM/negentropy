// Stage engine — the nine-fold climb, in-domain (Deep Dive §14, §GDD-3.2).
// M1.5 lands the first rung: Survive → Connect. Stage-1's gate is a *sustained*
// budget window — 8 consecutive positive-exergy ticks (Deep Dive §16 tuning) —
// never one good tick, so grab-and-hope play can't fake it.

export type Stage = "survive" | "connect";

/** Deep Dive §16: "Stage-1 & turbulence stability window | 8 ticks". */
export const SURVIVE_STREAK_TARGET = 8;

/** UI-facing "Name (n/9)" labels; the API and dashboard read these, not the raw id. */
export const STAGE_LABELS: Record<Stage, string> = {
  survive: "Survive (1/9)",
  connect: "Connect (2/9)",
};

export interface StageResult {
  stage: Stage;
  positiveStreak: number;
  completedLog?: string; // present exactly on the tick a stage completes
}

/** Advance the stage machine given this tick's net store change.
 * Pure and integer-only. Counting stops once Survive completes — a later
 * negative tick can't un-earn the rung (stability *access*, not peak, §14). */
export function advanceStage(
  stage: Stage,
  positiveStreak: number,
  dStore: number,
  t: number,
): StageResult {
  if (stage !== "survive") return { stage, positiveStreak };

  const streak = dStore > 0 ? positiveStreak + 1 : 0;
  if (streak >= SURVIVE_STREAK_TARGET) {
    return {
      stage: "connect",
      positiveStreak: streak,
      completedLog: `[t${t}] STAGE COMPLETE: Survive — the rock holds`,
    };
  }
  return { stage, positiveStreak: streak };
}
