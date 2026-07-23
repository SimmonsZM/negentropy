// Starmap — the world graph, loaded from content-as-data (GDD §11.4).
// Systems carry their own physics parameters; lanes carry light-lag.
// Validation runs at module load so a bad data file fails loudly at deploy.

import raw from "../data/starmap.json";
import { MIN_LANE_LAG } from "./core.js";

export interface SystemDef {
  id: string;
  metallicity_milli: number; // your star is your periodic table (Deep Dive §5.9)
  name: string;
  class: string;
  base_flux_eu: number;
  flare_per_mille: number;
  beacon: boolean;
}

export interface Lane {
  a: string;
  b: string;
  lag_ticks: number;
}

const systems: SystemDef[] = raw.systems;
const lanes: Lane[] = raw.lanes;

// ---- Validation (fail at load, not at tick) ----
{
  const ids = new Set(systems.map((s) => s.id));
  if (ids.size !== systems.length) throw new Error("starmap: duplicate system id");
  for (const l of lanes) {
    if (!ids.has(l.a) || !ids.has(l.b)) throw new Error(`starmap: lane references unknown system ${l.a}—${l.b}`);
    if (l.lag_ticks < MIN_LANE_LAG) {
      throw new Error(`starmap: lane ${l.a}—${l.b} lag ${l.lag_ticks} < MIN_LANE_LAG ${MIN_LANE_LAG}`);
    }
  }
  for (const s of systems) {
    if (s.base_flux_eu <= 0 || s.flare_per_mille < 0 || s.flare_per_mille >= 1000) {
      throw new Error(`starmap: system ${s.id} has invalid physics`);
    }
    if (s.metallicity_milli < 100 || s.metallicity_milli > 3000) {
      throw new Error(`starmap: system ${s.id} has invalid metallicity`);
    }
  }
}

export function allSystems(): SystemDef[] {
  return systems;
}

export function getSystem(id: string): SystemDef | undefined {
  return systems.find((s) => s.id === id);
}

/** Direct-lane neighbors of a system, with the lag to each. */
export function neighborsOf(id: string): Array<{ sys: SystemDef; lag_ticks: number }> {
  const out: Array<{ sys: SystemDef; lag_ticks: number }> = [];
  for (const l of lanes) {
    const other = l.a === id ? l.b : l.b === id ? l.a : null;
    if (other) {
      const sys = getSystem(other);
      if (sys) out.push({ sys, lag_ticks: l.lag_ticks });
    }
  }
  return out.sort((x, y) => (x.sys.id < y.sys.id ? -1 : 1));
}

export function laneLag(a: string, b: string): number | undefined {
  const l = lanes.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  return l?.lag_ticks;
}
