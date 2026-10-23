/* Partner wall. Every logo rests as the real logo, in color, so it reads at a glance.
   The glyphs are the motion: every few seconds a band of noise passes over one logo,
   and hovering turns a logo into ASCII in its own colors (the same ramp, wave, and
   noise as the Questions logo) until the pointer leaves and it sweeps back. */

(() => {
  const wall = document.querySelector(".wall");
  if (!wall || !window.HTMLCanvasElement) return;

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const canHover = matchMedia("(hover: hover)").matches;
  const RAMP = "=+*#%@@";            // light to dense, as on the Questions page
  const NOISE = "01/\\|<>[]{}?=+*";
  const FONT = 3;                    // glyph size, px: small enough that letter shapes survive
  const CW = FONT * 0.6, CH = FONT;  // IBM Plex Mono advance, line-height 1
  const SS = 3;                      // samples per glyph, each axis
  const BAND = 0.16;                 // noise band width, fraction of the cell
  const LENS = 18;                   // pointer scramble radius, px
  const cells = [];

  const noise = () => NOISE[(Math.random() * NOISE.length) | 0];
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  class Cell {
    constructor(el) {
      this.el = el;
      this.img = el.querySelector(".p-logo");
      this.canvas = el.querySelector("canvas");
      this.ctx = this.canvas.getContext("2d");
      this.lo = 0; this.hi = 0;      // glyphs cover u in [lo, hi]; u runs 0..1 left to right
      this.anim = null;
      this.hover = false;
      this.px = this.py = -999;
    }

    layout() {
      const { el, img } = this;
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H || !img.naturalWidth) return false;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      Object.assign(this, { W, H, dpr });
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);

      // Optical size: each logo covers about the same ink area, inside safe margins.
      const ratio = img.naturalWidth / img.naturalHeight;
      const area = W * H * 0.15 * (parseFloat(el.dataset.scale) || 1);
      let lw = Math.sqrt(area * ratio), lh = lw / ratio;
      const k = Math.min(1, (W * 0.72) / lw, (H * 0.44) / lh);
      lw *= k; lh *= k;
      const lx = Math.round((W - lw) / 2), ly = Math.round((H - lh) / 2);
      Object.assign(img.style, { left: lx + "px", top: ly + "px", width: lw + "px", height: lh + "px" });
      Object.assign(this, { lx, lw });

      // Sample the logo onto the glyph grid: coverage and the logo's own color per glyph.
      const cols = Math.floor(W / CW), rows = Math.floor(H / CH);
      const gx = (W - cols * CW) / 2, gy = (H - rows * CH) / 2;
      const off = document.createElement("canvas");
      off.width = cols * SS; off.height = rows * SS;
      const o = off.getContext("2d");
      o.drawImage(img, (lx - gx) * SS / CW, (ly - gy) * SS / CH, lw * SS / CW, lh * SS / CH);
      const px = o.getImageData(0, 0, off.width, off.height).data;
      this.glyphs = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let a = 0, R = 0, G = 0, B = 0;
          for (let y = 0; y < SS; y++) {
            let p = ((r * SS + y) * off.width + c * SS) * 4;
            for (let x = 0; x < SS; x++, p += 4) {
              const al = px[p + 3];
              a += al; R += px[p] * al; G += px[p + 1] * al; B += px[p + 2] * al;
            }
          }
          const cov = a / (255 * SS * SS);
          if (cov < 0.2) continue;
          const x = gx + c * CW, y = gy + r * CH;
          this.glyphs.push({
            c, r, x, y, cov,
            u: (x + CW / 2) / W + Math.sin(r * 1.7) * 0.012, // a slightly ragged front
            color: `rgb(${R / a | 0},${G / a | 0},${B / a | 0})`,
          });
        }
      }
      this.draw(performance.now());
      return true;
    }

    // Animate [lo, hi] to new values.
    to(lo, hi, dur) {
      this.anim = { lo0: this.lo, hi0: this.hi, lo, hi, t0: performance.now(), dur };
      kick();
    }

    step(ms) {
      const a = this.anim;
      if (a) {
        const t = Math.min(1, (ms - a.t0) / a.dur), e = ease(t);
        this.lo = a.lo0 + (a.lo - a.lo0) * e;
        this.hi = a.hi0 + (a.hi - a.hi0) * e;
        if (t === 1) {
          this.anim = null;
          if (this.lo >= 1 + BAND) this.lo = this.hi = 0; // a finished sweep resets
        }
      }
      this.draw(ms);
      return !!this.anim || this.hover;
    }

    draw(ms) {
      const { ctx, dpr, W, H, lo, hi } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const t = ms / 1000;
      if (hi > lo) {
        ctx.font = `500 ${FONT}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.textBaseline = "top";
        for (const g of this.glyphs) {
          if (g.u < lo || g.u > hi) continue;
          const front = g.u > hi - BAND || (lo > 0 && g.u < lo + BAND);
          let ch;
          if (front) ch = noise();
          else if (this.hover && Math.hypot(g.x - this.px, g.y - this.py) < LENS) ch = noise();
          else {
            // The Questions logo's idle wave, weighted by how solid the logo is here.
            const v = (0.5 + 0.5 * Math.sin(g.c * 0.22 - g.r * 0.5 + t * 2.2)) * 0.3 + g.cov * 0.7;
            ch = RAMP[Math.min(RAMP.length - 1, (v * RAMP.length) | 0)];
          }
          ctx.fillStyle = g.color;
          ctx.fillText(ch, g.x, g.y);
        }
      }
      // The real logo hides, with a hard edge, wherever glyphs are drawn.
      const half = (BAND / 4) * W;
      const a = lo > 0 ? lo * W + half - this.lx : -1e4;
      const b = hi * W - half - this.lx;
      const m = hi > lo && b > a
        ? `linear-gradient(90deg, #000 ${a}px, transparent ${a}px, transparent ${b}px, #000 ${b}px)`
        : "none";
      this.img.style.webkitMaskImage = m;
      this.img.style.maskImage = m;
    }
  }

  // One loop for the wall, ~30 frames per second, idle when nothing moves.
  let running = false, last = 0;
  function kick() {
    if (running || still.matches) return;
    running = true;
    requestAnimationFrame(function loop(ms) {
      if (ms - last < 33) { requestAnimationFrame(loop); return; }
      last = ms;
      let busy = false;
      for (const cell of cells) if (cell.anim || cell.hover) busy = cell.step(ms) || busy;
      if (busy && !document.hidden) requestAnimationFrame(loop);
      else running = false;
    });
  }

  function bind(cell) {
    const { el } = cell;
    const local = e => { const b = el.getBoundingClientRect(); cell.px = e.clientX - b.left; cell.py = e.clientY - b.top; };
    el.addEventListener("pointerenter", e => {
      if (e.pointerType !== "mouse" || still.matches) return;
      local(e);
      cell.hover = true;
      cell.to(0, 1 + BAND, 520);
    });
    el.addEventListener("pointermove", local);
    el.addEventListener("pointerleave", () => {
      if (!cell.hover) return;
      cell.hover = false; cell.px = cell.py = -999;
      cell.to(1 + BAND, 1 + BAND, 520);
    });
  }

  // Ambient: every few seconds a noise band passes over one resting logo.
  let visible = false;
  function ambient() {
    setTimeout(ambient, 2600 + Math.random() * 1600);
    if (!visible || still.matches || document.hidden) return;
    const idle = cells.filter(c => !c.hover && !c.anim);
    if (!idle.length) return;
    const cell = idle[(Math.random() * idle.length) | 0];
    cell.lo = -BAND; cell.hi = 0;
    cell.to(1 + BAND, 1 + 2 * BAND, 1100);
  }

  function init() {
    wall.querySelectorAll(".p").forEach(el => {
      const cell = new Cell(el);
      cells.push(cell);
      if (canHover) bind(cell);
    });
    cells.forEach(c => c.layout());
    wall.classList.add("ascii");
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.2 }).observe(wall);
    setTimeout(ambient, 1200);
    let t;
    addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => cells.forEach(c => c.layout()), 150); });
  }

  // The glyphs need the mono font, and each logo decoded, before the first sample.
  const imgs = [...wall.querySelectorAll(".p-logo")];
  Promise.all([
    document.fonts ? document.fonts.load(`500 ${FONT}px "IBM Plex Mono"`) : null,
    ...imgs.map(im => (im.decode ? im.decode().catch(() => {}) : null)),
  ]).then(init);
})();
