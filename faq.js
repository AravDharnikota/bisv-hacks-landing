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

  // Answers are plain text with markdown links: "Join our [Discord](https://discord.gg/...)".
  // The page shows the words as an underlined link and hides the URL.
  // No HTML from the server is trusted. Answers come from a model and are cached,
  // so only link to places we trust. Everything else stays plain text.
  const HOSTS = [
    "bisvhacks.com", "www.bisvhacks.com", "discord.gg", "devpost.com",
    "bisv-hacks.devpost.com", "bisv-hacks-2026.devpost.com",
    "www.instagram.com", "www.linkedin.com", "hcb.hackclub.com",
  ];
  const CONTACT = "bisvhackathon@gmail.com";

  function trusted(href) {
    try {
      const u = new URL(href);
      if (u.protocol === "mailto:") return u.pathname.toLowerCase() === CONTACT;
      return u.protocol === "https:" && !u.username && HOSTS.includes(u.hostname);
    } catch (e) {
      return false;
    }
  }

  // 1-2: [words](url)   3: a bare URL   4: a bare email
  const LINK = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(https?:\/\/[^\s]+[^\s.,)])|([\w.+-]+@[\w-]+\.[\w.-]*\w)/g;

  // What the visitor reads: the link words, without the URLs.
  function plain(text) {
    return text.replace(LINK, (all, words) => words || all);
  }

  function linkify(el, text) {
    el.textContent = "";
    let i = 0;
    for (const m of text.matchAll(LINK)) {
      el.append(text.slice(i, m.index));
      const words = m[1] || m[0];
      const href = m[2] || m[3] || "mailto:" + m[4];
      if (trusted(href)) {
        const a = document.createElement("a");
        a.href = href;
        if (!href.startsWith("mailto:")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        a.textContent = words;
        el.append(a);
      } else {
        el.append(words);
      }
      i = m.index + m[0].length;
    }
    el.append(text.slice(i));
  }

  // The text streams in one word at a time behind a thin cursor.
  // The cursor is CSS: .waiting blinks, .streaming holds still. Resolves when the text is done.
  const WORD_MS = 45;
  function print(el, text) {
    const li = el.parentNode;
    const done = () => {
      el.classList.remove("waiting", "streaming");
      linkify(el, text);
      li.removeAttribute("aria-busy");
    };
    if (still.matches) return Promise.resolve(done());

    // Stream the readable words. The links appear when the text is done.
    const shown = plain(text);
    // Each entry is the end index of one word, with the space after it.
    const ends = [];
    const re = /\S+\s*/g;
    while (re.exec(shown)) ends.push(re.lastIndex);

    el.classList.replace("waiting", "streaming");
    return new Promise((resolve) => {
      const t0 = performance.now();
      // A timer, not requestAnimationFrame: frames stop in a hidden tab, timers only slow down.
      // Time decides the word count, so a slow timer still ends on schedule.
      const timer = setInterval(() => {
        const n = Math.floor((performance.now() - t0) / WORD_MS);
        if (n < ends.length) { el.textContent = shown.slice(0, ends[n]); return; }
        clearInterval(timer);
        done();
        resolve();
      }, WORD_MS);
    });
  }

  function addSlip(question) {
    const li = document.createElement("li");
    li.className = "slip";
    const q = document.createElement("p");
    q.className = "slip-q";
    q.textContent = question;
    const a = document.createElement("p");
    a.className = "slip-a waiting";
    // Screen readers wait for the full answer and do not read each word as it lands.
    li.setAttribute("aria-busy", "true");
    li.append(q, a);
    slips.prepend(li);
    return { li, a };
  }

  /* --- Asking ------------------------------------------------------------ */

  // A random id for this browser. The backend uses it for per-visitor rate limits.
  function visitor() {
    try {
      let id = localStorage.getItem("desk-visitor");
      if (!id) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36)).join("").slice(0, 20);
        localStorage.setItem("desk-visitor", id);
      }
      return id;
    } catch (e) {
      return "";
    }
  }

  async function post(payload) {
    const endpoint = form.dataset.endpoint;
    if (!endpoint) throw new Error("not connected");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      // No Content-Type header on purpose. A JSON header makes the browser send a
      // preflight request first, and Apps Script cannot answer preflight requests.
      const res = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ ...payload, v: visitor() }),
        signal: ctl.signal,
      });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Shown under an answer the desk did not know. The email goes to the team's sheet.
  function addEmailForm(slip, question, ticket) {
    const f = document.createElement("form");
    f.className = "slip-email";
    const field = document.createElement("input");
    field.type = "email";
    field.required = true;
    field.maxLength = 120;
    field.autocomplete = "email";
    field.placeholder = "you@example.com";
    field.setAttribute("aria-label", "Your email, for the reply");
    const send = document.createElement("button");
    send.textContent = "Email me the answer";
    f.append(field, send);
    slip.li.append(f);

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      send.disabled = true;
      const note = document.createElement("p");
      note.className = "slip-note";
      try {
        const out = await post({ action: "email", q: question, email: field.value.trim(), ticket });
        if (out.error) throw new Error(out.error);
        note.textContent = "Saved. The team will email you.";
        f.replaceWith(note);
      } catch (err) {
        send.disabled = false;
        note.textContent = "That did not save. Try again, or email " + CONTACT + ".";
        f.nextElementSibling?.remove();
        f.after(note);
      }
    });
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
    let text, known = true, out = {};
    try {
      out = await post({ q: question });
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
    busy = false;
    button.disabled = false;
    await print(slip.a, text);
    if (out.kind === "unknown") addEmailForm(slip, question, out.ticket);
  });

  document.querySelector(".tries").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    input.value = e.target.textContent;
    form.requestSubmit();
  });
})();
