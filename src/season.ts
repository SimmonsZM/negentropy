// Season scoring (M3a) — a READ layer over the audited world (Deep Dive §11).
// The sim never sees this; the chain stays sovereign. Weights 50/20/15/15:
// wealth, feats, calibration, conduct. Feats decay by claim order — base/√rank —
// so the first to a rung takes the history-book share.

export interface FeatDef {
  id: string;
  base: number;
}

/** Feat ids are `${stage}_${realm}` plus the crossings. */
export const FEATS: Record<string, number> = {
  survive_embodied: 10, connect_embodied: 15, control_embodied: 20, belong_embodied: 25,
  achieve_embodied: 40, understand_embodied: 60, harmonize_embodied: 80,
  sanctify_embodied: 120, complete_embodied: 200,
  survive_foundation: 20, connect_foundation: 30, control_foundation: 40, belong_foundation: 50,
  achieve_foundation: 80, understand_foundation: 120, harmonize_foundation: 160,
  sanctify_foundation: 240, complete_foundation: 400,
  migration_pass: 300,
};

/** nth claimant (rank 1-based) earns base/√rank, in millipoints. */
export function featPointsMilli(base: number, rank: number): number {
  return Math.floor((base * 1000) / Math.sqrt(Math.max(1, rank)));
}

/** Reference prices for stewardship's held-order component (eu per unit).
 * The market may disagree; the season's yardstick does not move mid-season. */
export const REF_PRICE = { panel: 150, alloy: 50, isotope: 10 };

export interface SeasonComponents {
  identity: string;
  stewardship_eu: number; // net exergy created − destroyed: builders score (DD §11)
  feats_milli: number;
  calibration_milli: number; // max(0, total)
  mandate_milli: number; // taught into existence — 0 until master–disciple (Phase 5)
  wallfacer_mult_milli: number; // ×1.5 on sealed objectives — hook, 1000 until Phase 8
}

export interface SeasonRow extends SeasonComponents {
  score_milli: number;
  rank: number;
}

const W = { feats: 500, stewardship: 200, mandate: 150, calibration: 150 } as const; // DD §11, exactly

/** Normalize each component against the field's best, weight, rank.
 * Deterministic given inputs; ties break by identity name. */
export function computeSeason(rows: SeasonComponents[]): SeasonRow[] {
  const top = {
    stewardship: Math.max(1, ...rows.map((r) => r.stewardship_eu)),
    feats: Math.max(1, ...rows.map((r) => r.feats_milli)),
    cal: Math.max(1, ...rows.map((r) => r.calibration_milli)),
    mandate: Math.max(1, ...rows.map((r) => r.mandate_milli)),
  };
  const scored = rows.map((r) => ({
    ...r,
    score_milli: Math.floor((
      Math.floor((W.feats * r.feats_milli) / top.feats) +
      Math.floor((W.stewardship * r.stewardship_eu) / top.stewardship) +
      Math.floor((W.mandate * r.mandate_milli) / top.mandate) +
      Math.floor((W.calibration * r.calibration_milli) / top.cal)
    ) * r.wallfacer_mult_milli / 1000),
    rank: 0,
  }));
  scored.sort((a, b) => b.score_milli - a.score_milli || (a.identity < b.identity ? -1 : 1));
  scored.forEach((r, i) => (r.rank = i + 1));
  return scored;
}

export const SEASON_ID = "season-0";
export const SEASON_END_TICK = 1152; // ~day 288 of the genesis year
