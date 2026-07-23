// Aspects, techniques, mastery — the cultivation layer (GDD §5.3, DD §4).
// Your local physics IS your available madra: availability derives entirely
// from the star you were given. Mastery grows by VARIETY, not repetition —
// identical use decays toward zero gain, so grinding is mechanically
// pointless and comprehension-through-variation is the only way up.
// A Path is not a class you pick; it is the name your choices earn.

import { mix, roll } from "./core.js";
import type { SystemDef } from "./starmap.js";

export type Aspect =
  | "plasma" | "gravitic" | "cryo" | "photonic"
  | "material" | "informational" | "biotic";
// (Entropic exists in the doctrine; it opens with the Void realm, not here.)

export const ASPECTS: Aspect[] = [
  "plasma", "gravitic", "cryo", "photonic", "material", "informational", "biotic",
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Local aspect richness, 0..1000 milli — pure f(system). Deterministic,
 * integer, and asymmetric by construction: builds don't transfer. */
export function aspectsOf(sys: SystemDef): Record<Aspect, number> {
  const gravSeed = mix(0x6772, sys.id.length * 7 + sys.id.charCodeAt(0));
  return {
    plasma: clamp(sys.flare_per_mille * 4 + Math.floor(sys.base_flux_eu / 10), 0, 1000),
    photonic: clamp(Math.floor((sys.base_flux_eu * 6) / 10), 0, 1000),
    cryo: clamp(1400 - sys.base_flux_eu, 0, 1000),
    material: clamp(sys.metallicity_milli, 0, 1000),
    gravitic: 200 + roll(gravSeed, 0, 0, 600),
    informational: clamp(300 + (sys.beacon ? 250 : 0) + (120 - sys.flare_per_mille), 0, 1000),
    biotic: clamp(1000 - Math.abs(sys.base_flux_eu - 1000) - sys.flare_per_mille * 2, 0, 1000),
  };
}

/** A technique: verb + 1..3 aspects, mastery requirements, exergy cost,
 * waste-heat output, cooldown. The (x − h) difference is embodied work. */
export interface Technique {
  id: string;
  verb: string;
  aspects: Aspect[];
  mastery_req_milli: number; // required in EACH listed aspect
  richness_req_milli: number; // your sky must speak the aspect at all
  x_cost_eu: number;
  h_out_eu: number;
  cooldown_ticks: number;
  line: string; // the log's voice
}

export const TECHNIQUES: Record<string, Technique> = {
  harvest_plasma: {
    id: "harvest_plasma", verb: "harvest", aspects: ["plasma"],
    mastery_req_milli: 0, richness_req_milli: 250,
    x_cost_eu: 80, h_out_eu: 30, cooldown_ticks: 4,
    line: "the storm bends into the collectors",
  },
  attune_cryo: {
    id: "attune_cryo", verb: "attune", aspects: ["cryo"],
    mastery_req_milli: 0, richness_req_milli: 250,
    x_cost_eu: 120, h_out_eu: 20, cooldown_ticks: 8,
    line: "the radiators drink the deep cold",
  },
  weave_material: {
    id: "weave_material", verb: "weave", aspects: ["material"],
    mastery_req_milli: 0, richness_req_milli: 250,
    x_cost_eu: 100, h_out_eu: 40, cooldown_ticks: 6,
    line: "the lattice remembers a finer pattern",
  },
  mend_biotic: {
    id: "mend_biotic", verb: "mend", aspects: ["biotic"],
    mastery_req_milli: 0, richness_req_milli: 250,
    x_cost_eu: 90, h_out_eu: 10, cooldown_ticks: 8,
    line: "the hull knits, slowly, the way living things do",
  },
  shield_gravitic_material: {
    id: "shield_gravitic_material", verb: "shield", aspects: ["gravitic", "material"],
    mastery_req_milli: 150, richness_req_milli: 250,
    x_cost_eu: 150, h_out_eu: 50, cooldown_ticks: 12,
    line: "mass curves around the panels like a held breath",
  },
  sense_photonic_informational: {
    id: "sense_photonic_informational", verb: "sense", aspects: ["photonic", "informational"],
    mastery_req_milli: 150, richness_req_milli: 250,
    x_cost_eu: 60, h_out_eu: 10, cooldown_ticks: 6,
    line: "the light folds, and the star's next temper is legible",
  },
};

/** Mastery grows by variety (DD §4): gain = g0 · novelty, where novelty
 * compares this use's CONTEXT against recent history. c prior identical
 * contexts in the ring → 1000 / (1 + c²): 1000, 500, 200, 100, 59… */
export const MASTERY_G0_MILLI = 40; // base gain at full novelty and full richness
export const USAGE_RING_MAX = 32;
export const MASTERY_MAX = 1000;

export function noveltyMilli(sig: string, ring: string[]): number {
  const c = ring.filter((s) => s === sig).length;
  return Math.floor(1000 / (1 + c * c));
}

export function masteryGain(novelty_milli: number, richness_milli: number): number {
  return Math.floor((MASTERY_G0_MILLI * novelty_milli * richness_milli) / 1_000_000);
}

/** The Path: the name your top masteries earn. Read-layer identity — the
 * doc's three canonical names are honored; the rest keep their register. */
const PATH_NAMES: Record<string, string> = {
  "cryo+photonic": "Patient Ice",
  "material+plasma": "Forge Tyrant",
  "informational+photonic": "Whisper Cartographer",
  "biotic+material": "Gardener of the Lattice",
  "cryo+material": "Cold Smith",
  "plasma+photonic": "Lantern-Forge",
  "gravitic+material": "Keeper of Weight",
  "informational+material": "Archivist of Ore",
  "biotic+photonic": "Heliotrope",
  "cryo+informational": "Still Listener",
  "gravitic+photonic": "Lens Bender",
  "biotic+cryo": "Winter Warden",
  "gravitic+informational": "Tide Reader",
  "biotic+informational": "Root Whisperer",
  "plasma+material": "Forge Tyrant",
  "cryo+plasma": "Storm-Quencher",
  "gravitic+plasma": "Flare Shepherd",
  "biotic+gravitic": "Deep Gardener",
  "informational+plasma": "Storm Cartographer",
  "material+photonic": "Bright Smith",
  "biotic+plasma": "Fire Tender",
  "cryo+gravitic": "Glacier Anchor",
};

export function pathOf(mastery: Partial<Record<Aspect, number>>): string | null {
  const ranked = ASPECTS
    .map((a) => ({ a, m: mastery[a] ?? 0 }))
    .filter((x) => x.m >= 100)
    .sort((x, y) => y.m - x.m || (x.a < y.a ? -1 : 1));
  if (!ranked.length) return null;
  if (ranked.length === 1) return `Adept of ${ranked[0].a[0].toUpperCase()}${ranked[0].a.slice(1)}`;
  const pair = [ranked[0].a, ranked[1].a].sort().join("+");
  return PATH_NAMES[pair] ?? `Walker of ${pair}`;
}
