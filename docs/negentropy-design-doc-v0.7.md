# NEGENTROPY
## Game Design Document — v0.7

| | |
|---|---|
| **Status** | Draft for iteration |
| **Author** | Zach (design partner: Claude) |
| **Date** | 2026-07-20 |
| **Changelog** | v0.2: hidden curriculum · v0.3: Endless Sky steals · v0.4: consciousness layer · v0.5: developmental correspondence · v0.6: nine-fold climb (§3.2) · v0.7: relics — the sacred craft (§5.10) · Companion: *Systems Deep Dive v0.5* |
| **One-liner** | A tick-based, API-first cultivation MMO where the dao is thermodynamics. |

---

## 0. Pitch

Every player is an uploaded mind climbing Kardashev-flavored realms of existence. In xianxia you defy heaven; here you defy the second law of thermodynamics. Because your character literally *is* software, players building their own clients, dashboards, and bots isn't a feature — it's the fiction.

It plays like correspondence chess wearing a cultivation novel's robes: the server ticks four times a day, everyone gets the same decision budget, and power comes from insight, not hours. It is free forever, funded by patronage, and engineered to cost almost nothing to run.

**Inspirations:** *Cradle* (progression skeleton), *The Three-Body Problem* (physics-and-sociology skeleton), *Endless Sky* (free/open-source ethos, content-as-data, the humble-start fantasy), Hoe_Math's LEVELS (the realm ladder as a ladder of thinking). **Prior art:** Screeps, SpaceTraders, Subterfuge, Neptune's Pride, EVE Online, Diplomacy.

---

## 1. Design Pillars

Every mechanic must survive all six. When two pillars conflict, this ordering wins ties (1 highest).

1. **No dominant meta.** Success is possible with any style given creative, intelligent decisions. Achieved structurally (§8), never by balance patches.
2. **Time-fair by construction.** Thinking buys everything; hours online buy nothing. Baseline ~15 min/day; never an idle farmer, never a grind.
3. **Beneficial to play.** The realm ladder is secretly a ladder of thinking, and the curriculum is real: the simulations run on genuine conceptual models of physics, chemistry, astronomy, engineering, and mathematics ("real models, gentle numbers," §5.9) — plus calibrated self-knowledge. Every mechanic passes the benefit test: *after a session, is the player better at something real?* The framework stays diegetic — the game never labels a player's "level of thinking."
4. **Breakthroughs by insight, not accumulation.** Advancement gates on demonstrated feats and novel insight trials. A sharp newcomer can outrank a rich veteran.
5. **Players own the surface.** API-first; the official client is merely the reference implementation. Community clients are culture *and* infrastructure.
6. **Nearly free to run.** Architecture choices are cost choices. Compute scales with active attention, not registered accounts.

### Non-goals (v1)

- **Realtime anything.** No twitch combat, no live sockets required to play. Tick-based only.
- **3D graphics / native mobile app.** Reference client is a static web app. The community can build the rest.
- **Monetized products.** No pay-to-win (breaks pillar 1), no cosmetic store (meaningless when players render their own clients), no blockchain.
- **Assessing the player.** The fiction is now explicitly about levels of consciousness (§3.1); the *player* is never measured — no thinking-level assessments, badges, or coaching UI. The character ascends; the player is invited.
- **Full scripting sandbox at launch.** Standing orders begin as a constrained rule language, not arbitrary WASM (§5.8, P2).

---

## 2. Fiction & Setting

**Premise.** In the far future, minds persist as software. The universe is winding down, and "heaven" — the antagonist every cultivator defies — is entropy itself. Cultivation is the art of gathering, concentrating, and defending negentropy: usable energy gradients, coherent information, ordered structure.

**Sects** are Dyson co-ops: player organizations that pool infrastructure (compute, sensors, energy lattices) and author their own incentive rules. **Master–disciple** sponsorship is the onboarding path: veterans stake reputation on newcomers and earn advancement credit from their disciples' feats (§6.4).

**Diegetic conveniences** (the fiction absorbing the engineering):

- Logging off = hibernation / closed-door cultivation.
- Third-party clients and bots = the tools an uploaded mind naturally builds for itself.
- Message latency between star systems = lightspeed. You always see other systems as they *were*.
- Unobserved space is frozen (lazy simulation, §9.2) = the universe doesn't compute what no one watches.

**The sky is full of your future.** From your Embodied starting rock, the megastructures of Stellar-realm players hang in your night sky (light-lagged, as they were) — the mortal watching immortals pass overhead, except the immortals are real people you might become. Endless Sky's Quarg ringworlds prove the pull of visible, unassailable elders; here they're earned, not scripted. Past seasons leave ruins and scars to excavate: the world's archaeology is its own history.

