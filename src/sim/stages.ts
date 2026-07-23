// Stage engine — the nine-fold climb, in-domain (Deep Dive §14, §GDD-3.2).
// M1.5 landed Survive; M2a lands Connect. Each gate is a *feat*, never XP:
// Survive is a sustained budget window; Connect is decoding a foreign beacon
// (the deep dive's solo path — "contact/decode feats"). Control's gate ships
// in a later batch; the stage exists so Connect has somewhere to complete to.

export type Stage = "survive" | "connect" | "control";

/** Deep Dive §16: "Stage-1 & turbulence stability window | 8 ticks". */
export const SURVIVE_STREAK_TARGET = 8;

/** UI-facing "Name (n/9)" labels; the API and dashboard read these, not the raw id. */
export const STAGE_LABELS: Record<Stage, string> = {
  survive: "Survive (1/9)",
  connect: "Connect (2/9)",
  control: "Control (3/9)",
};

export interface StageEvents {
  dStore: number;
  decodedNew: boolean; // a foreign beacon was decoded this tick
}

export interface StageResult {
  stage: Stage;
  positiveStreak: number;
  completedLog?: string; // present exactly on the tick a stage completes
}

/** Advance the stage machine given this tick's events.
 * Pure and integer-only. Rungs are never un-earned (stable access, not peak). */
export function advanceStage(
  stage: Stage,
  positiveStreak: number,
  ev: StageEvents,
  t: number,
): StageResult {
  if (stage === "survive") {
    const streak = ev.dStore > 0 ? positiveStreak + 1 : 0;
    if (streak >= SURVIVE_STREAK_TARGET) {
      return {
        stage: "connect",
        positiveStreak: streak,
        completedLog: `[t${t}] STAGE COMPLETE: Survive — the rock holds`,
      };
    }
    return { stage, positiveStreak: streak };
  }

  if (stage === "connect" && ev.decodedNew) {
    return {
      stage: "control",
      positiveStreak,
      completedLog: `[t${t}] STAGE COMPLETE: Connect — another mind's voice, understood`,
    };
  }

  return { stage, positiveStreak };
}
