// The instrument panel gets instruments (M3b). Tonight's lesson, automated:
// tsc never type-checks a template literal's CONTENTS, and no prior test
// executed the dashboard. Worse: checking the RAW source is checking the
// wrong artifact — the worker serves the EVALUATED template, where \n has
// already become a real newline. So this test imports the module (vitest
// evaluates it exactly as the worker does) and audits the true payload.
import { describe, expect, it } from "vitest";
import { DASHBOARD_HTML } from "../src/dashboard.js";

function scriptOf(html: string): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no <script> block in dashboard");
  return m[1];
}

describe("the dashboard, as actually served", () => {
  it("carries exactly one script block, and it parses as JavaScript", () => {
    const blocks = DASHBOARD_HTML.match(/<script>/g) ?? [];
    expect(blocks.length).toBe(1);
    const js = scriptOf(DASHBOARD_HTML);
    // new Function() COMPILES the body without executing it: a raw newline
    // inside a quoted string — the exact bug that blanked the page — throws
    // a SyntaxError right here instead of in someone's browser at 1 AM.
    expect(() => new Function(js)).not.toThrow();
  });

  it("every element the script asks for exists in the markup", () => {
    const js = scriptOf(DASHBOARD_HTML);
    const have = new Set([...DASHBOARD_HTML.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const want = new Set([...js.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]));
    const missing = [...want].filter((id) => !have.has(id));
    expect(missing).toEqual([]);
  });

  it("the div tree balances and the boot line exists to reveal the page", () => {
    const opens = (DASHBOARD_HTML.match(/<div\b/g) ?? []).length;
    const closes = (DASHBOARD_HTML.match(/<\/div>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(DASHBOARD_HTML).toContain('if (token()) { showApp(); start(); } else { showGate("Bearer token"); }');
    expect(DASHBOARD_HTML.trimEnd().endsWith("</html>")).toBe(true);
  });
});
