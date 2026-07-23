# NEGENTROPY — Master Build Plan v1.0
## From the current tree (21 commits, 99 tests) to the complete game
### 2026-07-23 · companion to GDD v0.7 + Deep Dive v0.5 + Travel Spec v0.1

**Definition of done:** every mechanic named in the GDD and Deep Dive exists,
the divergence list is resolved by ruling or by code, and the reference
client is rebuilt LAST against the finished feature set. Order below is
dependency order — each phase consumes what the previous one built.

**Unit of estimation:** one *session* = one build-night of tonight's caliber
(≈8–13 shipped patches, full test discipline). Total: **~22–28 sessions.**

**Standing disciplines (every phase, non-negotiable):** behavioral pin
survival · replay/hash equality on every state-model change · grep-audit
after every scripted patch · the dashboard-integrity instrument · honest
disclosure commits · verify origin after every "done" · open `/` after
every deploy.

**Honesty clause:** phases 4, 5, 8, and parts of 6 can be BUILT solo but
only VALIDATED by population. The GDD's own alpha bar (20 players, 2 weeks,
≥1 contested objective) sits after Phase 5. Building everything first is a
legitimate choice — but tuning debt accrues silently until humans arrive.

---

## Phase 0 — ALIGNMENT (0.5–1 session) — *the divergence list dies first*

The audit found nine places where implementation contradicts the doc.
Cheap fixes ship immediately; contradictions of intent get **rulings**.

Code (no ruling needed):
- Control gate → three distinct **technique** verbs (techniques now exist)
- Survive gains the "heat margin >10%" clause (both realms)
- Panel failure → quadratic `p₀·T_r²` per DD§2
- Wallfacer: salt in the client-side hash · 28-day (112-tick) minimum seal
  age before reveal · sealed-objective ×1.5 hook stubbed into season scoring
- Turbulence: ≥30%-infrastructure-mass-loss trigger added; **slot tranches**
  implemented (entry / Control / Harmonize per realm) and turbulence
  suspends the TOP tranche, not forecasts-only
- Sanctify completed to spec: keep the Hollow as flavor, but the gate
  becomes (a) personalized heart-demon — generator ingests the identity's
  own failure log (overheats, busted forecasts, lost trials), re-manifests
  the dominant pattern at ×0.5 amplitude — plus (b) replace one inherited
  instinct with an authored rule, live 8 ticks
- Complete (9): solo paths per spec — scored retrospective (a calibrated
  insight record over your own logs) OR realm-scale first-solve; the
  16-silent-ticks capstone demotes to a feat; mentor path arrives Phase 5

RULINGS REQUIRED (founder, consolidated):
1. **Season weights** — bend to spec (0.50 Feats · 0.20 Stewardship ·
   0.15 Mandate · 0.15 Calibration) or amend the doc to the shipped
   wealth-primary formula? Plan assumes SPEC WINS: Stewardship metric
   (net exergy created − destroyed) built here; Mandate slot reads 0 until
   Phase 5.
2. Genesis-home special status · guest AP fraction · turbulent departure
   (travel spec §10).
3. Relic grade baseline bootstrap (Phase 7): seeded synthetic baseline
   with disclosure, or raw properties until population exists?
4. **Open-core boundary (§11.3): the repo is PUBLIC and contains every
   trial generator and the default seed.** Spec says generators + seeds
   private or breakthroughs become walkthrough-able. Options: private
   repo · extract generators to a private module · accept at tiny
   population and split before alpha. Must be decided before Phase 4.

Exit: divergence list empty or ruled; tests grow to cover each fix.

## Phase 1 — TRAVEL & THE MIND/PLACE SPLIT (2–3 sessions)

Execute `docs/negentropy-travel-spec-v0.1.md` exactly as staged:
M5a projections proven inert → M5b split storage proven by fused-vs-split
replay equality on a production-shaped fixture → M5c depart/transit/arrive
(mind envelopes, untended places, passports) → M5d hall-docking, sect
roles (treasurer real at last), Belong's sect path via recorded inputs.
Exit: the eight test obligations in spec §9 all green; wei-9's history
byte-identical through the representation change.

## Phase 2 — WORLD PHYSICS: BODIES & SKY (2–3 sessions)

The DD§3 layer the starmap never got:
- Keplerian closed-form orbits (positions = f(t), never integrated) ·
  companions (0–2) · body/debris tables · resonances + tidal-lock flags
  with mechanical effects (stable harvest windows, locked-face gradients)
- **Chaotic eras**: hierarchical-triple stability scores; calm/chaotic
  epochs; the published forecast horizon shrinks with chaos depth
  (Lyapunov, taught by feel) — Foresight and order-queues respect it
- Exotic classes: WD/NS/BH — pulsar timing (free precision clocks),
  magnetar bursts (rare-event windows Phase 7 relics will hunt),
  accretion jackpots, tides
