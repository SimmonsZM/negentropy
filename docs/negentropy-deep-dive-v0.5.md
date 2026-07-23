# NEGENTROPY — Systems Deep Dive
## Companion volume to GDD v0.3 · Deep Dive v0.1 · 2026-07-20

Every layer of the GDD, taken down to mechanics: units, formulas, data shapes, worked examples. All numbers are **v0 placeholders for tuning** and are collected in §16 so tuning never means hunting through prose. Cross-references (§GDD-x) point at the master doc.

---

## 0. A worked tick (read this first)

Player **Wei-9** (Foundation realm, K-dwarf system *Amber Reach*), tick 2026-07-20T12:00Z:

| Phase | What happens |
|---|---|
| 1. Physics | Orbits advance; the K-dwarf's flare (scheduled event, seeded) hits; stellar flux ×3 for this tick |
| 2. Reflexes | Wei-9's rule `R3 "flare-harvest"` fires: trigger `threshold_crossed(flux, >, 2.0)` → actions `set_throttle(collectors, 1.0)`, `set_throttle(refinery, 0.4)` (pre-authored: harvest the flare, shed the heat) |
| 3. Orders | Wei-9's queued orders execute: 2 AP `build(radiator_panel, site_2)`, 1 AP `market_order(sell, isotopes, 40u, limit 3.1)`, 1 AP `message(sect, "flare season starting, futures underpriced")` |
| 4. Markets | Sell order partially fills (28u @ 3.15); book updates |
| 5. Events | Flare telemetry + Wei-9's message enter the queue; neighbors receive them 2–5 ticks later (light-lag) |

Wei-9 spent ~6 minutes and 4 AP. The flare harvest happened because of a rule authored last week — that's the game.

---

## 1. Simulation core

**Time.** Discrete ticks, 4/day at 00/06/12/18 UTC. Tick index `t` is global and monotonic; all state is stamped with it. Sub-tick ordering is the fixed 5-phase sequence above; within a phase, entities resolve by `(priority, entity_id)` — total order, no ties.

**Determinism.** `resolve(state_t, orders_t, inbox_t, seed_sys) → state_{t+1}` is a pure function. Floating point is banned in state-affecting math — all quantities are scaled integers (milli-units) so replay is byte-identical across platforms.

**Randomness.** Per-system seed `seed_sys = SHA256(world_seed ∥ system_id)`; per-tick stream `SHA256(seed_sys ∥ t)` via a counter-based PRNG. Events (flares, failures) are *scheduled draws*: the seed determines them in advance, so fast-forward and live play agree exactly.

**Catch-up (lazy sim).** Cold systems store `(state, last_t)`. On contact: advance orbits analytically (closed-form, §3), apply the scheduled-event list for the skipped interval, drain the inbox in `deliver_at` order, integrate linear flows (production, leakage) in one step. Rule: **no state-affecting dynamics may require per-tick iteration while unobserved.** Anything that would (e.g. combat) forces the system active.

**Audit.** Each tick logs `(inputs_hash, state_hash)` hash-chained to the previous tick. Disputes replay from logs; a mismatched chain is tamper-evidence.

---

## 2. Thermodynamic layer

**Units.** `E` energy (MJ) · `P` power (MW) · `H` heat load (MW-thermal) · `X` **exergy** (MJ-usable) — the scored resource, real engineering term for "work you can actually extract." Mass `m` (kt).

**The one conservation rule (also the anti-cheat invariant, §GDD-12.0):**

```
E_in = ΔX_stored + H_waste          (every conversion, every tick, every system)
```

Books that don't balance are a bug or an exploit; the tick asserts it.

**Conversion.** Every generator has efficiency `η < 1`: harvesting `E_in` yields `X += η·E_in`, `H += (1−η)·E_in`. Better tech raises η, never to 1. Storage leaks: `X *= (1 − λ)` per tick (λ ≈ 0.1%/tick) — the heat-death tax; hoarding is possible, stagnation isn't.

