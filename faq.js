/* Questions page: an ASCII logo that listens, thinks, and prints answers.
   The backend is a Google Apps Script web app (backend/Code.gs). */

(() => {
  // Logo mask, sampled from images/logo.png. k = ink, r = red.
  const MASK = [
    "        kkkkkkkkkkkkkkkkkkkk                 rrr",
    "       kkkkkkkkkkkkkkkkkkkkkkk              rrrrrr",
    "     kkkkkkkkkkkkkkkkkkkkkkkkkk             rrrrrrr",
    "                       kkkkkkkk             rrrrrrr",
    "                        kkkkkkk            rrrrrrr",
    "   kkkkkkkkkkkkkkkkkkkkkkkkkkk rrrrrrrrrrrrrrrrrrr",
    "   kkkkkkkkkkkkkkkkkkkkkkkkk  rrrrrrrrrrrrrrrrrrrr",
    "   kkkkkkkkkkkkkkkkkkkkkkkkkk  rrrrrrrrrrrrrrrrrr",
    "  kkkkkkk              kkkkkkk            rrrrrrr",
    "  kkkkkkk             kkkkkkkk            rrrrrrr",
    "  kkkkkkkkkkkkkkkkkkkkkkkkkkk             rrrrrrr",
    "  kkkkkkkkkkkkkkkkkkkkkkkkkk              rrrrrr",
    "    kkkkkkkkkkkkkkkkkkkkkk               rrrrrrr",
  ];
  const COLS = 52;
  const RAMP = "=+*#%@@";            // light to dense
  const NOISE = "01/\\|<>[]{}?=+*";  // used while thinking

  const ink = document.querySelector(".glyph-ink");
  const red = document.querySelector(".glyph-red");
  const form = document.querySelector(".ask");
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const status = document.querySelector(".status");
  const slips = document.querySelector(".slips");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let mode = "idle"; // idle | thinking | settle
  let settleUntil = 0;

  /* --- The logo ---------------------------------------------------------- */

  function glyphAt(x, y, t) {
    if (still.matches) return "#";
    if (mode === "thinking") {
      // A band of noise sweeps across the logo. Outside the band the logo goes thin.
      const band = (x + y * 2 - t * 40) % 70;
      return band > -14 && band < 0
        ? NOISE[(Math.random() * NOISE.length) | 0]
        : ":";
    }
    if (mode === "settle") return "@";
    // Idle: a slow diagonal wave moves through the dense end of the ramp.
    const v = 0.5 + 0.5 * Math.sin(x * 0.22 - y * 0.5 + t * 1.1);
    return RAMP[Math.min(RAMP.length - 1, (v * RAMP.length) | 0)];
  }

  function draw(ms) {
    const t = ms / 1000;
    if (mode === "settle" && ms > settleUntil) mode = "idle";
    let a = "", b = "";
    for (let y = 0; y < MASK.length; y++) {
      const row = MASK[y].padEnd(COLS);
      for (let x = 0; x < COLS; x++) {
        const g = row[x] === " " ? " " : glyphAt(x, y, t);
        a += row[x] === "k" ? g : " ";
        b += row[x] === "r" ? g : " ";
      }
      a += "\n"; b += "\n";
    }
    ink.textContent = a;
    red.textContent = b;
  }

  // 12 frames per second is enough for text and costs almost nothing.
  let last = 0;
  function loop(ms) {
    if (ms - last > 83) { last = ms; draw(ms); }
    if (!still.matches && !document.hidden) requestAnimationFrame(loop);
  }
  function start() { draw(performance.now()); requestAnimationFrame(loop); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
  still.addEventListener("change", start);
  start();

  function setMode(next) {
    mode = next;
    if (next === "settle") settleUntil = performance.now() + 350;
    if (still.matches) draw(performance.now());
  }

  /* --- Printing an answer ------------------------------------------------ */

  // Turn emails and links in plain text into real links. No HTML from the server is trusted.
  function linkify(el, text) {
    el.textContent = "";
    const re = /(https?:\/\/[^\s]+[^\s.,)])|([\w.+-]+@[\w-]+\.[\w.-]*\w)/g;
    let i = 0, m;
    while ((m = re.exec(text))) {
      el.append(text.slice(i, m.index));
      const a = document.createElement("a");
      a.href = m[1] ? m[1] : "mailto:" + m[2];
      a.textContent = m[0];
      el.append(a);
      i = m.index + m[0].length;
    }
    el.append(text.slice(i));
  }

  // The text resolves left to right, with a few noisy characters at the leading edge.
  function print(el, text) {
    if (still.matches) return linkify(el, text);
    const total = Math.min(1100, 300 + text.length * 6);
    const t0 = performance.now();
    (function step(now) {
      const n = Math.floor(((now - t0) / total) * text.length);
      if (n >= text.length) return linkify(el, text);
      let edge = "";
      for (let i = n; i < Math.min(text.length, n + 3); i++) {
        edge += text[i] === " " ? " " : NOISE[(Math.random() * NOISE.length) | 0];
      }
      el.textContent = text.slice(0, n) + edge;
      requestAnimationFrame(step);
    })(t0);
  }

  function addSlip(question) {
    const li = document.createElement("li");
    li.className = "slip";
    const q = document.createElement("p");
    q.className = "slip-q";
    q.textContent = question;
    const a = document.createElement("p");
    a.className = "slip-a";
    li.append(q, a);
    slips.prepend(li);
    return { li, a };
  }

  /* --- Asking ------------------------------------------------------------ */

  async function ask(question) {
    const endpoint = form.dataset.endpoint;
    if (!endpoint) throw new Error("not connected");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      // No Content-Type header on purpose. A JSON header makes the browser send a
      // preflight request first, and Apps Script cannot answer preflight requests.
      const res = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ q: question }),
        signal: ctl.signal,
      });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    busy = true;
    button.disabled = true;
    input.value = "";
    status.textContent = "Looking it up";
    setMode("thinking");

    const slip = addSlip(question);
    let text, known = true;
    try {
      const out = await ask(question);
      if (out.error) { text = out.error; known = false; }
      else { text = out.answer; known = out.known; }
    } catch (err) {
      known = false;
      text = err.message === "not connected"
        ? "The question desk is not connected yet. Email bisvhackathon@gmail.com."
        : "The answer did not arrive. Check your connection and ask again, or email bisvhackathon@gmail.com.";
    }

    if (!known) slip.li.classList.add("unknown");
    setMode("settle");
    status.textContent = "";
    print(slip.a, text);
    busy = false;
    button.disabled = false;
  });

  document.querySelector(".tries").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    input.value = e.target.textContent;
    form.requestSubmit();
  });
})();
