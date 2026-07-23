// Read-only operator dashboard — a single self-contained HTML page.
// Served unauthenticated at GET / and /dashboard; it authenticates client-side
// with a bearer token held in localStorage and only ever reads /v1/* endpoints.

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Negentropy — wei-9</title>
<style>
  :root {
    --bg: #0a0e14;
    --panel: #121821;
    --panel2: #0e141c;
    --edge: #1e2a38;
    --ink: #d6e2f0;
    --dim: #7d90a8;
    --accent: #4fd1c5;
    --warn: #f6ad55;
    --hot: #fc8181;
    --good: #68d391;
    --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: radial-gradient(1200px 600px at 70% -10%, #10202b 0%, var(--bg) 60%);
    color: var(--ink);
    font: 14px/1.5 var(--mono);
    min-height: 100vh;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 24px;
    border-bottom: 1px solid var(--edge);
    flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 18px; letter-spacing: 1px; }
  header h1 .dim { color: var(--dim); font-weight: 400; }
  #status { color: var(--dim); font-size: 12px; }
  #status.err { color: var(--hot); }
  main { padding: 24px; max-width: 1100px; margin: 0 auto; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 10px;
    padding: 16px;
  }
  .card h2 {
    margin: 0 0 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--dim);
    font-weight: 600;
  }
  .metric { font-size: 30px; font-weight: 600; line-height: 1.1; }
  .metric small { font-size: 13px; color: var(--dim); font-weight: 400; }
  .sub { color: var(--dim); font-size: 12px; margin-top: 6px; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
  .row span:last-child { color: var(--ink); }
  .row span:first-child { color: var(--dim); }
  .bar {
    height: 12px;
    background: var(--panel2);
    border: 1px solid var(--edge);
    border-radius: 6px;
    overflow: hidden;
    margin: 10px 0 6px;
  }
  .bar > i {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--good), var(--warn) 70%, var(--hot));
    transition: width .4s ease;
  }
  .throttle-bar > i { background: var(--accent); }
  #countdown { color: var(--accent); }
  #log {
    background: var(--panel2);
    border: 1px solid var(--edge);
    border-radius: 8px;
    padding: 10px 12px;
    max-height: 260px;
    overflow-y: auto;
    font-size: 12px;
  }
  #log div { padding: 2px 0; border-bottom: 1px dashed #16202b; color: var(--dim); }
  #log div:last-child { border-bottom: 0; color: var(--ink); }
  .ledger .row span:last-child { font-variant-numeric: tabular-nums; }
  .flare { color: var(--hot); }
  .wide { grid-column: 1 / -1; }
  /* token gate */
  #gate {
    max-width: 420px;
    margin: 12vh auto;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 12px;
    padding: 28px;
  }
  #gate h2 { margin-top: 0; letter-spacing: 1px; }
  #gate p { color: var(--dim); font-size: 13px; }
  #gate input {
    width: 100%;
    padding: 10px 12px;
    background: var(--panel2);
    border: 1px solid var(--edge);
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    margin: 12px 0;
  }
  #gate button, #signout {
    background: var(--accent);
    color: #05201c;
    border: 0;
    border-radius: 8px;
    padding: 10px 16px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  #signout {
    background: transparent;
    color: var(--dim);
    border: 1px solid var(--edge);
    padding: 4px 10px;
    font-size: 12px;
  }
  .hidden { display: none !important; }
