import { describe, expect, it } from "vitest";
import {
  BARGAIN_GRANT_EU, BARGAIN_LEVY_TICKS, SANCTIFY_COOLDOWN,
  WHISPER_DELAY_MIN, WHISPER_DELAY_SPAN, WHISPER_WINDOW, seedFrom,
} from "../src/sim/core.js";
import { defaultInstincts } from "../src/sim/reflex.js";
import { resolve } from "../src/sim/resolve.js";
import { fastForward, genesisState, stateHash } from "../src/sim/support.js";
import { getSystem } from "../src/sim/starmap.js";
import type { Order, SimState } from "../src/sim/types.js";

const HOME = getSystem("wei-9-home")!;
const SEED = seedFrom("negentropy-season-0", "wei-9-home");
const RULES = defaultInstincts();

/** A well-engineered eighth-rung mind: the storms are survivable in silence. */
function eighthRung(): SimState {
  const s: SimState = { ...genesisState(), stage: "sanctify", store_eu: 4000 };
  s.structures.radiators.panels = 20;
  s.structures.collectors.throttle_milli = 400;
  return s;
}

function tickTo(s: SimState, t: number, orders?: Map<number, Order[]>): SimState {
  while (s.tick < t) s = resolve(s, orders?.get(s.tick + 1) ?? [], RULES, SEED, HOME);
  return s;
}

describe("The Whisper arrives uninvited, on schedule", () => {
  it("reaching Sanctify books a seeded visit inside the promised window", () => {
    let s = eighthRung();
    s = resolve(s, [], RULES, SEED, HOME); // first tick at the rung schedules it
    expect(s.sanctify).toBeDefined();
    const w = s.sanctify!;
    expect(w.whisperAt).toBeGreaterThanOrEqual(s.tick + WHISPER_DELAY_MIN - 1);
    expect(w.whisperAt).toBeLessThan(s.tick + WHISPER_DELAY_MIN + WHISPER_DELAY_SPAN);
    expect(w.windowEnd).toBe(w.whisperAt + WHISPER_WINDOW - 1);
    for (const ev of w.events) {
      expect(ev.tick).toBeGreaterThanOrEqual(w.whisperAt);
      expect(ev.tick).toBeLessThanOrEqual(w.windowEnd + WHISPER_WINDOW); // seeded inside or near the window
    }
  });
});

describe("Silence is the answer — but silence alone is not enough", () => {
  it("the prepared, having AUTHORED, ignore the window and pass to Complete", () => {
    let s = eighthRung();
    s = resolve(s, [], RULES, SEED, HOME);
    s.lastReflexRefactorTick = s.sanctifyEnteredAt; // the authored rule has run live since arrival
    const end = s.sanctify!.windowEnd;
    s = tickTo(s, end + 1); // straight through, hands off
    const log = s.log.join("\n");
    expect(log).toContain("THE HOLLOW WHISPERS");
    expect(log).toContain("fades unanswered");
    expect(log).toContain("STAGE COMPLETE: Sanctify");
    expect(s.stage).toBe("complete");
    expect(s.bargainDebtUntil).toBe(0); // no debt was ever taken
  });

  it("silence without authorship is refused — inherited reflexes are the demon's second question", () => {
    let s = eighthRung();
    s = resolve(s, [], RULES, SEED, HOME); // no refactor ever made
    const end = s.sanctify!.windowEnd;
    s = tickTo(s, end + 1);
    expect(s.log.join("\n")).toContain("you still run on inherited reflexes");
    expect(s.stage).toBe("sanctify");
    expect(s.sanctifyCooldownUntil).toBeGreaterThan(s.tick - 2);
  });

  it("sixteen silent ticks earn Steady Hand; the RETROSPECTIVE closes the ladder", () => {
    let s = eighthRung();
    s.calibration = { n: 12, total_milli: 3600 }; // a season of honest claims
    s = resolve(s, [], RULES, SEED, HOME);
    s.lastReflexRefactorTick = s.sanctifyEnteredAt;
    s = tickTo(s, s.sanctify!.windowEnd + 1);
    expect(s.stage).toBe("complete");
    s = tickTo(s, s.tick + 16);
    expect(s.log.join("\n")).toContain("STEADY HAND — sixteen silent ticks");
    s = resolve(s, [{ kind: "publish_retrospective" }], RULES, SEED, HOME);
    expect(s.log.join("\n")).toContain("EMBODIED TRANSMITTED");
    expect(s.retrospectivePublished).toBe(true);
  });
});

