// Watchtower (M2d) — decide which resolved log lines deserve a push, and
// shape a digest that a raw Discord webhook accepts natively ({content}),
// while staying honest JSON for any other consumer. Webhooks are lossy by
// contract: no retries, no replays, auto-disable after repeated failure.

const NOTABLE: RegExp[] = [
  /STAGE COMPLETE/,
  /BREAKTHROUGH/,
  /THE MIGRATION BEGINS/,
  /MIGRATION VERDICT/,
  /THE MIGRATION FAILS/,
  /TRIAL EVENT/,
  /HAIL from/,
  /SIGNAL DECODED/,
  /signal received/,
  /ancient beacon pulse/,
  /THERMAL RUNAWAY/,
  /radiator panel failure/,
  /INSTINCT/,
  /HOLLOW WHISPERS/,
  /BARGAIN IS STRUCK/,
  /EMBODIED COMPLETE/,
  /Whisper fades/,
];

export const WEBHOOK_MAX_FAILURES = 5;
const CONTENT_CAP = 1900; // Discord's 2000, with headroom

export function tickOf(line: string): number {
  const m = /^\[t(\d+)\]/.exec(line);
  return m ? Number(m[1]) : -1;
}

export function notableSince(log: string[], afterTick: number): string[] {
  return log.filter((l) => tickOf(l) > afterTick && NOTABLE.some((re) => re.test(l)));
}

export function buildDigest(
  identityName: string,
  systemName: string,
  tick: number,
  store_eu: number,
  heatBank_eu: number,
  lines: string[],
): { content: string; tick: number; identity: string; events: string[] } {
  let content =
    `**NEGENTROPY** · ${identityName} @ ${systemName} · t${tick} · ` +
    `store ${store_eu} eu · heat ${heatBank_eu} eu\n` +
    lines.map((l) => `> ${l}`).join("\n");
  if (content.length > CONTENT_CAP) content = content.slice(0, CONTENT_CAP - 1) + "…";
  return { content, tick, identity: identityName, events: lines };
}

export function validWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}
