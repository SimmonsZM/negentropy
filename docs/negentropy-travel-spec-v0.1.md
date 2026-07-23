# NEGENTROPY — Travel & The Mind/Place Split
## Design Spec v0.1 · 2026-07-23 (pre-dawn) · for milestone M5

**Status:** Design-complete, unbuilt. This document exists because the split
below touches every field of a live SimState with ~820 ticks of real history.
It was written at the end of the session that built M2a–M4a, while the entire
system was resident in one context — treat it as the handoff.

**Prime directive for the implementer:** wei-9-home's history is sacred. Every
stage below ends with a hash-equality proof against the live blob's replay.
If any stage cannot prove equivalence, stop and redesign; do not migrate live
state on faith.

---

## 1. Why this refactor exists

Travel (GDD §5.2 lanes, DD §3 "Travel") is the last verb. It unblocks, in
order: **sect roles** (a treasurer must be able to *stand at* the hall —
blocked tonight with the note "the constraint is physics, which is the
correct author"), **Belong's sect path** (identity-aware presence),
**conflict positioning** (GDD §5.6 "logistics, positioning"), and
**teaching** (§6.4 disciples must reach masters). None of these can be built
honestly while a mind and its birthplace are one JSON object.

## 2. The ontological split

Today `SimState` fuses two things the fiction has always kept distinct:

**THE MIND (travels).** Identity-adjacent, substrate-independent:
`realm, stage, positiveStreak, verbsUsed, sentHail, gotHail, decodedFrom,
calibration, forecasts*, mastery, usageRing, techCooldowns, ruleMeta,
rules (the reflex slots ARE the mind), harmonizeCooldownUntil,
sanctifyCooldownUntil, migrationCooldownUntil, handsOffStreak,
sanctify?, turbulence?, bargainDebtUntil†`.

**THE PLACE (stays).** Physics rooted in a star:
`store_eu, heatBank_eu, structures, stock, book, bookSeq, committedEu,
vault, damaged, phaseAngle, flareRing, receivedSignals‡, inbox/outbox,
log, ledger, tick, burnActive, buffs§, reflexEvents, metricsPrev`.

Notes: (*) forecasts are claims about a SPECIFIC star's weather — they
**void on departure** (log: "your claims were about a sky you left").
(†) The Hollow's debt follows the debtor — the levy burns whatever store
hosts them. (‡) Signals were received AT a place; the mind keeps only
`decodedFrom` (the comprehension, not the recordings). (§) Buffs are
place-coupled physics (cryo attunement of THESE radiators) — they lapse.
`mastery` travels but availability doesn't: a Material 1000 master arriving
at sable-drift (Z 300) is a smith without ore. That asymmetry is the point.

**Trials do not travel.** `trial` and `harmonize` in-flight = departure
refused ("one cannot flee a crucible"). Departure during the Whisper's open
window = **counts as acceptance-adjacent cowardice? NO — ruled simpler:**
departure refused while the window is open ("the Hollow's question follows
no lane").

## 3. Transit mechanics

- New order `depart { to }` (3 AP): validated at the PLACE — lane exists,
  no active trial/crucible/whisper-window, not damaged (a broken vessel
  cannot fly). Effects: mind-fields serialized into a **mind envelope**
  (kind `"mind"`, seq'd, riding the existing mail with `deliver_at = t + lag`);
  place enters **untended mode** (below); log both ends.
- **Transit = lane lag.** The mind moves at the speed of its own light.
  During transit the mind does not exist anywhere orderable: no AP accrual,
  no orders, no sights. The API answers `{ in_transit: true, from, to,
  arrives_t }`. This is the vulnerable dark the fiction wants — and v0's
  piracy surface, deliberately unexploited until conflict ships.
- **Untended places** keep running physics + reflexes (your automation IS
  you, left behind). Manual orders to an untended place are refused. The
  reflexes' author being absent is what makes standing-order quality matter.
  Feat/stage engines FREEZE (a place cannot climb without its mind); the
  hands-off streak explicitly does NOT accrue (Complete demands presence —
  "the realm holds without your hands" ≠ "without you").

## 4. Arrival semantics

| Destination | Result |
|---|---|
| **Unclaimed system** | Homestead: registry claim flips to the arriver; genesis-fresh place; old home becomes **fallow** (still claimed, untended — v0 forbids re-claiming a fallow home by others; conflict revisits). |
| **Own fallow home** | Return: mind grafts back; forecasts stay void; life resumes. |
| **Own sect's hall** | **Dock**: mind resides as guest of the place. Guests issue NO place orders except `deposit_vault` / `withdraw_vault` **per role** (see §5) and `depart`. Guest AP accrues at half (a guest is not at home). |
| **Another mind's claimed system (no sect tie)** | v0: arrival refused at depart-time ("no berth waits for you there"). Visiting rights are a conflict/diplomacy feature. |

## 5. What unblocks immediately (build in the same milestone)

- **Sect roles**: `treasurer` appointable by founder (registry). Vault-order
  gating becomes: (founder OR treasurer) AND physically-present-at-hall
  (resident or docked guest). The physics constraint that made roles vacuous
  is exactly what travel dissolves.
- **Belong's sect path**: `belong` gate gains `sectSize ≥ 2` — the DO learns
  sect size the same way it learns neighbor books: fetched at the live edge,
  **recorded into chain inputs** (the Listening Market pattern, M3d). No
  purity loss; replay reads the record.

## 6. Audit & chain design

- **The place's chain never breaks.** Place history is place history; the
  chain keeps linking through untended ticks.
- **The mind carries a passport**: `{ mindFields, from, departed_t,
  mindHash }` where `mindHash = sha256(stableStringify(mindFields))`. The
  destination verifies hash-on-arrival and logs it; the passport hash enters
  the destination's chain inputs. Tampering in transit = arrival refused,
  mind bounces home (the cargo-bounce pattern, M2g).
- **Exactly-once**: mind envelopes ride the existing seq + deliveredKeys
  ring (M2f). A retried delivery of a mind is a `duplicate: true` no-op.
  A LOST mind envelope is the one unacceptable failure: departures must be
  written to the origin's outbox in the same storage put as the untended
  transition (atomic within the DO), and the standard catch-up redelivery
  loop guarantees eventual arrival.

## 7. Live-world migration (the dangerous part, made boring)

- **Stage the split as a VIEW first.** M5a introduces `mindOf(s)` /
  `placeOf(s)` pure projections over the EXISTING fused SimState and changes
  no storage. Every call site that conceptually wants one half starts using
  the projection. The behavioral pin and full replay-equality suite must
  pass untouched — provably zero behavior change.
- **Then move storage.** M5b writes `{ place, mind }` blobs; `load()` splits
  fused blobs lazily (the established blob-repair pattern) and NEVER writes
  the fused shape again. A dedicated test replays wei-9-home's real recorded
  history shape (fixture from production export) fused-vs-split to hash
  equality before this ships.
- Only M5c adds `depart` — new behavior arrives only after the
  representation change is proven inert.

## 8. Deferred-with-reasons (do not scope-creep into M5)

- **Synodic lane costs** (`base · align(t)`, DD §3): needs orbits/bodies,
  which need their own design (Keplerian closed-form, chaotic-era horizons).
  v0 travel uses flat lane lag. The doc's transfer-window pedagogy waits
  for the bodies milestone.
- **Piracy / interception of minds-in-transit**: conflict milestone.
- **Multi-occupancy beyond hall-docking**: diplomacy milestone.
- **Founder's-home question**: CAN wei-9 abandon wei-9-home? Mechanically
  yes (fallow). Whether the genesis system gets special status is a
  founder's ruling — flagged, not decided here.

## 9. Test obligations (write these before the code)

1. Pin survival: wei-9-home projection hash unchanged through M5a and M5b.
2. Fused/split replay equality on a production-shaped fixture.
3. Depart-refusals: trial, crucible, whisper-window, damaged, no lane.
4. Transit round trip two-DO: depart → untended physics continue → reflexes
   still fire at origin → arrival passport verified → orders work at the
   new place → return grafts cleanly.
5. Forecast voiding + buff lapse + hands-off freeze while away.
6. Homestead: claim flip recorded, feats resume only after arrival.
7. Docked guest: vault ops per role, half AP, everything else refused.
8. Mind-envelope idempotency: duplicate delivery no-ops; tamper bounces.

## 10. Rulings needed from the founder before M5c

1. Special status for genesis homes, or fully fallow-able?
2. Guest AP at half — accept, or zero, or full?
3. Departure during dao-heart turbulence: allowed (flight is human) or
   refused (a shaken heart cannot navigate)? Spec leans **allowed** —
   turbulence already has teeth; exile shouldn't be one of them.

---
*Written at the end of the twenty-commit night, so the morning doesn't have
to reconstruct what the dark already knew.*
