// The registration form. One question per screen, like Typeform, with no Typeform.
//
// Answers go to a Google Apps Script web app (backend/Register.gs) that appends one row
// to a Google Sheet. The URL is data-endpoint on the form. Setup is in the README ("Registration").
//
// Keyboard: Enter continues. Shift+Enter makes a new line in the long answer. Up and Down
// arrows move between questions. On a choice question, the letter on each option picks it.
// Progress is kept in localStorage, so a refresh does not lose anything.

(function () {
  "use strict";

  const form = document.querySelector("form.flow");
  if (!form) return;

  const DRAFT_KEY = "bisv-register";
  const CONTACT = "bisvhackathon@gmail.com";
  const MAX_TEAM = 4; // teammates, not counting the applicant
  const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const all = Array.from(form.querySelectorAll(".step"));
  const bar = document.querySelector(".progress");
  const barFill = bar && bar.querySelector("span");
  const nav = document.querySelector(".stepnav");
  const navCount = nav && nav.querySelector(".stepnav-count");
  const navPrev = nav && nav.querySelector(".stepnav-prev");
  const navNext = nav && nav.querySelector(".stepnav-next");

  const answers = {};   // name -> value. teamEmails is an array.
  let current = 0;      // index into all
  let moving = false;
  let sent = false;

  /* --- Which steps show --------------------------------------------------- */

  // data-when="hasTeam=Yes" shows a step only when that answer matches.
  function shows(step) {
    const when = step.dataset.when;
    if (!when) return true;
    const [key, value] = when.split("=");
    return answers[key] === value;
  }

  const visible = () => all.filter(shows);
  const questions = () => visible().filter(s => s.dataset.kind && s.dataset.step !== "review");
  const isQuestion = s => Boolean(s.dataset.kind);

  function renumber() {
    questions().forEach((s, i) => {
      const n = s.querySelector(".step-n .n");
      if (n) n.textContent = String(i + 1);
    });
  }

  /* --- Reading and writing answers --------------------------------------- */

  function read(step) {
    const kind = step.dataset.kind;
    const name = step.dataset.step;
    if (kind === "choice") {
      const on = step.querySelector('.choice[aria-checked="true"]');
      return on ? on.dataset.value : "";
    }
    if (kind === "people") {
      return Array.from(step.querySelectorAll(".person input")).map(i => i.value.trim()).filter(Boolean);
    }
    if (kind === "review") return undefined;
    const input = step.querySelector("input, textarea");
    void name;
    return input ? input.value.trim() : "";
  }

  function write(step, value) {
    const kind = step.dataset.kind;
    if (kind === "choice") {
      step.querySelectorAll(".choice").forEach(c => c.setAttribute("aria-checked", String(c.dataset.value === value)));
      return;
    }
    if (kind === "people") {
      const list = Array.isArray(value) && value.length ? value : [""];
      const wrap = step.querySelector(".people");
      wrap.innerHTML = "";
      list.slice(0, MAX_TEAM).forEach(v => addPerson(step, v));
      return;
    }
    const input = step.querySelector("input, textarea");
    if (input && typeof value === "string") input.value = value;
  }

  function collect() {
    all.forEach(s => {
      if (!isQuestion(s) || s.dataset.kind === "review") return;
      answers[s.dataset.step] = read(s);
    });
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(answers)); } catch (e) { /* private mode */ }
  }

  function loadDraft() {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { draft = null; }
    if (!draft || typeof draft !== "object") return;
    Object.assign(answers, draft);
    all.forEach(s => { if (isQuestion(s) && s.dataset.step in draft) write(s, draft[s.dataset.step]); });
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  /* --- Validation ---------------------------------------------------------- */

  function digits(s) { return (s.match(/\d/g) || []).length; }

  // Returns an error message, or "" when the answer is fine.
  function problem(step) {
    const kind = step.dataset.kind;
    const optional = "optional" in step.dataset;
    const v = read(step);
    if (kind === "review") return "";
    if (kind === "choice") return v ? "" : "Pick one to continue.";
    if (kind === "people") {
      const inputs = Array.from(step.querySelectorAll(".person input"));
      const seen = new Set();
      for (const input of inputs) {
        const e = input.value.trim().toLowerCase();
        if (!e) { if (inputs.length === 1) return "Add at least one teammate, or go back and pick No."; return "Fill in or remove the empty row."; }
        if (!EMAIL.test(e)) return `"${input.value.trim()}" does not look like an email.`;
        if (e === String(answers.email || "").toLowerCase()) return "That is your own email. List your teammates.";
        if (seen.has(e)) return `${input.value.trim()} is listed twice.`;
        seen.add(e);
      }
      return "";
    }
    if (!v) return optional ? "" : "This one is required.";
    if (kind === "email") return EMAIL.test(v) ? "" : "That does not look like an email.";
    if (kind === "tel") return digits(v) >= 7 && digits(v) <= 15 ? "" : "That does not look like a phone number.";
    if (kind === "number") {
      const n = Number(v);
      if (!Number.isInteger(n)) return "Whole numbers only.";
      if (n < 12 || n > 20) return "BISV Hacks is for high school students. Email us if this is right: " + CONTACT;
      return "";
    }
    if (kind === "long" && v.length < 20) return "A little more. Two or three sentences.";
    if (kind === "text" && v.length < 2) return "A little more, please.";
    return "";
  }

  function showError(step, msg) {
    const err = step.querySelector(".err");
    if (err) err.textContent = msg;
    step.classList.toggle("has-error", Boolean(msg));
    if (msg && !reduceMotion) {
      step.classList.remove("shake");
      void step.offsetWidth; // restart the animation
      step.classList.add("shake");
    }
  }

  /* --- Moving between steps ---------------------------------------------- */

  // Text questions focus their field. Choice, review, and done screens focus the screen itself,
  // so no option wears a focus ring before the person has touched anything. Keys still work.
  function focusFirst(step) {
    const kind = step.dataset.kind;
    const target = kind === "choice" || kind === "review" || step.classList.contains("is-done")
      ? step
      : step.querySelector('input:not([type="hidden"]), textarea, .button');
    if (!target) return;
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    if (target.tagName === "INPUT" && target.type === "text") {
      const n = target.value.length;
      try { target.setSelectionRange(n, n); } catch (e) { /* number inputs */ }
    }
  }

  function updateChrome() {
    const step = all[current];
    const qs = questions();
    const i = qs.indexOf(step);
    const total = qs.length;
    const done = step.classList.contains("is-done");
    const intro = step.classList.contains("is-intro");
    const review = step.classList.contains("is-review");
    let pct = 0;
    if (done) pct = 100;
    else if (review) pct = Math.round(100 * total / (total + 1));
    else if (i >= 0) pct = Math.round(100 * i / (total + 1));
    if (barFill) barFill.style.width = pct + "%";
    if (bar) bar.setAttribute("aria-valuenow", String(pct));

    if (nav) {
      nav.hidden = intro || done;
      if (navCount) navCount.textContent = i >= 0 ? `${i + 1} of ${total}` : review ? "Review" : "";
      if (navPrev) navPrev.disabled = current <= 1;
      if (navNext) navNext.disabled = review || current >= all.length - 2;
    }
  }

  function go(index, dir) {
    if (moving || index === current || index < 0 || index >= all.length) return;
    const from = all[current];
    const to = all[index];
    moving = true;
    current = index;
    renumber();
    updateChrome();

    if (reduceMotion) {
      from.hidden = true;
      to.hidden = false;
      moving = false;
      focusFirst(to);
      return;
    }

    from.classList.add(dir > 0 ? "leave-up" : "leave-down");
    to.hidden = false;
    to.classList.add(dir > 0 ? "enter-from-below" : "enter-from-above");
    void to.offsetWidth;
    to.classList.add("is-entering");
    to.classList.remove("enter-from-below", "enter-from-above");

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      from.hidden = true;
      from.classList.remove("leave-up", "leave-down");
      to.classList.remove("is-entering");
      moving = false;
      focusFirst(to);
    };
    to.addEventListener("transitionend", settle, { once: true });
    setTimeout(settle, 450);
  }

  // The next step that shows, after index.
  function nextIndex(from) {
    for (let i = from + 1; i < all.length; i++) if (shows(all[i])) return i;
    return -1;
  }
  function prevIndex(from) {
    for (let i = from - 1; i >= 0; i--) if (shows(all[i])) return i;
    return -1;
  }

  function next() {
    const step = all[current];
    if (step.classList.contains("is-done")) return;
    if (isQuestion(step)) {
      const msg = problem(step);
      showError(step, msg);
      if (msg) { focusFirst(step); return; }
      answers[step.dataset.step] = read(step);
      saveDraft();
    }
    if (step.classList.contains("is-review")) { submit(); return; }
    const i = nextIndex(current);
    if (i < 0) return;
    if (all[i].classList.contains("is-review")) fillReview();
    go(i, 1);
  }

  function prev() {
    if (all[current].classList.contains("is-done")) return;
    const i = prevIndex(current);
    if (i < 0) return;
    go(i, -1);
  }

  function jumpTo(name) {
    const i = all.findIndex(s => s.dataset.step === name);
    if (i >= 0 && shows(all[i])) go(i, i > current ? 1 : -1);
  }

  /* --- Team members -------------------------------------------------------- */

  function addPerson(step, value) {
    const wrap = step.querySelector(".people");
    const rows = wrap.querySelectorAll(".person");
    if (rows.length >= MAX_TEAM) return null;
    const row = document.createElement("div");
    row.className = "person";
    const input = document.createElement("input");
    input.type = "email";
    input.inputMode = "email";
    input.autocomplete = "off";
    input.maxLength = 120;
    input.placeholder = "teammate@example.com";
    input.setAttribute("aria-label", "Teammate " + (rows.length + 1) + " email");
    if (value) input.value = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", "Remove this person");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      if (wrap.querySelectorAll(".person").length === 1) { input.value = ""; input.focus(); return; }
      row.remove();
      relabel(step);
      showError(step, "");
      const last = wrap.querySelector(".person:last-child input");
      if (last) last.focus();
    });
    row.append(input, remove);
    wrap.append(row);
    relabel(step);
    return input;
  }

  function relabel(step) {
    const rows = step.querySelectorAll(".person");
    rows.forEach((r, i) => r.querySelector("input").setAttribute("aria-label", "Teammate " + (i + 1) + " email"));
    const add = step.querySelector(".add");
    if (add) add.hidden = rows.length >= MAX_TEAM;
  }

  /* --- Review ------------------------------------------------------------ */

  const LABELS = {
    name: "Name", grade: "Grade", age: "Age", school: "School", email: "Email", phone: "Phone",
    diet: "Dietary restrictions", parentEmail: "Parent or guardian", built: "Something you built",
    hasTeam: "Team", teamEmails: "Teammates",
  };

  function fillReview() {
    const dl = form.querySelector(".summary");
    if (!dl) return;
    dl.innerHTML = "";
    questions().forEach(step => {
      const key = step.dataset.step;
      let v = answers[key];
      if (Array.isArray(v)) v = v.join(", ");
      if (!v) v = key === "diet" ? "None" : "";
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = LABELS[key] || key;
      const dd = document.createElement("dd");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "edit";
      btn.textContent = v;
      btn.setAttribute("aria-label", "Change " + (LABELS[key] || key));
      btn.addEventListener("click", () => jumpTo(key));
      dd.append(btn);
      row.append(dt, dd);
      dl.append(row);
    });
  }

  /* --- Sending ----------------------------------------------------------- */

  async function post(payload) {
    const endpoint = form.dataset.endpoint;
    if (!endpoint) throw new Error("not connected");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      // No Content-Type header on purpose. A JSON header makes the browser send a
      // preflight request first, and Apps Script cannot answer preflight requests.
      const res = await fetch(endpoint, { method: "POST", body: JSON.stringify(payload), signal: ctl.signal });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function submit() {
    if (sent) return;
    const review = all[current];
    const button = review.querySelector(".submit");
    collect();
    // Check everything once more, in case an answer was changed from the review.
    for (const step of questions()) {
      const msg = problem(step);
      if (msg) { showError(step, msg); jumpTo(step.dataset.step); return; }
    }
    const payload = {
      name: answers.name, grade: answers.grade, age: answers.age, school: answers.school,
      email: answers.email, phone: answers.phone, diet: answers.diet || "", parentEmail: answers.parentEmail,
      built: answers.built, hasTeam: answers.hasTeam,
      teamEmails: answers.hasTeam === "Yes" ? answers.teamEmails || [] : [],
      website: form.elements.website ? form.elements.website.value : "",
      page: location.href,
    };

    button.disabled = true;
    button.textContent = "Sending…";
    showError(review, "");
    try {
      const out = await post(payload);
      if (!out || out.error) throw new Error((out && out.error) || "bad reply");
      sent = true;
      clearDraft();
      const done = all.find(s => s.classList.contains("is-done"));
      done.querySelector(".done-name").textContent = String(answers.name).split(/\s+/)[0];
      done.querySelector(".done-email").textContent = answers.email;
      go(all.indexOf(done), 1);
    } catch (err) {
      const msg = err && err.message === "not connected"
        ? "Registration is not connected yet. Email " + CONTACT + " and we will register you by hand."
        : err && err.name === "AbortError"
          ? "That took too long. Check your connection and try again, or email " + CONTACT + "."
          : err && err.message && err.message !== "bad reply" && !/fetch|network/i.test(err.message)
            ? err.message
            : "Could not send. Check your connection and try again, or email " + CONTACT + ".";
      showError(review, msg);
      button.disabled = false;
      button.textContent = "Submit";
    }
  }

  /* --- Wiring ------------------------------------------------------------ */

  const typing = el => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes(el.type)));

  form.addEventListener("submit", e => { e.preventDefault(); next(); });

  form.addEventListener("click", e => {
    const choice = e.target.closest(".choice");
    if (choice) {
      const step = choice.closest(".step");
      step.querySelectorAll(".choice").forEach(c => c.setAttribute("aria-checked", String(c === choice)));
      answers[step.dataset.step] = choice.dataset.value;
      showError(step, "");
      saveDraft();
      setTimeout(next, reduceMotion ? 0 : 260);
      return;
    }
    if (e.target.closest(".next")) { e.preventDefault(); next(); return; }
    const add = e.target.closest(".add");
    if (add) {
      const step = add.closest(".step");
      const input = addPerson(step);
      if (input) input.focus();
    }
  });

  form.addEventListener("input", e => {
    const step = e.target.closest(".step");
    if (step && step.classList.contains("has-error")) showError(step, "");
  });

  document.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = all[current];
    const t = e.target;

    if (e.key === "Enter") {
      if (t.tagName === "TEXTAREA" && e.shiftKey) return;        // new line
      if (t.tagName === "BUTTON" || t.tagName === "A") return;    // the button handles it
      e.preventDefault();
      next();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.type === "number")) return;
      e.preventDefault();
      if (e.key === "ArrowDown") next(); else prev();
      return;
    }
    if (step.dataset.kind === "choice" && !typing(t) && e.key.length === 1) {
      const key = e.key.toUpperCase();
      const hit = Array.from(step.querySelectorAll(".choice")).find(c => c.querySelector("kbd").textContent.trim().toUpperCase() === key);
      if (hit) { e.preventDefault(); hit.click(); }
    }
  });

  if (navPrev) navPrev.addEventListener("click", prev);
  if (navNext) navNext.addEventListener("click", next);

  // People step: Enter on a filled row that is not the last one moves down a row.
  form.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const row = e.target.closest(".person");
    if (!row) return;
    const nextRow = row.nextElementSibling;
    if (nextRow && e.target.value.trim()) { e.preventDefault(); e.stopPropagation(); nextRow.querySelector("input").focus(); }
  }, true);

  /* --- Start ------------------------------------------------------------- */

  all.forEach((s, i) => { s.hidden = i !== 0; });
  const peopleStep = all.find(s => s.dataset.kind === "people");
  if (peopleStep) addPerson(peopleStep);
  loadDraft();
  renumber();
  updateChrome();
})();