</style>
</head>
<body>
  <section id="gate" class="hidden">
    <h2>Negentropy</h2>
    <p>Enter your API token to observe <b>wei-9</b>. It is stored locally in this browser only.</p>
    <input id="token-input" type="password" placeholder="Bearer token" autocomplete="off" />
    <button id="token-save">Connect</button>
  </section>

  <div id="app" class="hidden">
    <header>
      <h1>NEGENTROPY <span class="dim">/ <span id="hdr-identity">…</span></span></h1>
      <div style="display:flex; align-items:center; gap:12px;">
        <span id="status">connecting…</span>
        <button id="signout">sign out</button>
      </div>
    </header>
    <main>
      <div class="grid">
        <div class="card">
          <h2>Identity</h2>
          <div class="metric" id="m-identity">—</div>
          <div class="sub"><span id="m-realm">—</span> · <span id="m-stage">—</span></div>
        </div>
        <div class="card">
          <h2>Tick</h2>
          <div class="metric" id="m-tick">—</div>
          <div class="sub">next in <span id="countdown">—</span></div>
        </div>
        <div class="card">
          <h2>Action Points</h2>
          <div class="metric" id="m-ap">—</div>
          <div class="sub">reflex edit costs 2 AP</div>
        </div>
        <div class="card">
          <h2>Exergy Store</h2>
          <div class="metric" id="m-store">—<small> EU</small></div>
          <div class="sub">available work reserve</div>
        </div>
        <div class="card">
          <h2>Heat Bank</h2>
          <div class="metric" id="m-heat">—<small> EU</small></div>
          <div class="bar"><i id="heat-fill" style="width:0%"></i></div>
          <div class="sub">cap <span id="m-heatcap">—</span> EU (<span id="m-panels2">—</span> panels × 50)</div>
        </div>
        <div class="card">
          <h2>Collectors</h2>
          <div class="metric" id="m-throttle">—<small>%</small></div>
          <div class="bar throttle-bar"><i id="throttle-fill" style="width:0%"></i></div>
          <div class="sub">throttle</div>
        </div>
        <div class="card">
          <h2>Radiators</h2>
          <div class="metric" id="m-panels">—<small> panels</small></div>
          <div class="sub">dissipation capacity</div>
        </div>
        <div class="card ledger">
          <h2>Last Ledger</h2>
          <div class="row"><span>tick</span><span id="l-tick">—</span></div>
          <div class="row"><span>intake</span><span id="l-intake">—</span></div>
          <div class="row"><span>Δ store</span><span id="l-dstore">—</span></div>
          <div class="row"><span>radiated</span><span id="l-rad">—</span></div>
          <div class="row"><span>Δ heat bank</span><span id="l-dheat">—</span></div>
          <div class="row"><span>built</span><span id="l-built">—</span></div>
          <div class="row"><span>flare</span><span id="l-flare">—</span></div>
        </div>
      </div>
      <div class="card wide" style="margin-top:16px;">
        <h2>Log Tail</h2>
        <div id="log"></div>
      </div>
      <div class="card wide" style="margin-top:16px;">
        <h2>Starmap — neighbors, as they were</h2>
        <div id="starmap"><div>— scanning —</div></div>
      </div>
      <div class="card wide" style="margin-top:16px;">
        <h2>Signals</h2>
        <div id="signals"><div>— nothing held —</div></div>
      </div>
    </main>
  </div>