---

## 3. The Realms

Each realm has a **substrate** (what you are), a **hard cap** (the physics that stops you), and a **tribulation** (the trial to break through). The right-hand column is *design intent only* — never surfaced in-game.

| Realm | Substrate | Hard cap | Tribulation (to advance) | Cognitive demand (hidden) |
|---|---|---|---|---|
| **Embodied** | Augmented biology: neural lace, gene mods | Metabolic wattage | **The Migration** — upload; survive your own copy | Concrete optimization: one body, one budget |
| **Foundation** | Partial upload, hybrid substrate | Legacy hardware; borrowed compute | **Ignition** — bring a fusion core online without cooking yourself | Planning under uncertainty; calibrated forecasting |
| **Core** | Fusion-powered compute core | Heat dissipation | **Distribution** — fork across light-lag and re-cohere | Systems thinking: feedback loops, budgets, markets |
| **Stellar** | Star-scale distributed swarm mind | Lightspeed coherence of the self | **The Dark Forest Choice** — hide or shine; survive the consequences | Other minds: negotiation, coalition, mechanism design |
| **Void** | Post-stellar; negentropy husbandry | Heat death | **Ascension** (§7.3) | Epistemics: knowing what you know under deception |

Tribulations are *events you survive and problems you solve*, not stat checks (§6).

### 3.1 Consciousness as interface — Sights, horizons, subject→object

