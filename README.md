# Negentropy — M1 "Cold Spark"

Tick-based, API-first cultivation MMO where the dao is thermodynamics.
This repo is the M1 milestone: **one star system, the deterministic sim core,
the tick engine, the AP economy, reflex language v0, and the audit chain** —
with tests that *are* the acceptance criteria.

Design docs: [`docs/negentropy-design-doc-v0.7.md`](docs/negentropy-design-doc-v0.7.md) ·
[`docs/negentropy-deep-dive-v0.5.md`](docs/negentropy-deep-dive-v0.5.md)

## Layout

```
src/sim/      pure deterministic simulation (no IO, integer math only)
  core.ts       tuning constants, seeded integer RNG, physics (flares, radiators)
  types.ts      SimState, Orders, conservation Ledger
  reflex.ts     rule language v0: trigger → conditions → actions (+ locked instincts)
  resolve.ts    the tick function: 5 phases, conservation asserted every tick
  support.ts    genesis state, lazy catch-up, canonical hashing, audit chain
src/do/       SystemDO — Durable Object: persistence, lazy advance, rule CRUD
src/index.ts  Worker: /v1 REST + bearer auth + cron tick engine
test/         the M1 acceptance criteria, executable
```

## Verify locally

```
npm install
npm run typecheck
npm test
```

## Acceptance criteria → tests (GDD §10)

| Criterion | Test |
|---|---|
| Byte-identical resolution from identical inputs | `sim.test.ts` › determinism |
| `intake === ΔX + radiated + ΔheatBank` every tick | `sim.test.ts` › conservation (also thrown as `ConservationError` at runtime — anti-cheat is physics) |
| AP accrues +10/tick, banks to 30, rejects cleanly | `sim.test.ts` › AP economy |
| Reflex execution costs 0 AP; instincts fire | `sim.test.ts` › reflexes |
| Reflex **edits** cost AP | `reflex.test.ts` › edit cost |
| 30 days cold fast-forwards < 1 s, identical to live | `sim.test.ts` › lazy catch-up |
| Playable via `curl` alone | below |

## Deploy (personal Cloudflare account — **not** a work account)

```powershell
npx wrangler login
npx wrangler secret put DEV_TOKEN     # paste any long random string
npx wrangler deploy
```

## Play a week via curl alone (PowerShell)

```powershell
$B = "https://negentropy.<your-subdomain>.workers.dev"
$H = @{ Authorization = "Bearer $env:DEV_TOKEN" }

# who am I / what tick is it
Invoke-RestMethod "$B/v1/self" -Headers $H

# observe home (fog by omission: only Flow-Sight fields exist in the response)
Invoke-RestMethod "$B/v1/systems/home" -Headers $H

# queue orders for next tick (curl.exe form)
curl.exe -X POST "$B/v1/orders" -H "Authorization: Bearer $env:DEV_TOKEN" `
  -H "content-type: application/json" `
  -d '{"orders":[{"kind":"set_throttle","target":"collectors","value_milli":800},{"kind":"build_radiator"}]}'

# read your reflexes; note the two locked instincts
Invoke-RestMethod "$B/v1/reflexes" -Headers $H

# author a flare-harvest reflex (costs 2 AP; instincts must be included unchanged)
# → PUT the full rule array to /v1/reflexes
```

Unauthenticated requests get `401`. The cron (00/06/12/18 UTC) advances the world;
a cold system also catches up the moment you look at it — the universe doesn't
compute what no one watches.

## What's stubbed for M2 (Warm Cluster)

- D1 registry + real accounts/identities (replaces the single `wei-9` + DEV_TOKEN)
- Multiple systems, Queues-with-delay as light-lag, travel
- Markets (resolve phase 4), messages (phase 5), webhooks
- The Migration tribulation generator; sects v0; reference web client (Pages)
- Closed-form skip of event-free spans in catch-up (replay is the correctness oracle)