<script>
(function () {
  "use strict";
  var KEY = "neg_token";
  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var statusEl = document.getElementById("status");
  var input = document.getElementById("token-input");
  var timer = null, countdownTimer = null;

  function token() { return localStorage.getItem(KEY); }

  function showGate(msg) {
    if (timer) { clearInterval(timer); timer = null; }
    app.classList.add("hidden");
    gate.classList.remove("hidden");
    input.value = "";
    input.focus();
    if (msg) { input.setAttribute("placeholder", msg); }
  }

  function showApp() {
    gate.classList.add("hidden");
    app.classList.remove("hidden");
  }

  function signOut() {
    localStorage.removeItem(KEY);
    showGate("Bearer token");
  }

  document.getElementById("token-save").addEventListener("click", function () {
    var v = input.value.trim();
    if (!v) return;
    localStorage.setItem(KEY, v);
    showApp();
    start();
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("token-save").click();
  });
  document.getElementById("signout").addEventListener("click", signOut);

  function num(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    return n.toLocaleString("en-US");
  }
  function signed(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    return (n > 0 ? "+" : "") + n.toLocaleString("en-US");
  }
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  async function api(path) {
    var res = await fetch(path, { headers: { Authorization: "Bearer " + token() } });
    if (res.status === 401) { signOut(); throw new Error("401"); }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // Ticks land at 00/06/12/18 UTC — a pure wall-clock boundary.
  var TICK_MS = 6 * 3600 * 1000;
  function nextTickMs() {
    var now = Date.now();
    return Math.ceil((now + 1) / TICK_MS) * TICK_MS;
  }
  function renderCountdown() {
    var ms = nextTickMs() - Date.now();
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    function pad(x) { return (x < 10 ? "0" : "") + x; }
    set("countdown", pad(h) + ":" + pad(m) + ":" + pad(ss));
  }

  function renderSignals(signals) {
    var box = document.getElementById("signals");
    box.innerHTML = "";
    if (!Array.isArray(signals) || !signals.length) {
      var e0 = document.createElement("div");
      e0.textContent = "— nothing held — the beacons pulse every 16 ticks —";
      box.appendChild(e0);
      return;
    }
    signals.slice().reverse().forEach(function (sig) {
      var e = document.createElement("div");
      e.textContent = (sig.decoded ? "✓ " : "· ") + sig.from + "  t" + sig.emitted_t + "→t" + sig.received_t +
        (sig.decoded ? "  " + sig.payload : "  [undecoded — queue a decode_signal order]");
      box.appendChild(e);
    });
  }

  async function renderStarmap() {
    var box = document.getElementById("starmap");
    try {
      var map = await api("/v1/map");
      var rows = [];
      for (var i = 0; i < map.neighbors.length; i++) {
        var n = map.neighbors[i];
        try {
          var v = await api("/v1/systems/" + n.id);
          rows.push(v.system.name + " (" + v.system.class + ")  lag " + v.lag_ticks +
            "  as of t" + v.as_of_tick + "  radiating " + v.signature.radiated_eu + " eu" +
            (v.signature.flare ? "  ⚠ FLARING" : ""));
        } catch (e) {
          rows.push(n.id + "  lag " + n.lag_ticks + "  — too faint —");
        }
      }
      box.innerHTML = "";
      rows.forEach(function (r) {
        var e = document.createElement("div");
        e.textContent = r;
        box.appendChild(e);
      });
    } catch (e) { /* keep last render */ }
  }

  function renderLog(lines) {
    var log = document.getElementById("log");
    log.innerHTML = "";
    if (!Array.isArray(lines) || !lines.length) {
      var e = document.createElement("div");
      e.textContent = "— no events —";
      log.appendChild(e);
      return;
    }
    lines.forEach(function (line) {
      var d = document.createElement("div");
      d.textContent = line;
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
  }

  async function refresh() {
    try {
      var self = await api("/v1/self");
      var sys = await api("/v1/systems/home");

      set("hdr-identity", self.identity || "—");
      set("m-identity", self.identity || "—");
      set("m-realm", self.realm || "—");
      set("m-stage", self.stage || "—");
      set("m-tick", num(self.tick));
      set("m-ap", num(self.ap));

      var flows = sys.flows || {};
      var struct = sys.structures || {};
      var rad = struct.radiators || {};
      var col = struct.collectors || {};

      set("m-store", num(flows.store_eu));
      // rebuild EU suffix stripped by textContent; re-add via innerHTML-safe span
      document.getElementById("m-store").innerHTML = num(flows.store_eu) + '<small> EU</small>';

      var panels = typeof rad.panels === "number" ? rad.panels : 0;
      var cap = panels * 50;
      var heat = typeof flows.heat_bank_eu === "number" ? flows.heat_bank_eu : 0;
      document.getElementById("m-heat").innerHTML = num(heat) + '<small> EU</small>';
      set("m-heatcap", num(cap));
      set("m-panels2", num(panels));
      var pct = cap > 0 ? Math.min(100, (heat / cap) * 100) : (heat > 0 ? 100 : 0);
      document.getElementById("heat-fill").style.width = pct + "%";

      var thr = typeof col.throttle_milli === "number" ? col.throttle_milli : 0;
      var thrPct = thr / 10; // milli (0..1000) -> percent
      document.getElementById("m-throttle").innerHTML = num(Math.round(thrPct)) + '<small>%</small>';
      document.getElementById("throttle-fill").style.width = Math.min(100, thrPct) + "%";

      document.getElementById("m-panels").innerHTML = num(panels) + '<small> panels</small>';

      var l = flows.ledger || {};
      set("l-tick", num(l.tick));
      set("l-intake", num(l.intake_eu));
      set("l-dstore", signed(l.dStore_eu));
      set("l-rad", num(l.heatRadiated_eu));
      set("l-dheat", signed(l.dHeatBank_eu));
      set("l-built", num(l.built_eu));
      var flareEl = document.getElementById("l-flare");
      flareEl.textContent = l.flare ? "⚠ FLARE" : "no";
      flareEl.className = l.flare ? "flare" : "";

      renderLog(sys.log_tail);
      renderSignals(sys.signals);
      renderStarmap();

      statusEl.classList.remove("err");
      statusEl.textContent = "live · updated " + new Date().toLocaleTimeString();
    } catch (err) {
      if (String(err && err.message) === "401") return; // gate already shown
      statusEl.classList.add("err");
      statusEl.textContent = "error: " + (err && err.message ? err.message : "fetch failed");
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    if (countdownTimer) clearInterval(countdownTimer);
    refresh();
    timer = setInterval(refresh, 60000);
    renderCountdown();
    countdownTimer = setInterval(renderCountdown, 1000);
  }

  if (token()) { showApp(); start(); } else { showGate("Bearer token"); }
})();
</script>
</body>
</html>`;