The realm ladder's engine is the **subject→object shift** (Kegan's developmental core): each breakthrough turns something that *ran you* into something you can *examine and author*. This is not metaphor — it is the interface contract. Each realm grants a named **Sight** (Cradle's Copper-sight, generalized): new data the API exposes, new things you may edit, a longer horizon you can plan across.

| Realm | Sight granted | What becomes object (was subject) | Planning horizon |
|---|---|---|---|
| Embodied | **Flow Sight** — energy/heat overlays | The world's flows | 1 day |
| Foundation | **Mirror Sight** — your own logs, your locked instincts, the forecast registry | *Yourself.* The Migration is surviving your own copy — the first time you see you from outside | 1 week |
| Core | **Loop Sight** — causal/feedback graphs of your own economy | The loops you were inside | 1 season |
| Stellar | **Mind Sight** — constraint-projections of other actors | Other minds — and the rules you author for them | 3 seasons |
| Void | **Field Sight** — world strategy-distribution telemetry | The frame itself; Arbiters design the next season | Beyond the season |

Consciousness is the *explicit fiction*: realms are states of mind as much as substrates, and the codex may speak plainly about what each Sight changes in how you think. The guardrail refines rather than relaxes — **the character ascends; the player is invited, never measured.**

**Developmental correspondence (design-side only — never player-facing).** Against the ego-development ladder (Loevinger/Cook-Greuter, Kegan, Spiral Dynamics; Hoe_Math's 1–9 simplification):

| Realm | Level embodied | Ladder character |
|---|---|---|
| Embodied | **5 — Achieve** | Expert/Achiever: goals, measurement, "life is a game, play to win" |
| Foundation | **6 — Understand** | Individualist: my lens shapes what I see — calibration play; the Migration makes selfhood visibly constructed |
| Core | **7 — Harmonize** | Strategist: systems interrelated; judgments imposed in service of the whole |
| Stellar | **8 — Sanctify** | Magician/Construct-Aware: the self as a maintained story — *enforced by physics*, because lightspeed coherence makes selfhood an active project |
| Void | **9 — Complete** | Ironist/Unitive: witness of the whole unfolding; Ascension — "not the main character, the spotlight" |

Levels 1–4 (Survive, Connect, Control, Belong) are not skipped — **every realm climbs them** (§3.2), and Embodied's own 1–4 double as onboarding: survive your budget → meet your neighbors → face the taking-temptation, whose cost the *world* teaches rather than a tutorial → join a sect. And yes: the competitive scoreboard itself is a level-5 artifact. The game knows it, and the ladder above it is how you outgrow it without leaving it.

### 3.2 The nine-fold climb — stages within every realm

Development is a spiral, not a line: **each realm's interior progression re-treads all nine levels in-domain, at the realm's scale.** Enter a new substrate and you are a beginner in it — you survive it, connect through it, learn to control it, and climb, again. Five realms × nine stages = the full lattice; a character reads as **"Foundation — Understand (6/9)."** Stage names are the nine verbs, player-facing and proudly diegetic; they name the *character's* climb, never the player (§Non-goals).

Rules of the climb:

- **Feat-gated, never XP.** Every stage is a checkable feat with **≥2 qualifying archetypes** (pillar 1 applies at stage grain — no stage requires aggression, and none requires a group: solo alternatives always exist). Stages 1–4 complete organically in days of normal play; 5–9 are the meat.
- **Tranches, not cliffs.** Each realm's reflex-slot allotment arrives in tranches at entry, **Control (3)**, and **Harmonize (7)** — progression is felt continuously, and Sight facets may hang off stages the same way.
- **Sanctify (8) is the minor heart-demon**: re-face your logged in-realm failure pattern at reduced amplitude, and *refactor your own automation* — replace an inherited or aging reflex with one you author, run live. The tribulation's rehearsal.
- **Complete (9) is the witness stage**: mentor another identity through any stage of this realm (Mandate), publish a calibrated retrospective (scored insight record), or land a realm-scale first-solve — any one. Then you are tribulation-eligible.
- **Dao-heart turbulence.** Catastrophic *in-game* events (thermal runaway, major loss, failed tribulation) suspend your top stage tranche and halve your horizon until you re-stabilize — a bounded re-pass of Survive. Stable access, not peak access, is what you own; absence never triggers it (pillar 2).
- **Rankings stay feat-based**: a Foundation climber can still top the Heavenly Rankings. The lattice is depth, not seniority.

---

## 4. Core Loop & the Tick/AP Model

### 4.1 A player's day

Open any client (~5–15 min): read what resolved last tick, adjust forecasts, queue orders, maybe edit a reflex or message an ally. Close it. The simulation advances on schedule whether you're there or not. Sessions spike (by choice) only when you're mid-scheme: a tribulation window, a contested objective, a negotiation.

### 4.2 The tick

- **Cadence:** 4 ticks/day at fixed UTC times — **00:00, 06:00, 12:00, 18:00**. Fixed times make correspondence play plannable and cache TTLs trivial.
- **Resolution order within a tick:** (1) physics advances → (2) standing orders fire → (3) queued player orders execute in initiative order → (4) markets clear → (5) events/messages dispatch (with light-lag).
- **Determinism:** given identical state + orders + seed, a tick always resolves identically. Non-negotiable — it enables lazy catch-up simulation (§9.2), replays, and dispute audits.

### 4.3 Action Points (AP)

| Rule | Value (v0.1 tuning) | Rationale |
|---|---|---|
| AP per tick, per identity | **10** | Identical for everyone (pillar 2) |
| Bank cap | **30** (3 ticks) | Miss a day guilt-free; can't hoard a war chest |
| Typical action cost | 1–5 AP | Move, build, trade, scan, message batch |
| Standing-order **execution** | **0 AP** | Your reflexes are you; routine ops are never manual |
| Standing-order **edits** | **1–3 AP** | Authoring reflexes is the gameplay; also stops bots from micromanaging via constant reprogramming |
| Tribulation attempt | Full tick's AP | Breakthroughs are events, not spam |

AP doubles as the API write-rate limit (§9.4): the game economy *is* the cost control.

### 4.4 Conflict pacing (no offline blindsiding)

Engagements resolve over a minimum of **3 ticks (~18h)** with escalating visibility:

1. **Declaration tick** — hostile intent becomes visible to the target (and, at light-lag, to neighbors).
2. **Maneuver tick(s)** — both sides queue orders; defender's standing orders are already live.
3. **Resolution tick** — outcomes computed deterministically.

Nobody loses anything meaningful while asleep. Defense quality = quality of your authored reflexes, which is exactly the skill we want to reward.

---

## 5. Systems

The "ridiculously complex mechanics" pillar is delivered by *interacting simulations*, not big stat tables. Each system is simple-ish alone; depth is combinatorial (Dwarf Fortress principle).

### 5.1 Thermodynamics (the substrate)

Everything reduces to energy gradients and heat. Structures and minds consume watts; computation and industry produce waste heat; heat must be radiated or it degrades you (Core realm's hard cap is literally a radiator problem). Negentropy — stored usable gradient — is the closest thing to a universal resource, and the season's ultimate scoreboard denominates in it.

### 5.2 Stellar physics & system generation

Every star system rolls **asymmetric physics**: spectral class, companion bodies, debris density, flare behavior, resonances. Orbits are analytic (closed-form between events — an engineering requirement, §9.2, that is also a design feature: predictable celestial mechanics reward players who learn them). Some systems roll **chaotic eras** (Three-Body): genuinely unstable dynamics where thriving means forecasting instability windows and authoring reflexes that survive them.

### 5.3 Aspects & Paths (Cradle)

Your local physics *is* your available madra: a system's spectrum and composition determine its **aspects** (e.g. plasma, gravitic, cryo, informational). Techniques are combinations of aspects you've mastered; your **Path** is the emergent identity of those choices. Because aspects are local and starts are asymmetric, builds don't transfer — you solve *your* system, and guides can't help (pillar 1).

### 5.4 Economy & markets

Player-driven order books per system; no NPC price-setting. Goods move at shipping speed (ticks), so prices diverge across space and arbitrage is real gameplay. **Frequency-dependent payoffs** are endogenous: any popular strategy moves its own prices against itself (a fusion rush spikes fuel; mass turtling makes raiding cheap).

### 5.5 Information & epistemics

Sensing costs energy; all intel ages by light-lag; deception is a first-class verb (decoys, spoofed signatures, false flags). The **Wallfacer protocol** (Three-Body): seal your true strategy as a salted SHA-256 commitment now; reveal later. Verified reveals confer legitimacy — ranking multipliers on objectives achieved *as sealed*. Counterplay is **Wallbreaking**: deducing sealed intent from visible moves. (Tuning of reveal bonuses: open question, §13.)

### 5.6 Conflict & the commons

Combat is logistics, positioning, and reflex-authorship resolved over the 3-tick protocol (§4.4). At the top end, **dimensional strikes** permanently scar regions — reduced aspect richness, broken lanes — *for everyone*. Total war shrinks the shared universe: the strongest structural pressure against a violence meta, and thematically pure Negentropy. **Scars persist across seasons** as world history; rankings reset, the world remembers.

### 5.7 Sects & governance

Sects charter their own incentive rules in-engine: dues, profit splits, admission requirements, disciplinary triggers. Bad rules visibly die (members leave, treasuries drain) — mechanism design as core gameplay for the Stellar realm's cognitive demand. Master–disciple links (§6.4) hang off sect infrastructure.

### 5.8 Standing orders — "your Dross"

Your empire's reflexes: **trigger → condition → action** rules ("if pirate signature on lane 3 → reroute convoys, alert sect"). v0 is a constrained declarative JSON rule language — sandboxable, meterable, diffable — not arbitrary code. **Rule slots scale with realm** ("mind" grows as you advance — diegetic and a clean progression axis). Full sandboxed scripting (WASM) is a P2 ambition once the rule language's ceiling is actually hit.

### 5.9 The hidden curriculum — real models, gentle numbers

Pillar 3's STEM mandate is implemented by one rule: **every simulation uses the true conceptual model with simplified constants.** Correct causal structure, correct qualitative behavior, no calculators required. Kerbal Space Program is the existence proof that this teaches — players genuinely learn orbital mechanics because the *dynamics* are honest even when the numbers are gentle.

| Discipline | Where it lives in play |
|---|---|
| **Astronomy** | System generation uses real stellar classification (O–M, luminosity, metallicity); habitable zones, tidal locking, resonances; chaotic eras are genuine three-body dynamics; travel rewards learning transfer windows |
| **Physics** | Thermodynamics as substrate; radiative heat rejection (Stefan–Boltzmann, conceptually) is the Core realm's literal wall; lightspeed lag; fusion at Ignition |
| **Chemistry** | Aspects ground in nucleosynthesis and elemental abundance — your star's metallicity *is* your periodic table; **scanning is spectroscopy**: you read spectra to learn what a system holds |
| **Engineering** | Everything is built under mass/power/heat budgets; reflexes are feedback control; failures propagate through dependencies — Endless Sky's energy/heat outfitting puzzle at civilization scale |
| **Mathematics** | Lane networks are graph problems; Wallfacer commitments are real cryptography; calibration scoring is probability; orbital resonance carries ratio/number-theory flavor; Stellar politics is game theory |
| **Self** | Calibration trials score knowing-what-you-know; the realm ladder's hidden cognitive mapping (§3); optional post-tribulation insight records feed master–disciple teaching (§6.4) |

Delivery is **just-in-time and discovery-pulled**: codex entries unlock when a phenomenon first bites you, never as front-loaded lectures. The mechanic creates the curiosity; the codex answers it. (Parking lot: citizen-science hooks à la EVE's Project Discovery — real datasets as in-world divination.)

### 5.10 Relics — the sacred craft

Relics are the positive mirror of scars: **persistent creation.** A relic is a structure of extreme concentrated order whose properties push a physical limit asymptotically — storage whose leakage λ→0 (a vessel that holds exergy across seasons), conversion η→1, dissipation beyond the area law, coherence beyond comfortable light-lag — *approaching* limits at absurd cost, never breaking conservation.

- **No recipes exist, anywhere.** A relic is design (a blueprint in a deep combinatorial materials space) + process (an authored multi-tick forging schedule) + performance (live stewardship under *your* system's physics). Properties **emerge from simulation**, never from a lookup table. Universal laws transfer between players — that's the curriculum; exact solutions don't — that's the anti-meta. Blueprints may be shared, but porting one to different stellar conditions requires genuine understanding: teaching a forge is a Mandate source, copying one is a pile of slag.
- **Grades are measured, not assigned**: a relic's grade (Mortal / Earth / Heaven / Dao, diegetic) is the statistical extremity of its best property against the season's craft baseline. Dao-grade in practice demands collaboration — multi-system materials, multi-identity stewardship, a rare stellar event caught at the right tick.
- **Provenance is immutable and accruing**: maker, season, material origins, and every deed the relic witnesses append forever. The story is the treasure.
- **Persistence without dynasty.** Relics outlive seasons *as world-objects*, not as guaranteed advantages: attunement caps (1/2/3 by realm band; one banner relic per sect — unattuned relics lie dormant), upkeep tribute scaling with grade (lapse → dormancy where it falls → ruins → expeditions), **fame is signature** (a relic's emissions scale with its grade — you cannot wield the legendary sword quietly, and the dark forest is watching), and seasons score feats, not stats. Famous and lost relics join the scarce-objective pool (§7.2).

Phased post-M3 (§14 roadmap); the materials sim it rides on is designed for it from the start.

---

## 6. Progression & Breakthroughs

Fine-grained progression is the nine-fold climb within each realm (§3.2); the tribulations below remain the gates *between* realms, and each realm's Sanctify stage rehearses its tribulation.

### 6.1 Insight trials

Realm advancement gates on **demonstrated feats**, never on accumulated resources or playtime (canon in both source series: Cradle's revelation-gated Underlord, touching an Icon for Sage). Trial archetypes:

- **Engineering trials** — solve a real constraint problem *in your own system's rolled physics* (e.g. Ignition: achieve stable fusion output without exceeding your heat budget).
- **Calibration trials** — a season of in-game forecasts, scored on calibration, must clear a bar.
- **Contested feats** — hold or take a scarce objective under real opposition.
- **Survival tribulations** — scripted crises (your Migration, a chaotic-era storm) survived through preparation and reflex quality.
- **Heart-demon trials** — the crisis is generated from *your own logged failure history*: the storm that nearly ended you returns, sharpened. Xianxia's inner-demon tribulation made procedural — unshareable and un-walkthrough-able by construction, because the content is you.

**Multiple archetypes per gate** so different cognitive styles can pass — pillar 1 applies to progression too.

### 6.2 Anti-walkthrough properties

Trials are procedurally generated from **seed-secret generators** (§11.3), parameterized by *your* system's physics — answers don't transfer between players, and no wiki can solve yours for you. Grading is by simulation outcome, not quiz logic.

### 6.3 What raw accrual buys

Deliberately little. Resources widen your *options* (more infrastructure to author reflexes over, more trades available) but never substitute for a trial. This is the anti-power-alt property too (§12.1).

### 6.4 Teaching as advancement

At Stellar+ realms, the fastest advancement path is **taking disciples whose feats credit the master**. Xianxia-canon, developmentally true (teaching consolidates mastery), and it makes onboarding veterans' self-interest.

---

## 7. Competitive Structure

### 7.1 Seasons

**~12-week seasons.** Rankings, sealed-plan bonuses, and objectives reset; the world (scars, sect histories, monuments) persists.

### 7.2 Heavenly Rankings

Seasonal leaderboards contested over **scarce, non-fungible objectives**: unique stellar phenomena, wormhole junctions, first-solves of hard engineering problems, and famous or fallen relics (§5.10). Always a scoreboard, never a treadmill — score comes from feats, not throughput.

### 7.3 Ascension (endgame)

Top seasonal players **ascend**: they leave the mortal world (Cradle's Monarch → Abidan arc) into **Arbiter** roles for the following season — seeding tribulation parameters, adjudicating disputes, curating scarce objectives, all within engine constraints. Curatorial power, not combatant power. One move solves endgame, seasonal resets, and content generation.

---

## 8. Anti-Meta Mechanisms (how pillar 1 is actually enforced)

1. **Frequency-dependent payoffs** — endogenous markets and objective scarcity make any popular strategy less profitable (§5.4).
2. **Asymmetric starts** — rolled physics + local aspects mean builds don't transfer (§5.2–5.3).
3. **Combinatorial depth** — interacting simulations put the strategy space beyond spreadsheet closure.
4. **Insight gates with multiple archetypes** — no single cognitive style is privileged (§6.1).
5. **Commons costs on violence** — dimensional scarring taxes the "just fight" meta (§5.6).
6. **Monitoring, not patching** — we watch strategy-population telemetry (§12.3); if a meta calcifies anyway, the fix is a new *interaction*, not a nerf table.

---

## 9. Technical Architecture

**Stack:** Cloudflare Workers + Durable Objects + D1 + KV + Queues + R2 + Pages. (Personal account, fully separate from any work infrastructure.)

### 9.1 Component map

```
                 ┌────────────────────────────┐
  players' own   │  Reference client (Pages)  │   community clients
  clients/bots ──┤  static SPA, no server     ├── TUIs, dashboards,
        │        └────────────┬───────────────┘   bots, MCP client
        │                     │
        ▼                     ▼
   ┌─────────────────────────────────────┐
   │  api worker  /v1/*  (REST + auth)   │──► KV: public snapshots
   └───────┬─────────────────────────────┘    (rankings, maps, markets;
           │                                   tick-aligned TTLs)
           ▼
   ┌─────────────────────────────────────┐
   │  Durable Object per star system     │◄── cron: tick fan-out to
   │  (state + deterministic sim + alarm)│    ACTIVE systems only
   └───────┬─────────────────────────────┘
           │ cross-system messages
           ▼
   ┌─────────────────────────────────────┐
   │  Queues w/ delayed delivery         │  ← delay = light-lag (diegetic!)
   └───────┬─────────────────────────────┘
           ▼
   D1: accounts, identities, seasons, rankings, patron ledger
   R2: static assets, replay archives        Webhooks → player bots
```

### 9.2 Lazy simulation (the cost keystone)

A system DO computes only when **observed** or when a **scheduled event** fires (its own alarm). Cold systems are rows in storage costing ~nothing. On observation, the DO **fast-forwards deterministically** from last state — which requires the engineering rule: *dynamics are closed-form between events* (analytic orbits, linear flows). Compute scales with active attention, not registered players. Empty space stays frozen; the fiction agrees.

### 9.3 Tick engine

A cron Worker fires at the four tick times, consults the D1 registry of systems with pending orders or subscribed observers, and pokes only those DOs. Everything else catches up lazily on next contact.

### 9.4 API surface (v0)

Versioned REST under `/v1/`, token auth per identity, published OpenAPI spec. Writes are AP-metered; reads get generous quotas + KV caching. Webhooks push tick events to player bots (cheaper than polling for everyone).

| Endpoint | Purpose |
|---|---|
| `POST /v1/identities` | Create character |
| `GET  /v1/self` | Identity, realm, AP, reflex slots |
| `GET  /v1/systems/{id}` | Observed state — honors light-lag |
| `POST /v1/orders` | Queue actions for next tick |
| `GET/PUT /v1/reflexes` | Standing-order CRUD (edits cost AP) |
| `POST /v1/commitments` · `POST /v1/commitments/{id}/reveal` | Wallfacer seal / reveal |
| `GET  /v1/market/{system}` | Order book |
| `POST /v1/messages` | Comms (delivered with light-lag) |
| `GET  /v1/rankings` | Season standings (KV-cached) |
| `GET  /v1/spec` | OpenAPI document |

### 9.5 Trade-offs made explicit

- **DO-per-system vs. global shards:** per-system isolates hot spots and matches lazy sim; cost is cross-system choreography — accepted because Queues-with-delay *is* our light-lag mechanic anyway.
- **4 fixed ticks vs. rolling ticks:** fixed is coarser but makes fairness legible, caching trivial, and correspondence play plannable.
- **Constrained rule language vs. full scripting:** loses Screeps-depth at launch, gains sandboxing, metering, and a gentler on-ramp; revisit when players hit the ceiling (P2).

---

## 10. Product Requirements Snapshot

**Must-have (P0):** deterministic tick engine · AP economy · single-system playable loop (energy/heat) · reflex rules v0 · REST API + tokens + OpenAPI · lazy catch-up sim proven · Migration tribulation generator · sects v0 · seasonal scoreboard · fog-of-war by omission · conservation invariants + replay audit.

**Should-have (P1):** Wallfacer commitments · webhooks · reference client polish · markets v0 · master–disciple credit · Arbiter tooling stub.

**Future (P2 — architectural insurance only):** WASM reflex sandbox · dimensional strikes + scarring · MCP client · self-hosted community shards · proof-of-personhood option for ranked play.

**Sample acceptance criteria (M1 core):**

- [ ] Given identical state + orders + seed, tick resolution is byte-identical across runs.
- [ ] A player can complete a full week of play via `curl` alone (no official client).
- [ ] A system untouched for 30 days fast-forwards to current tick in < 1s and < 1 DO invocation.
- [ ] An account that misses two consecutive ticks has lost nothing and banked AP (≤ cap).
- [ ] Standing-order execution consumes 0 AP; any reflex edit consumes ≥ 1 AP.

---

## 11. Cost, Funding & Openness

### 11.1 Cost model

Static client on Pages, assets on R2 (zero egress), snapshots on KV, compute lazy. Realistic bill: the **$5/mo Workers Paid plan** carries hundreds of players; on the order of **~$100/mo at ~10k** players. A realtime MMO of equal population would run 10–100×.

### 11.2 Funding: patronage, never products

Donations fund servers, full stop. Recognition instead of goods (EVE-style): patrons **name newly discovered stellar phenomena**, in-world stelae and memorials record contributions. Zero gameplay effect — pillar 1 forbids it and pillar 5 makes cosmetics moot anyway.

### 11.3 Open-core boundary

**Public:** engine, reference client, rule language, OpenAPI, docs — invites contributor clients and self-hosted shards.
**Private:** insight-trial generators and seasonal seeds — or breakthroughs become walkthrough-able (§6.2). This line is the whole reason the model works; hold it.

### 11.4 Content as data (Endless Sky's lesson)

Endless Sky sustains a decade-old, zero-budget galaxy because nearly all content — ships, outfits, missions, factions — lives in plain-text data files the community extends by pull request. Adopt it wholesale: system archetypes, structures, aspects, codex entries, and event templates are versioned data files, not code, loaded by the engine from M1 onward. The engine stays small; the universe grows by PR. Community content contributions open post-M3, Arbiter-curated; trial generators remain the private exception (§11.3).

---

## 12. Integrity & Governance

### 12.0 Threat model — cheats and hacks

Tick-based server-authoritative is the most cheat-resistant genre that exists, and this architecture commits to it fully:

- **Clients are pure views.** All state lives server-side; a hacked client can only render differently. Entire cheat classes (speedhacks, client-trust dupes, wallhack-equivalents) are impossible by construction.
- **Fog of war by omission.** The API never transmits data the identity can't legitimately observe. Mandatory, not optional — players write their own clients, so there is no "hidden in the client" here.
- **Conservation laws as anti-cheat.** The thermodynamic sim hands us literal invariants: every tick asserts that energy and mass books balance per system. An exploit that mints resources trips the same alarms as a bug.
- **Deterministic replay as audit.** Any disputed tick re-runs byte-identically from logged inputs; Arbiters adjudicate from evidence.
- **No arbitrary code.** Reflexes are a sandboxed, metered rule language (§5.8); orders are validated, idempotent, AP-bounded.
- **Open engine as standing bug bounty.** The public core (§11.3) invites white-hat eyes; sim exploits get found in the repo before they're found in Season 3.

Residual surface is the boring, honest kind: account security, DDoS (Cloudflare's home turf), and collusion/alts (§12.1).

### 12.1 Alts — the real tax on free competitive games

Insight-gating already blunts **power alts** (each identity must pass trials personally; resources can't be funneled past a gate). Remaining problem: **intel alts** (scout accounts). Candidate mitigations, to be validated in alpha:

- Sensing costs energy and intel decays by light-lag — free eyes are stale eyes.
- Per-account AP makes an alt a real second time investment.
- Sect admission via vouching (web-of-trust); Arbiters adjudicate flagrant cases.
- *Ranked* seasons may optionally require lightweight proof-of-personhood (P2 — decide only if pressure appears).

### 12.2 Player-authored content

Sect charters, names, and monuments need moderation: allow/deny lists + report queue + Arbiter review. Small surface; keep it boring.

### 12.3 Telemetry commitments

Track: strategy-population distributions (meta watch), breakthrough pass rates by trial archetype (fairness watch), median session length (pillar 2 watch), cost per active player. Publish the dashboards — transparency is cheap and on-brand.

### 12.4 AI policy — assistance-symmetric, solve-resistant

Straight truth first: **an open-API game cannot be "immune" to AI.** Pillar 5 invites player-built bots, and no server can verify which neurons produced an order. Chasing puzzle difficulty that frontier models can't crack is a losing arms race. The achievable — and better — target:

- **Nothing is solvable by submitting an answer.** Every gate is *performance in-world*: infrastructure built over weeks, feats under live opposition, calibration accumulated across a season (§6.1). AI can advise; only your empire can perform. Advice-without-execution is exactly the relationship a master already has with a disciple — the fiction absorbs AI rather than fighting it.
- **Copying is dead on arrival.** Trials parameterize on your own rolled physics (§6.2); neither wikis nor chatbots hold your answer.
- **Scarcity keeps rankings honest.** Contested objectives are zero-sum: if everyone has AI coaching, relative standing still measures judgment, preparation, and nerve.
- **The anti-meta machinery is anti-AI-meta machinery.** Frequency-dependent payoffs mean any strategy AIs converge on self-defeats at population scale (§8).
- **Honest boundary.** A player determined to let AI think *for* them advances hollow and learns less — and contested play re-tests them relentlessly. The game makes genuine understanding the path of least resistance; it cannot, and does not pretend to, compel it.

| # | Question | Blocking? | Owner |
|---|---|---|---|
| 1 | Wallfacer reveal bonus tuning — flat multiplier vs. objective-scoped? | No (alpha tuning) | design |
| 2 | Reflex rule-language expressiveness v0 — which triggers/conditions ship? | **Yes, M1** | design+eng |
| 3 | Trial generator architecture — per-archetype modules vs. one parameterized engine? | **Yes, M2** | eng |
| 4 | Intel-alt answer — do candidates in §12.1 suffice without proof-of-personhood? | No (alpha data) | design |
| 5 | Season 0 scoring formula for Heavenly Rankings | Yes, M3 | design |
| 6 | Name/trademark check on "Negentropy" before public launch | No (pre-M3) | Zach |
| 7 | In-fiction framing for AI advisors — spirit familiars, or neutral silence? | No | design |
| 8 | Codex authoring pipeline — who writes and vets the science? | No (M2) | Zach |
| 9 | Onboarding arc — staging the 1→4 recapitulation inside Embodied | No (M2) | design |

---

## 14. Roadmap — Three Milestones

### M1 — *Cold Spark* (single-system playable core)

Deterministic sim core for one star system; tick engine (cron + DO alarms); AP economy + order queue; energy/heat loop; reflex rules v0; REST API + token auth + OpenAPI; minimal read-only web client; lazy catch-up proven.
**Done when:** the M1 acceptance criteria (§10) pass, and a month of ticks costs < $1.

### M2 — *Warm Cluster* (it becomes multiplayer)

Multiple systems + Queues-as-light-lag; travel; markets v0; sects v0 (charters, shared infra); **Migration tribulation** — the first insight-trial generator; webhooks; rankings prototype; reference client v1 on Pages.
**Done when:** a ~20-player closed alpha runs 2 weeks with ≥1 contested objective and ≥5 first breakthroughs, median session < 20 min.

### M3 — *First Season* (public Season 0)

Core realm + heat-dissipation engineering; 3-tick conflict protocol; Wallfacer commitments; season machinery (12-week clock, Heavenly Rankings, Arbiter stub); client-dev kit (OpenAPI + example TUI); patron ledger + naming queue.
**Done when:** Season 0 launches publicly; infra < $20/mo at ~100 players; ≥1 community-built client exists (stretch: 3).

*Post-M3 parking lot:* the relic forge (§5.10), dimensional strikes + persistent scarring, ascension full loop, WASM reflexes, MCP client, self-hosted shards.

---

## 15. Glossary

**Negentropy** — usable order; the resource, the score, the game's name. **Tick** — one simulation step, 4×/day UTC. **AP** — per-tick decision budget, identical for all. **Reflexes / Dross** — standing orders; trigger→condition→action rules. **Aspect / Path** — local physics as technique palette / your emergent build identity. **Tribulation** — insight trial gating realm advancement. **Wallfacer / Wallbreaking** — sealed-strategy commitment / deducing it. **Chaotic era** — rolled stellar instability regime. **Scar** — permanent regional degradation from dimensional strikes. **Sect** — player co-op with self-authored incentive rules. **Arbiter** — ascended player curating the next season. **Heavenly Rankings** — seasonal leaderboard over scarce feats.