- **Synodic lane costs** `base·align(t)` — travel learns transfer windows
- Wormhole junctions as rare fixed edges (seasonal scarce objectives)
- Aspect availability upgraded to include bodies (outer ice → Cryo per
  spec); **system generation becomes content-as-data + seeded rolls**
  (the hand-authored six become the curated core of a generated map)
Exit: a 20+ system generated map; catch-up still <1s cold; chaos horizon
visibly bites a test system's Foresight.

## Phase 3 — SENSING, STEALTH & DECEPTION (1.5–2 sessions)

DD§7 in full — pre-conflict infrastructure:
- Signature S ≈ H_radiated · sensor classes: passive-thermal (cheap,
  coarse, stale) / active (X-cost, high-res, **you shine while sensing**) /
  gravitic (sees mass, expensive, keeps stealth honest)
- Stealth verbs: heat-banking as a countdown · directional radiation
  (geometry vs. a second observer) · smallness
- **Decoy emitters**: fidelity × duration X-cost — deception as budget line
- Scan orders + sensor reflexes (`signature_detected` trigger from the
  spec's v0 list finally lands)
Exit: two-DO test where a decoy fools passive sensing, active sensing
unmasks it, and the scanner was seen scanning.

## Phase 4 — CONFLICT (2.5–3 sessions) ⚠ open-core ruling gates this

GDD§4.4 + §5.6 + DD§8, complete:
- 3-tick protocol (declaration visible → maneuver, defender reflexes live
  → deterministic resolution); nothing meaningful lost asleep
- ATK/DEF/MOB derived from techniques + infrastructure; initiative by MOB
- **Weapons make heat**: DPS decays as radiators saturate — thermal
  endurance contests; engineered margins win long exchanges
- Fortification multiplies DEF; home light-lag intel edge; retreat = MOB
  check per tick; **wrecks not deletions** (salvage/derelicts feed the map)
- Insurance contracts priced by en-route piracy risk (economy hook)
- Conduct scoring becomes real (feeds season if ruling 1 keeps a conduct
  term; else feeds Arbiter adjudication)
- Dimensional-strike + scar MACHINERY built now, Void-gated until Phase 6
Exit: a full 3-tick engagement between two DOs, replayed hash-exact, with
a wreck on the map and a bounced retreat.

## Phase 5 — SOCIETY: CHARTERS, MANDATE, CONTRACTS, CODEX (2–2.5 sessions)

- **Charters compile to the reflex grammar at sect scope** (DD§9): dues %,
  treasury permissions, admission (`vouches ≥ n`, `realm ≥ r`), roles,
  disciplinary automata — one language, governance included
- **Master–disciple**: X-stake escrow per disciple (cap 3) · disciple feats
  mint **Mandate** for the master · washout burns stake · Mandate
  untradeable — only taught into existence; Complete's mentor path opens;
  season's Mandate term goes live
- Contracts v1: shipping · insurance (Phase 4 pricing) · **futures on
  forecastable physics** (flare seasons, chaos windows, alignments) —
  calibration meets money
- **The Codex**: content-as-data entries (≤120 words, event-unlocked, the
  DD§13 voice) · **interiority fog** — per-identity koan fragments for
  above-Sight entries, true text never transmitted
Exit: a charter auto-collects dues and auto-rejects an under-vouched
applicant; a disciple's feat mints Mandate; first ten codex entries fire
on their triggering events.

— **THE ALPHA GATE sits here** (GDD M2 bar): ~20 players, 2 weeks,
≥1 contested objective, ≥5 breakthroughs, median session <20 min. Every
phase after this builds on tuning data the plan cannot fake. —

## Phase 6 — THE UPPER REALMS (2.5–3 sessions)

- **Core**: fusion substrate · **Ignition** exactly per DD§10 (fuel isotope
  mix Z-dependent, 12 ticks, ≥50 MW stable, 80% uptime, seeded flare +
  impurity + micro-failure) · **Loop Sight** (`self.causal_graph`, loop
  metrics legal in reflex conditions) · horizon 336 · 16 slots in tranches
- **Stellar**: swarm substrate · **Distribution** (fork across light-lag,
  re-cohere — consumes Phase 1's multi-presence machinery) · **Mind Sight**
  (`project(actor)` constraint envelopes from public data only) · 1008 · 32
- **Void**: **Dark Forest Choice** tribulation (hide/shine, consumes
  Phase 3 signatures) · **Field Sight** (strategy-distribution telemetry,
  in-fiction) · **Entropic aspect** unlocks · ∞ horizon · 64 slots ·
  dimensional strikes un-gate
- **Field-level Sight gating in the API** (DD§14): every response field
  carries a minimum Sight; below it, absent — fog applied vertically
Exit: a test identity walks Embodied→Core through a passing Ignition;
Sight-gated fields provably absent below threshold.

## Phase 7 — RELICS: THE SACRED CRAFT (2.5–3 sessions)

DD§15 complete, on the now-warm substrate:
- Blueprint = {lattice (3–4 symmetry families v0, grammar extensible),
  composition (your metallicity table), **infusions (ordered aspect
  injections, path-dependent state machine — order matters like real
  metallurgy)**, scale}
- Forge schedules **authored in the reflex grammar at forge scope**,
  20–100+ ticks, 1–2-tick quench windows, seeded perturbations, rare-event
  infusions (Phase 2's magnetar bursts become expedition content)
- Properties EMERGE from the materials sim — no recipe table anywhere;
  failed forges yield flawed-but-storied objects
- Grades = σ beyond season craft baseline (ruling 3) · attunement caps
  1/2/3 + sect banner · upkeep → dormancy → ruins → expeditions ·
  **fame is signature** (grade-scaled emissions into Phase 3's sensors) ·
  immutable provenance ledger
Exit: two identities forge the same blueprint under different stars and
get measurably different objects; a quench missed by one tick ruins a melt.

## Phase 8 — SEASON MACHINERY & ASCENSION (1.5–2 sessions)

- Scarce-objective generation per season (the magnetar, junctions,
  first-solve list, famous/fallen relics) · Heavenly Rankings contested
  over them · Wallfacer ×1.5 on sealed objectives goes live ·
  **Wallbreaking** (public declaration, Arbiter-judged semantic match,
  stolen multiplier, public wrong calls)
- Season-end ceremony: rankings freeze → **Ascension**: top players become
  **Arbiters** (tribulation parameter seeding, replay-based dispute
  adjudication, objective curation — *cannot touch live sim state*) ·
  world persists (scars, relics, ruins, sect histories) · rankings reset
- Archaeology: ruins/wrecks/dormant relics as expedition content
Exit: a full simulated season-end on a test world: freeze, ascend, reset,
persist — hash-audited.

## Phase 9 — PLATFORM & GOVERNANCE HARDENING (1.5–2 sessions)

- **D1**: accounts · identities · systems_registry · seasons · rankings ·
  commitments · patrons (RegistryDO's tenants graduate)
- KV public snapshots (rankings/maps/markets, tick-aligned TTLs) · R2
  replay archives · full OpenAPI document · webhook broadening
- Moderation: allow/deny + report queue + Arbiter review (charters, names,
  relic maker-marks)
- **Telemetry, published**: strategy-population distributions ·
  breakthrough pass rates by archetype · median session · cost per active
  player (the §12.3 commitments)
- Patron ledger · naming queue · stelae (recognition, never goods)
- Ops: WORLD_SEED_SECRET armed · open-core split executed per ruling 4 ·
  cost verified <$20/mo at 100-player load test
Exit: GDD M3 "done when" satisfiable the moment humans arrive.

## Phase 10 — THE FRONTEND, FINALIZED (2.5–3 sessions) — *last, by design*

The reference client rebuilt once, against the finished game:
- **Information architecture**: the one-page card pile becomes navigated
  views — Helm · Sky (orbits animated from f(t), bodies, lanes, signatures)
  · Market (books, contracts, futures) · Sect (charter editor = reflex
  grammar UI) · Forge (schedule authoring + live melt telemetry) · Codex
  (reader + locked koan shards) · Season (rankings, wall, objectives) ·
  Self (mastery, Path, Sights, logs)
- **Sight-gated rendering** (the API already withholds; the client renders
  absence gracefully) · conflict views for the 3-tick protocol · transit
  states · mobile-usable · static SPA moved to Pages per spec
- Reference-client polish is the LAST feature: empty states, onboarding
  arc (open question #9 — staging the 1→4 recapitulation), the first-hour
  experience
- **Client-dev kit**: full OpenAPI + an example TUI, per the M3 bar
Exit: a new player completes Embodied 1–4 in the client without docs;
a week of play is possible via curl alone (the original acceptance test,
still true).

---

## Sequencing rationale (why this order and no other)

Alignment first because divergences compound. Travel before everything
social (roles, mentorship, Distribution all consume presence). Bodies
before sensing (things to see), sensing before conflict (detection before
war), conflict before deep society (insurance, conduct, charters'
disciplinary triggers need stakes). Realms after society (Distribution
needs travel; Mandate feeds Stellar advancement). Relics after realms and
bodies (rare events, forge-scope reflexes, upper-realm patrons). Season
machinery after there are objectives worth contesting. Platform when the
shapes stop moving. **Frontend absolutely last** — every earlier client
hour is rework; the current dashboard remains the builder's instrument
until Phase 10 retires it with honors.

## The ledger of honesty

- ~22–28 sessions of tonight's intensity. At one session per week: half a
  year. The plan does not pretend otherwise.
- Phases 4/5/8 built solo are machinery awaiting witnesses; their numbers
  are guesses until the alpha gate, and the plan schedules re-tuning there
  rather than promising first-try balance.
- Two organs stay deliberately thin even at "complete": proof-of-personhood
  and WASM reflexes are P2 by the doc's own hand — architectural insurance,
  built only if their pressure appears.

*Filed at the end of the night that built the substrate, so the year that
builds the cathedral knows where every stone goes.*