describe("The Bargain has teeth", () => {
  it("acceptance pays next-books money, then burns it back as heat, with turbulence", () => {
    let s = eighthRung();
    s = resolve(s, [], RULES, SEED, HOME);
    const wAt = s.sanctify!.whisperAt;
    s = tickTo(s, wAt); // the whisper tick itself
    const storeAtOffer = s.store_eu;
    s = resolve(s, [{ kind: "accept_bargain" }], RULES, SEED, HOME);
    const log1 = s.log.join("\n");
    expect(log1).toContain("THE BARGAIN IS STRUCK");
    expect(s.turbulence).toBeDefined();
    expect(s.sanctifyCooldownUntil).toBeGreaterThan(s.tick);
    expect(s.bargainDebtUntil).toBe(s.tick + BARGAIN_LEVY_TICKS);
    expect(s.stage).toBe("sanctify"); // no rung was earned

    s = resolve(s, [], RULES, SEED, HOME); // grant lands (next-books), levy burns
    expect(s.store_eu).toBeGreaterThan(storeAtOffer + BARGAIN_GRANT_EU - 400); // the money is real
    expect(s.log.join("\n")).toContain("the debt burns — 100 eu of work into waste heat");

    // The whisper cannot return while the cooldown holds.
    s = tickTo(s, s.tick + 4);
    expect(s.sanctify).toBeUndefined();
  });

  it("a wrong-time acceptance is rejected — nothing is being offered", () => {
    let s = eighthRung();
    s = resolve(s, [{ kind: "accept_bargain" }], RULES, SEED, HOME);
    expect(s.log.join("\n")).toContain("nothing is being offered");
    expect(s.bargainDebtUntil).toBe(0);
  });
});

describe("The storms can break the unprepared even in virtue", () => {
  it("a fragile silence fails the window and the Hollow books a return visit", () => {
    let s: SimState = { ...genesisState(), stage: "sanctify", store_eu: 60 };
    s.structures.radiators.panels = 1;
    s.structures.collectors.throttle_milli = 1000;
    s = resolve(s, [], RULES, SEED, HOME);
    const end = s.sanctify!.windowEnd;
    s = tickTo(s, end + 1);
    const log = s.log.join("\n");
    if (log.includes("fades unanswered")) {
      expect(s.stage).toBe("complete"); // the seed was merciful this time
    } else {
      expect(log).toContain("the storms broke you");
      expect(s.stage).toBe("sanctify");
      expect(s.sanctifyCooldownUntil).toBe(end + 1 + SANCTIFY_COOLDOWN);
    }
  });
});

describe("Catch-up walks the temptation identically", () => {
  it("cold replay through whisper + acceptance matches live, hash-exact", async () => {
    let probe = eighthRung();
    probe = resolve(probe, [], RULES, SEED, HOME);
    const wAt = probe.sanctify!.whisperAt;
    const orders = new Map<number, Order[]>();
    orders.set(wAt + 1, [{ kind: "accept_bargain" }]);

    let live = eighthRung();
    for (let t = live.tick + 1; t <= wAt + 6; t++) live = resolve(live, orders.get(t) ?? [], RULES, SEED, HOME);
    const cold = fastForward(eighthRung(), RULES, SEED, wAt + 6, orders, HOME);
    expect(await stateHash(cold)).toBe(await stateHash(live));
    expect(cold.bargainDebtUntil).toBeGreaterThan(0);
  });
});