**Radiators (the Core realm's wall).** Dissipation per panel:

```
D = k · A · T_r⁴        (T_r = radiator temp in units of T₀)
```

Run hot to dump more heat per area — but component failure probability per tick rises `p_f = p₀·T_r²`, and efficiency of co-located machinery drops. Real spacecraft tradeoff, felt in play: cheap = big cool arrays (visible!), compact = hot and fragile.

**Overheat cascade.** If `H > D_total`: excess banks into `T_core`; thresholds trigger auto-throttling (your reflexes choose *what* throttles — or the sim chooses badly for you), then damage rolls. Battles are won here as often as by weapons (§8).

**Stealth is heat management** (canon, load-bearing): your detectable signature `S ≈ H_radiated_isotropic`. To hide: (a) bank heat in thermal mass — a countdown, not a state; (b) radiate directionally away from observers — geometry gameplay, defeated by a second observer at a different bearing; (c) simply be small and idle. The dark forest's hide/shine choice is literally your radiator strategy.

---

## 3. Stellar generation

**Per-system roll** (from `seed_sys`): spectral class → luminosity `L`, flare regime, lifespan risk; metallicity `Z` (0.1–3.0 ☉) → material aspect richness; companions (0–2); body/debris table; lane endpoints; resonance features.

| Class (weight) | Character in play |
|---|---|
| M (40%) | Dim, flare-prone; cryo-rich outer system; efficient long games; flare seasons are harvest + hazard |
| K, G, F (35%) | Balanced; the "temperate" strategy space |
| A, B (12%) | High flux, high instability; plasma-rich; loud, fast, hot |
| O (3%) | Enormous L, short fuse; boom-town play |
| WD / NS / BH (10%) | Exotic: pulsar timing (free precision clocks), magnetar bursts, accretion exergy jackpots, extreme tides |

**Orbits** are closed-form Keplerian ellipses — positions are `f(t)`, never integrated (catch-up requirement + honest astronomy). Resonances and tidal locking are rolled as flags with mechanical effects (stable harvest windows, locked-face thermal gradients).

**Chaotic eras.** Hierarchical triples roll a stability score; unstable systems alternate calm/chaotic epochs. During chaos, the *forecast horizon* shrinks: the sim publishes predicted body positions only `h` ticks ahead, `h` decaying with chaos depth (Lyapunov horizon, taught by feel). Thriving there = building for uncertainty — reflexes, redundancy, insurance.

**Travel.** Lanes are graph edges; traversal cost `= base · align(t)` where `align` cycles with orbital phase (synodic windows — you learn transfer timing because it's cheaper, not because a tutorial says so). Wormhole junctions are rare fixed edges — seasonal scarce objectives (§11).

---

## 4. Aspects, techniques, mastery

**v0 aspect set (8):** Plasma · Gravitic · Cryo · Photonic · Material · Informational · Biotic (Embodied/Foundation only) · Entropic (Void-realm; direct gradient manipulation — endgame, conceptual not crackpot).

**Availability** is local physics: class + Z + bodies weight which aspects exist and how richly (your star *is* your periodic table; M-dwarf outer ice = Cryo, O-star = Plasma, high-Z = Material...).

**Techniques** = verb + 1–3 aspects, e.g. `harvest(Plasma)`, `shield(Gravitic+Material)`, `sense(Photonic+Informational)`, `strike(Plasma+Photonic)` (a laser, when you unpack it). Each has aspect-mastery requirements, X cost, H output, cooldown.

**Mastery grows by variety, not repetition.** Gain per use `= g₀ · novelty`, where novelty compares context (target class, conditions, combo) against your recent usage history; identical repetition decays toward zero gain. Grinding is mechanically pointless; *comprehension through variation* is daoist, anti-bot, and pedagogically correct.

**Example Paths** (emergent identities, not classes): *Patient Ice* — Cryo+Photonic on an M-dwarf: superconductive efficiency, near-zero signature, decade energy. *Forge Tyrant* — Plasma+Material near an A-star: monstrous throughput, monstrous heat, gloriously loud. *Whisper Cartographer* — Informational+Photonic: sells maps, forecasts, and silence.

---

## 5. Reflex language v0 (the blocking spec — GDD open question #2)

A reflex is a JSON rule. No loops, no self-modification, no state except what the sim exposes; fog-of-war is enforced *in the language* — expressions can only reference fields the identity currently observes.

```json
{
  "id": "R3-flare-harvest",
  "priority": 20,
  "trigger": { "type": "threshold_crossed",
               "metric": "system.flux", "op": ">", "value": 2.0 },
  "conditions": [
    { "lhs": "self.heat_margin", "op": ">", "rhs": 0.15 },
    { "not": { "lhs": "self.status", "op": "==", "rhs": "engaged" } }
  ],
  "actions": [
    { "type": "set_throttle", "target": "collectors", "value": 1.0 },
    { "type": "set_throttle", "target": "refinery",  "value": 0.4 },
    { "type": "alert", "channel": "sect", "template": "flare_season" }
  ],
  "cooldown_ticks": 4
}
```

**Trigger set (v0):** `tick`, `threshold_crossed(metric,op,val)`, `signature_detected(filter)`, `engagement_declared`, `message_received(tag)`, `market_price(good,op,val)`, `structure_state(id,status)`.
**Conditions:** comparisons over observed fields; `and/or/not`. **Actions (v0):** `set_throttle`, `reroute`, `activate_technique`, `market_order`, `transfer`, `alert`, `queue_build`. Actions cannot create or edit rules.
**Limits:** rule slots by realm — 4 / 8 / 16 / 32 / 64 (Embodied→Void); one evaluation pass per entity per tick, priority-then-id order; per-rule static cost score against a realm budget. At Embodied, **2 of your 4 slots are pre-authored instincts you cannot yet edit** — you begin subject to your own automation, until Mirror Sight makes it object (§14). **Edits cost 1–3 AP; execution costs 0** (§GDD-4.3).

Sect charters compile to the *same grammar* at sect scope (dues, admission checks, disciplinary triggers are just rules over sect-visible state) — one language to learn, governance included.

---

## 6. Economy

**Books.** Per-system limit-order books; escrowed on placement; matched at tick phase 4 by price-time priority. **No NPC pricing anywhere.**

**Goods move as mass.** Delivery = an actual convoy on actual lanes taking actual ticks; piracy risk en route prices insurance contracts (expected value, taught by wallet). Price *data* also travels at light-lag — an arbitrage edge is literally an information edge.

**Contracts (v0):** spot, shipping, insurance, and **futures on forecastable physics** — flare seasons, chaotic-era windows, alignment cycles. Futures are where calibration skill (§10) meets money; they're also the market's forecast of the sim, visible to everyone.

**Sinks & faucets.** Faucets: stellar flux, mining, salvage. Sinks: storage leakage λ, conversion waste, tribulation costs, scarring. Net design target: mildly deflationary — exergy is precious because heaven taxes it.

**Frequency dependence is emergent, not scripted:** popular strategies move their own input prices; the scoreboard adds explicit decay (§11).

---

## 7. Information & deception

**Sensor classes.** *Passive thermal* — cheap, coarse, sees `S` (heat signatures), always stale by light-lag. *Active* — X cost, high resolution, and it shines: you are seen sensing. *Gravitic* — sees mass regardless of thermal stealth; expensive; the counter that keeps stealth honest.

**Signature spoofing.** Decoy emitters cost X proportional to fidelity × duration; a perfect fake fleet costs nearly a real fleet's power bill — deception is a budget line, not a button.

**Wallfacer mechanics (v0).** Seal: `POST /v1/commitments` with `SHA256(salt ∥ plan_text ∥ identity ∥ season)`. Reveal any time ≥ 28 days later: objectives explicitly named in the plan score ×1.5 if achieved after sealing.
**Wallbreak:** publicly file a declaration naming a target's sealed strategy. If the target's eventual reveal semantically matches (Arbiter-judged), the breaker *steals* the multiplier and Wallbreak feats; a wrong call is public and scored against you. Deduction with stakes.

---

## 8. Conflict resolution

**The 3-tick protocol** (§GDD-4.4) frames it; inside resolution:

- Committed assets carry `ATK / DEF / MOB` derived from techniques + infrastructure; initiative by MOB.
- **Weapons make heat.** Sustained output is capped by dissipation: an attacker's effective DPS decays as radiators saturate. Battles are *thermal endurance contests* — duty cycles, not alpha strikes. The player who engineered margins wins the long exchange.
- Defender edges: prepared reflexes fire first; fortification multiplies DEF; home light-lag advantage on intel.
- **Losses become wrecks, not deletions**: most destroyed mass persists as salvage/derelicts — softens loss, feeds archaeology, keeps the map storied.
- Retreat is a MOB check per tick — engagements end, sieges are a choice.

**Dimensional strikes** (Void, post-M3): colossal X cost; permanently reduce a region's aspect richness and sever lanes; the scar carries the striker's name *forever*. Mechanically strong, socially radioactive — as intended.

---

## 9. Sects & Mandate

**Charter = data + rules.** Dues %, treasury permissions, admission (`vouches ≥ n`, `realm ≥ r`), roles, and disciplinary automata — all in the reflex grammar at sect scope. Bad charters bleed members visibly; mechanism design with a scoreboard.

**Master–disciple.** Master escrows an X stake per disciple (max 3 active). Disciple feats mint **Mandate** for the master (the currency of Stellar+ advancement, §GDD-6.4); disciple washout burns stake. Mandate cannot be traded — only taught into existence.

---

## 10. Trials (generator pattern + worked example)

**Pattern.** Every trial = `generate(seed, your_system_physics, your_infra_snapshot) → scenario`, graded **only by sim outcome** over a multi-tick window. Retries: 1-week cooldown, fresh seed. Archetypes per gate ≥ 2 (engineering / calibration / contested / survival / **heart-demon**, §14) so no cognitive style is privileged.

**Worked: Ignition (Foundation → Core).**
*Generated from your system:* fuel isotope mix (Z-dependent), your radiator inventory, seeded event list.
*Task:* over 12 ticks, take a fusion core from cold to **stable ≥ 50 MW** output. Injected events (from seed): one flare, one fuel-impurity batch, one radiator micro-failure.
*Pass:* uptime ≥ 80%, zero thermal-runaway ticks.
*What actually passes it:* the stockpile you laid in, the redundancy you built, the auto-throttle reflexes you wrote, and three days of judgment calls. There is no text field where an answer could go — which is the whole AI policy (§GDD-12.4) made concrete.

---

## 11. Season scoring (Heavenly Rankings)

```
Score = 0.50·Feats + 0.20·Stewardship + 0.15·Mandate + 0.15·Calibration
```

- **Feats:** first-solves, objective holds, breakthroughs, Wallfacer/Wallbreak — each feat's value **decays with the number of achievers** (`v = v₀ / √n_achievers`): the scoreboard itself punishes meta-following.
- **Stewardship:** net exergy created minus destroyed — builders score.
- **Mandate:** teaching (§9).
- **Calibration:** proper-scoring-rule (log score) over the season's registered forecasts.

Scarce objectives per season are a generated set (the magnetar, three junctions, one first-solve list). Arbiters (ascended, §GDD-7.3) curate objectives and judge semantic calls (Wallbreaks); they cannot touch live sim state.

---

## 12. Data & architecture schemas

**D1:** `accounts` · `identities(id, account, realm, ap, slots)` · `systems_registry(system_id, last_tick, active, owner_do)` · `seasons` · `rankings` · `commitments(hash, identity, sealed_tick, revealed_tick)` · `patrons`.

**DO storage (per system):** `state` (current snapshot, scaled ints) · `orders:{t}` · `log:{t}` (hash-chained inputs) · `inbox` (sorted by `deliver_at`).

**Tick worker (pseudocode):**

```
cron(00,06,12,18 UTC):
  t = next_tick()
  for sys in registry.where(active OR has_orders(t) OR inbox_due(t)):
      sys.DO.alarm(run_tick(t))
run_tick(t):
  catch_up_if_needed(); phase_physics(); phase_reflexes()
  phase_orders(); phase_markets(); phase_dispatch()   # queues w/ delay = light-lag
  log.append(hash_chain(inputs)); registry.update(last_tick=t)
```

**Queue envelope:** `{from_sys, to_sys, emitted_t, deliver_at_t, kind, payload}` — `deliver_at_t − emitted_t` *is* the light-lag, computed from map distance.

---

## 13. Codex sample (sets the voice)

> **Why your radiators glow.** Everything that thinks or works sheds heat, and in vacuum there is only one exit: radiation. A surface sheds energy as the *fourth power* of its temperature — twice as hot is sixteen times the relief. This is why your arrays run cherry-red, why compact cores live dangerously, and why nothing in this universe truly hides while it burns. *(Unlocked: first overheat warning.)*

One entry per mechanic, ≤ 120 words, unlocked by the event that makes you care. Codex files are content-as-data (§GDD-11.4) — community-extendable, Arbiter-vetted.

---

## 14. Consciousness layer — Sights, horizons, heart-demons

**Sight gating is enforced in the API, not the client.** Every response field carries a minimum Sight; `GET /v1/self` lists your `sights[]`. Below threshold, the field is *absent*, not hidden — the fog-of-war rule (§GDD-12.0) applied vertically. Community clients cannot leak what the server never sends.

| Sight | Concrete unlocks (v0) |
|---|---|
| **Flow** (Embodied) | `system.flows` — E/H overlays per structure |
| **Mirror** (Foundation) | `self.log/*` replay access · editing of locked instinct rules (§5) · `forecasts` registry — calibration play begins |
| **Loop** (Core) | `self.causal_graph` — generated feedback map of your own economy · loop-metrics become legal in reflex conditions |
| **Mind** (Stellar) | `project(actor)` — constraint-envelope of a visible actor inferred from public data only (an inference aid, never their hidden state — no wallhacks by construction) |
| **Field** (Void) | `world.strategy_distribution` — the meta-telemetry dashboards (§GDD-12.3), in-fiction |

**Horizons.** Order-queue depth and forecast-registration depth are Sight-capped: **4 / 28 / 336 / 1008 / ∞ ticks** (1 day → 1 week → 1 season → 3 seasons → beyond). Temporal depth *is* developmental depth.

**The nine-fold climb (stages).** Every realm re-treads levels 1–9 in-domain (§GDD-3.2). Generic stage semantics, then the worked pattern:

| Stage | In-domain meaning | Gate character |
|---|---|---|
| 1 Survive | Stabilize in the new substrate | Sustained budget window |
| 2 Connect | Perceive and reach others at this scale | Contact/decode feats |
| 3 Control | Direct command of the realm's verbs | Demonstrated technique breadth · **+slot tranche** |
| 4 Belong | Integrate at this scale | Role held *or* contract fulfilled (solo path always) |
| 5 Achieve | Hit a measured bar | Pick 1 of ≥3 posted bars |
| 6 Understand | Calibrate your model of the domain | Scored forecast window |
| 7 Harmonize | Your system self-balances | Perturbation test, reflexes only · **+slot tranche** |
| 8 Sanctify | Face and re-author yourself | Minor heart-demon + reflex refactor run live |
| 9 Complete | Witness and transmit | Mentor / scored retrospective / first-solve → tribulation-eligible |

**Worked: Foundation's nine** (stage definitions are content-as-data, §GDD-11.4; this file is the pattern):
1 — 8 consecutive ticks positive X-flow, heat margin >10% on the hybrid substrate. 2 — relay built + exchanges with 2 identities, *or* decode a foreign beacon. 3 — three distinct technique verbs executed under manual order. 4 — charter role held 1 week, *or* one fulfilled contract for another identity. 5 — one of three posted bars (refine N units at η≥x / lane run under cost c / survey coverage ≥s). 6 — ≥10 registered forecasts over ≥2 weeks, log-score above baseline. 7 — holdings run 12 ticks under seeded gremlin perturbations, **zero manual orders** — the stability you authored, tested in a bounded window. 8 — minor heart-demon at ×0.5 amplitude + replace one inherited instinct with your own authored rule, live for 8 ticks. 9 — mentor / retrospective / first-solve. Then: Ignition (§10).

**Dao-heart turbulence.** Trigger: thermal runaway, loss ≥30% infrastructure mass, or failed tribulation — *in-game causes only, never absence.* Effect: top slot tranche offline, horizon halved. Recovery: 8 consecutive stable ticks (a bounded Survive re-pass). Stable access, not peak, is what you own — the chart's two columns, made mechanical.

**Heart-demon trials.** The survival archetype, personalized: the generator ingests your failure log (overheats, lost engagements, busted forecasts), selects your dominant pattern, and re-manifests it amplified inside the tribulation window. Xianxia's inner demon made procedural — and un-walkthrough-able by construction, because the content *is you*.

**The Migration, precisely.** The Foundation tribulation instantiates a mirrored copy of your state whose behavior is driven by *your own reflex set, locked instincts included*. You pass by out-deciding yourself. The subject→object lesson is the boss fight.

**Interiority fog.** Codex entries and technique texts above your Sight are never transmitted. The server sends a per-identity seeded *fragment* — a koan-like shard generated from `(entry_id, identity)` — while the true text stays server-side until the Sight is earned. It cannot leak, be screenshotted usefully, or be shared, because it never left the server: fog-of-war applied to meaning itself. Higher realms are illegible until you arrive — exactly the cultivation-novel rule that the sutra reads as nonsense below the realm.

**Quadrant checklist (AQAL, design-side).** Every realm's content must exercise all four quadrants — **I** (interior: logs, forecasts, heart-demons), **It** (structures, flows), **We** (sect culture, charters, Mandate), **Its** (markets, telemetry). The world punishes quadrant-blindness endogenously: ignore *We* and be betrayed; ignore *Its* and be arbitraged; ignore *I* and meet your heart-demon unprepared. This is the anti-meta pillar restated developmentally: dominant strategies are quadrant-blind strategies, and they die of it.

**Lines, not one ladder.** Masteries, calibration, Mandate, and stewardship develop independently (developmental "lines"); realm is your *center of gravity*, not your ceiling everywhere. This is the deeper reason every gate offers ≥2 trial archetypes — whichever line runs strong can carry the breakthrough.

**Stability over peaks.** The ladder distinguishes stable access from peak states; so do trials. Pass conditions are always *sustained* — uptime percentages, multi-tick windows — never one perfect moment. Heart-demons deliberately bait regression into grab-and-control responses under pressure; holding your level while stressed *is* the test.

**Codex voice for consciousness entries:** first-person interior, present tense — how the Sight feels *from the inside* — and unlocked only on arrival.

---

## 15. Relics — the sacred craft (mechanics)

**Design space (the blueprint).** A blueprint = `{lattice, composition, infusions, scale}`:
- *Lattice:* a geometry chosen from a symmetry grammar (crystal families → real group-theory flavor); lattice choice sets which properties *can* emerge (anisotropy, channel structure, resonance modes).
- *Composition:* isotope mix drawn from **your** system's metallicity table — the same design forged around a different star is a different (usually worse) object.
- *Infusions:* ordered aspect injections with tick-timing (e.g., Cryo soak → Photonic lattice-write → Plasma seal). Order matters; the state machine is path-dependent, like real metallurgy.
- *Scale:* bench → monument; cost and stewardship burden scale superlinearly.

**Process (the forge schedule).** Authored in the reflex grammar at forge scope: temperature/pressure/field curves across **20–100+ ticks**, with quench windows of **1–2 ticks** where being wrong ruins the melt. Seeded perturbations (impurity slugs, micro-flares) test the schedule's robustness; rare stellar events (flare season, magnetar burst) enable infusions unreachable in calm space — forge-hunting is expedition content. Presence is never required — *authored* stability is (pillar 2): a master's forge reflexes are themselves a masterwork.

**Emergence (no recipe table).** Outcome properties are computed by the materials sim from blueprint × process × local conditions: universal laws (phase behavior, annealing/quench dynamics, doping effects, superconductive transitions, error-correcting structure for Informational relics — literal ECC codes) with local parameters. Principles are teachable; solutions are personal. Failed forges yield *flawed* objects — sometimes interesting ones; flaw provenance records why.

**Grades, measured.** `grade = f(σ)` — how many standard deviations the relic's best property sits beyond the season's craft baseline: Mortal <2σ · Earth 2–4σ · Heaven 4–6σ · Dao >6σ. Baselines drift as the playerbase learns, so grades stay honest across eras. Dao-grade realistically requires multi-system materials + multi-identity stewardship + a caught rare event.

**Attunement & upkeep.** Attunement caps: 1 (Embodied–Foundation) / 2 (Core–Stellar) / 3 (Void); one banner relic per sect. Unattuned relics are dormant. Upkeep tribute scales with grade (Dao-grade drinks like a small city); lapse → dormancy where it falls → ruins → someone's expedition.

**Fame is signature.** Relic emissions scale with grade — a Heaven-grade blade is a beacon on every thermal map. Wielding legend and hiding are incompatible by physics; the dark-forest choice follows you.

**Provenance ledger.** Immutable, auto-appended: maker, season, material origins, forge events survived, every engagement witnessed, every hand held. Maker-naming passes moderation (§GDD-12.2). The ledger is readable by anyone holding or scanning the relic — history as loot.

**Persistence rules.** Relics are world-objects across seasons (mirror of scars). Anti-dynasty levers: attunement caps, upkeep, fame-signature, feats-not-stats scoring — and alpha telemetry watches relic-holder win-rates explicitly; if dynasties form anyway, the tuning levers are upkeep and caps, never confiscation.

---

## 16. Tuning table (all magic numbers)

| Constant | v0 value | Where |
|---|---|---|
| AP/tick · bank cap | 10 · 30 | §GDD-4.3 |
| Storage leak λ | 0.1%/tick | §2 |
| Radiator failure p₀ scaling | p₀·T_r² | §2 |
| Rule slots by realm | 4/8/16/32/64 | §5 |
| Reflex edit cost | 1–3 AP | §5 |
| Wallfacer multiplier · min seal age | ×1.5 · 28 days | §7 |
| Feat decay | v₀/√n | §11 |
| Score weights | 50/20/15/15 | §11 |
| Ignition target · window · pass | 50 MW · 12 ticks · 80% uptime | §10 |
| Trial retry cooldown | 7 days | §10 |
| Disciple cap | 3 | §9 |
| Season length | 12 weeks | §GDD-7.1 |
| Sight horizon caps (ticks) | 4 / 28 / 336 / 1008 / ∞ | §14 |
| Embodied locked instincts | 2 of 4 slots | §5, §14 |
| Slot tranche stages | entry / Control(3) / Harmonize(7) | §14 |
| Stage-1 & turbulence stability window | 8 ticks | §14 |
| Minor heart-demon amplitude | ×0.5 | §14 |
| Turbulence trigger (infra loss) | ≥30% mass | §14 |
| Stage-6 calibration gate | ≥10 forecasts / ≥2 weeks | §14 |
| Forge duration · quench window | 20–100+ ticks · 1–2 ticks | §15 |
| Grade thresholds (σ beyond baseline) | <2 / 2–4 / 4–6 / >6 | §15 |
| Attunement caps by realm band | 1 / 2 / 3 (+1 sect banner) | §15 |

---

*Next depth passes when needed: lore bible (names, tone, realm cosmology), combat math worked example, full OpenAPI file, D1 DDL.*
