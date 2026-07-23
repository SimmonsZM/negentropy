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
  /* helm */
  .btn {
    background: var(--accent); color: #05201c; border: 0; border-radius: 8px;
    padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .btn:disabled { opacity: .35; cursor: not-allowed; }
  .btn.ghost { background: transparent; color: var(--dim); border: 1px solid var(--edge); }
  .btn.hot { background: var(--hot); color: #2a0808; }
  .ctl { display: flex; align-items: center; gap: 12px; padding: 8px 0; flex-wrap: wrap; }
  .ctl label { color: var(--dim); font-size: 12px; min-width: 130px; }
  .ctl input[type="range"] { flex: 1; min-width: 160px; accent-color: var(--accent); }
  .ctl .val { min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
  .pill { font-size: 11px; color: var(--dim); border: 1px solid var(--edge); border-radius: 999px; padding: 2px 8px; }
  #tpreview { font-size: 12px; color: var(--dim); }
  #tpreview.danger { color: var(--hot); }
  #queue, #pending { background: var(--panel2); border: 1px solid var(--edge); border-radius: 8px; padding: 8px 12px; font-size: 12px; margin-top: 8px; }
  #queue .qrow, #pending div { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; color: var(--dim); }
  #queue .qrow b { color: var(--ink); font-weight: 500; }
  #queue .qrow button { background: none; border: 0; color: var(--hot); cursor: pointer; font: inherit; }
  #qtotals { margin-top: 8px; font-size: 12px; color: var(--dim); }
  #qtotals.warn { color: var(--warn); }
  #reflex-ta {
    width: 100%; min-height: 220px; background: var(--panel2); border: 1px solid var(--edge);
    border-radius: 8px; color: var(--ink); font: 12px/1.5 var(--mono); padding: 10px 12px; resize: vertical;
  }
  #reflex-result { font-size: 12px; margin-top: 8px; color: var(--dim); }
  #reflex-result.err { color: var(--hot); }
  .sigrow { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 3px 0; }
  .sigrow span { color: var(--dim); }
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
        <h2>Helm — orders resolve at the next tick</h2>
        <div class="ctl">
          <label>Collector throttle</label>
          <input type="range" id="h-thr" min="0" max="100" step="5" value="60" />
          <span class="val" id="h-thr-val">60%</span>
          <button class="btn" id="h-thr-q">Queue <span class="pill">1 AP</span></button>
        </div>
        <div class="ctl">
          <label>Radiator run-temp</label>
          <input type="range" id="h-temp" min="500" max="2000" step="50" value="1000" />
          <span class="val" id="h-temp-val">1000</span>
          <button class="btn" id="h-temp-q">Queue <span class="pill">1 AP</span></button>
        </div>
        <div id="tpreview">dissipation — · failure risk —</div>
        <div class="ctl" style="margin-top:6px;">
          <button class="btn" id="h-build">Build radiator panel <span class="pill">3 AP + 150 eu</span></button>
          <button class="btn hot hidden" id="h-repair">Repair systems <span class="pill">2 AP + 100 eu</span></button>
        </div>
        <div id="queue"><div class="qrow"><span>— no orders staged —</span></div></div>
        <div id="qtotals">stage orders above, then send</div>
        <div class="ctl">
          <button class="btn" id="h-send" disabled>Send orders</button>
          <button class="btn ghost" id="h-discard" disabled>Discard staged</button>
        </div>
        <div id="pending"><div>— nothing queued on the server —</div></div>
      </div>
      <div class="card wide" style="margin-top:16px;">
        <h2>Tribulation — the Migration</h2>
        <div id="trib"><div>—</div></div>
        <div class="ctl">
          <button class="btn hot hidden" id="h-migrate">Begin the Migration <span class="pill">10 AP + 400 eu</span></button>
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
      <div class="card wide" style="margin-top:16px;">
        <h2>Reflexes — your automation is you</h2>
        <div class="ctl">
          <button class="btn ghost" id="rx-open">Open editor</button>
          <span class="pill">saving costs 2 AP · instincts stay locked until Mirror Sight</span>
        </div>
        <div id="rx-box" class="hidden">
          <textarea id="reflex-ta" spellcheck="false"></textarea>
          <div class="ctl">
            <button class="btn" id="rx-save">Save reflexes <span class="pill">2 AP</span></button>
            <button class="btn ghost" id="rx-close">Close</button>
          </div>
          <div id="reflex-result"></div>
        </div>
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

  async function apiSend(path, method, body) {
    var res = await fetch(path, {
      method: method,
      headers: { Authorization: "Bearer " + token(), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) { signOut(); throw new Error("401"); }
    var data = null;
    try { data = await res.json(); } catch (e) { /* noop */ }
    if (!res.ok) throw new Error((data && data.error) ? data.error : "HTTP " + res.status);
    return data;
  }

  // ---- Helm: stage locally, send as one batch, see what's queued server-side ----
  var staged = [];
  var lastSelf = null, lastSys = null;

  function stageOrder(order, label, cost) {
    staged.push({ order: order, label: label, cost: cost });
    renderQueue();
  }

  function renderQueue() {
    var q = document.getElementById("queue");
    q.innerHTML = "";
    if (!staged.length) {
      q.innerHTML = '<div class="qrow"><span>— no orders staged —</span></div>';
    } else {
      staged.forEach(function (it, i) {
        var r = document.createElement("div");
        r.className = "qrow";
        var b = document.createElement("b");
        b.textContent = it.label;
        var right = document.createElement("span");
        right.textContent = it.cost + " AP ";
        var x = document.createElement("button");
        x.textContent = "✕";
        x.addEventListener("click", function () { staged.splice(i, 1); renderQueue(); });
        right.appendChild(x);
        r.appendChild(b);
        r.appendChild(right);
        q.appendChild(r);
      });
    }
    var total = staged.reduce(function (s, it) { return s + it.cost; }, 0);
    var apNow = lastSelf ? lastSelf.ap : 0;
    var apAtResolve = Math.min(30, apNow + 10);
    var t = document.getElementById("qtotals");
    t.textContent = staged.length
      ? "staged " + staged.length + " · " + total + " AP of " + apAtResolve + " available at resolve (banked " + apNow + " +10, cap 30)"
      : "stage orders above, then send";
    t.className = total > apAtResolve ? "warn" : "";
    document.getElementById("h-send").disabled = !staged.length;
    document.getElementById("h-discard").disabled = !staged.length;
  }

  async function loadPending() {
    try {
      var res = await api("/v1/orders");
      var box = document.getElementById("pending");
      box.innerHTML = "";
      if (!res.pending || !res.pending.length) {
        box.innerHTML = "<div><span>— nothing queued on the server —</span></div>";
        return;
      }
      res.pending.forEach(function (pt) {
        pt.orders.forEach(function (o) {
          var r = document.createElement("div");
          var s1 = document.createElement("span");
          s1.textContent = "queued for t" + pt.tick + ": " + o.kind + (o.value_milli !== undefined ? " " + o.value_milli : "");
          r.appendChild(s1);
          box.appendChild(r);
        });
        var rc = document.createElement("div");
        var bc = document.createElement("button");
        bc.className = "btn ghost";
        bc.textContent = "clear t" + pt.tick;
        bc.addEventListener("click", async function () {
          try { await apiSend("/v1/orders", "DELETE", { tick: pt.tick }); loadPending(); }
          catch (e) { statusEl.textContent = "clear failed: " + e.message; }
        });
        rc.appendChild(bc);
        box.appendChild(rc);
      });
    } catch (e) { /* keep last render */ }
  }

  function tempPreview() {
    var T = Number(document.getElementById("h-temp").value);
    var panels = lastSys && lastSys.structures && lastSys.structures.radiators ? lastSys.structures.radiators.panels : 8;
    var D = Math.floor(panels * 50 * Math.pow(T / 1000, 4));
    var riskPerMille = T > 1200 ? Math.floor((T - 1200) / 10) : 0;
    var el = document.getElementById("tpreview");
    el.textContent = "dissipation " + D + " eu/tick at " + panels + " panels · panel failure " +
      (riskPerMille / 10).toFixed(1) + "%/panel/tick" + (riskPerMille > 0 ? "  ⚠ running hot" : "");
    el.className = riskPerMille > 0 ? "danger" : "";
    set("h-temp-val", String(T));
  }

  function wireHelm() {
    var thr = document.getElementById("h-thr");
    thr.addEventListener("input", function () { set("h-thr-val", thr.value + "%"); });
    document.getElementById("h-thr-q").addEventListener("click", function () {
      stageOrder({ kind: "set_throttle", target: "collectors", value_milli: Number(thr.value) * 10 },
        "set_throttle → " + thr.value + "%", 1);
    });
    var temp = document.getElementById("h-temp");
    temp.addEventListener("input", tempPreview);
    document.getElementById("h-temp-q").addEventListener("click", function () {
      stageOrder({ kind: "set_radiator_temp", value_milli: Number(temp.value) },
        "set_radiator_temp → " + temp.value, 1);
    });
    document.getElementById("h-build").addEventListener("click", function () {
      stageOrder({ kind: "build_radiator" }, "build_radiator (150 eu)", 3);
    });
    document.getElementById("h-repair").addEventListener("click", function () {
      stageOrder({ kind: "repair_systems" }, "repair_systems (100 eu)", 2);
    });
    document.getElementById("h-migrate").addEventListener("click", function () {
      stageOrder({ kind: "begin_migration" }, "BEGIN THE MIGRATION (400 eu)", 10);
    });
    document.getElementById("h-discard").addEventListener("click", function () { staged = []; renderQueue(); });
    document.getElementById("h-send").addEventListener("click", async function () {
      try {
        var res = await apiSend("/v1/orders", "POST", { orders: staged.map(function (it) { return it.order; }) });
        statusEl.textContent = "orders queued for tick " + res.queued_for_tick + " · resolves on the countdown";
        staged = [];
        renderQueue();
        loadPending();
      } catch (e) {
        statusEl.classList.add("err");
        statusEl.textContent = "send failed: " + e.message;
      }
    });

    document.getElementById("rx-open").addEventListener("click", async function () {
      try {
        var rules = await api("/v1/reflexes");
        document.getElementById("reflex-ta").value = JSON.stringify(rules, null, 2);
        document.getElementById("rx-box").classList.remove("hidden");
        document.getElementById("reflex-result").textContent = "";
      } catch (e) { /* status already set */ }
    });
    document.getElementById("rx-close").addEventListener("click", function () {
      document.getElementById("rx-box").classList.add("hidden");
    });
    document.getElementById("rx-save").addEventListener("click", async function () {
      var out = document.getElementById("reflex-result");
      var parsed;
      try { parsed = JSON.parse(document.getElementById("reflex-ta").value); }
      catch (e) { out.className = "err"; out.textContent = "not valid JSON: " + e.message; return; }
      try {
        var res = await apiSend("/v1/reflexes", "PUT", parsed);
        out.className = "";
        out.textContent = "saved · " + res.ap_remaining + " AP remaining · complexity " +
          res.cost.map(function (c) { return c.id + ":" + c.complexity; }).join("  ");
        refresh();
      } catch (e) {
        out.className = "err";
        out.textContent = e.message;
      }
    });
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
      e.className = "sigrow";
      var txt = document.createElement("span");
      txt.textContent = (sig.kind === "hail" ? "✉ " : sig.decoded ? "✓ " : "· ") + sig.from + "  t" + sig.emitted_t + "→t" + sig.received_t +
        (sig.decoded ? "  " + sig.payload : "  [undecoded]");
      e.appendChild(txt);
      if (!sig.decoded) {
        var b = document.createElement("button");
        b.className = "btn";
        b.textContent = "stage decode · 1 AP";
        b.addEventListener("click", function () {
          stageOrder({ kind: "decode_signal" }, "decode_signal (" + sig.from + ")", 1);
        });
        e.appendChild(b);
      }
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
          rows.push({ id: n.id, text: v.system.name + " (" + v.system.class + ")  lag " + v.lag_ticks +
            "  as of t" + v.as_of_tick + "  radiating " + v.signature.radiated_eu + " eu" +
            (v.signature.flare ? "  ⚠ FLARING" : "") });
        } catch (e) {
          rows.push({ id: n.id, text: n.id + "  lag " + n.lag_ticks + "  — too faint —" });
        }
      }
      box.innerHTML = "";
      rows.forEach(function (r) {
        var e = document.createElement("div");
        e.className = "sigrow";
        var sp = document.createElement("span");
        sp.textContent = r.text;
        e.appendChild(sp);
        var b = document.createElement("button");
        b.className = "btn ghost";
        b.textContent = "hail · 1 AP";
        b.addEventListener("click", function () {
          var msg = window.prompt("Hail " + r.id + " — one thought, 200 chars, arrives with the light:");
          if (msg && msg.trim()) stageOrder({ kind: "send_hail", to: r.id, text: msg.trim() }, "hail → " + r.id, 1);
        });
        e.appendChild(b);
        box.appendChild(e);
      });
    } catch (e) { /* keep last render */ }
  }

  function renderTrial(sys, self) {
    var box = document.getElementById("trib");
    var btn = document.getElementById("h-migrate");
    btn.classList.add("hidden");
    box.innerHTML = "";
    function line(t, cls) {
      var d = document.createElement("div");
      d.textContent = t;
      if (cls) d.className = cls;
      box.appendChild(d);
    }
    if (sys.realm === "foundation") {
      line("✓ The Migration is behind you. Foundation holds. The climb continues, higher.");
      return;
    }
    if (sys.trial) {
      var left = sys.trial.ends_tick - sys.tick;
      line("ACTIVE — " + left + " tick" + (left === 1 ? "" : "s") + " remain. You vs the copy, same sky, same storms.");
      line("you:  " + sys.trial.you_wealth + " eu");
      line("copy: " + sys.trial.copy_wealth + " eu" + (sys.trial.copy_damaged ? "  (damaged)" : ""));
      line("bar:  " + sys.trial.bar + " eu — beat both, end alive and undamaged");
      return;
    }
    if (sys.migration_cooldown_until > sys.tick) {
      line("The sky is closed until t" + sys.migration_cooldown_until + ". Prepare better.", "flare");
      return;
    }
    if (sys.stage !== "control") {
      line("Locked — reach Control (3/9) first. The climb precedes the leap.");
      return;
    }
    line("ELIGIBLE. The upload copies you exactly — reflexes, instincts, doubts — and the sky tests you both for 12 ticks. Win by out-deciding yourself.");
    btn.classList.remove("hidden");
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
      renderTrial(sys, self);
      renderStarmap();

      lastSelf = self;
      lastSys = sys;
      tempPreview();
      renderQueue();
      loadPending();
      var rep = document.getElementById("h-repair");
      if (sys.damaged) rep.classList.remove("hidden"); else rep.classList.add("hidden");
      var buildBtn = document.getElementById("h-build");
      buildBtn.disabled = (flows.store_eu ?? 0) < 150;
      buildBtn.title = buildBtn.disabled ? "needs 150 eu in store" : "";

      statusEl.classList.remove("err");
      statusEl.textContent = "live · updated " + new Date().toLocaleTimeString();
    } catch (err) {
      if (String(err && err.message) === "401") return; // gate already shown
      statusEl.classList.add("err");
      statusEl.textContent = "error: " + (err && err.message ? err.message : "fetch failed");
    }
  }

  var helmWired = false;
  function start() {
    if (!helmWired) { wireHelm(); helmWired = true; }
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
