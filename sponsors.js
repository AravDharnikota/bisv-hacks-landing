/* Sponsors page: partner logos drawn as text, in the same hand as the Questions
   page glyph (faq.js). Each logo is a mask: k = ink, r = red, space = paper.
   The masks are the assets; the page shows the partner's name until this runs. */

(() => {
  const LOGOS = {
    // Hack Club's pennant: a leaning pole, a wavy flag with a swallowtail, HACK CLUB cut out as paper.
    "hack-club": [
      "  kk    rrrrrrrrrrrrrrrrrrrrrrr",
      "  kkrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr                rrrrrrrrrrrr",
      "  kkrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "  kkrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "  kkrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "  kkrrr  rr  rr    rrr     r  rr  rrrr     r  rrrrr  rr  r     rrrrrr",
      " kk rrr  rr  r  rr  r  rrrrr  r  rrrr  rrrrr  rrrrr  rr  r  rr  rrrr",
      " kk rrr      r      r  rrrrr    rrrrr  rrrrr  rrrrr  rr  r     rrrrrr",
      " kk rrr  rr  r  rr  r  rrrrr  r  rrrr  rrrrr  rrrrr  rr  r  rr  rrrrrr",
      " kk rrr  rr  r  rr  rr     r  rr  rrrr     r      rr    rr     rrrrrrrr",
      " kk rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      " kk rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "kk  rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "kk  rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "kk       rrrrrrrrrrrrrrrrrr",
      "kk",
      "kk",
      "kk",
    ],
    // Stellar Learning's shooting star: a four-point star with sparks and speed lines, then the wordmark.
    "stellar": [
      "  r                 rrrr",
      "rrrrr            rrrr",
      "  r    r      rrrr",
      "           rrrr    rrrr",
      "     r  rrrr    rrrr      kkkk   kk          kk kk",
      "     r       rrrr        kk  kk  kk          kk kk",
      "    rrr   rrrr    rrrr   kk     kkkkk  kkkk  kk kk  kkkk  kk",
      "   rrrrr       rrrr       kkkk   kk   kk  kk kk kk     kk kk",
      "rrrrrrrrrrr rrrr             kk  kk   kkkkkk kk kk  kkkkk kk",
      "   rrrrr         rrrr    kk  kk  kk   kk     kk kk kk  kk kk",
      "    rrr       rrrr        kkkk    kkk  kkkk  kk kk  kkkkk kk",
      "     r      r",
      "     r     rrr",
      "            r",
    ],
  };

  // The dense end of the Questions glyph's ramp, with its diagonal wave frozen on one frame.
  // Red fills are broad, so they can carry more texture; ink strokes are thin and stay heavy.
  const RAMP = { r: "#%@@", k: "%@@" };
  function glyphAt(x, y, color) {
    const ramp = RAMP[color];
    const v = 0.5 + 0.5 * Math.sin(x * 0.22 - y * 0.5 + 1.1);
    return ramp[Math.min(ramp.length - 1, (v * ramp.length) | 0)];
  }

  function draw(el, mask) {
    const cols = Math.max(...mask.map((row) => row.length));
    const pre = document.createElement("pre");
    let run = "", runColor = "";
    const flush = () => {
      if (!run) return;
      if (runColor === "r") {
        const span = document.createElement("span");
        span.className = "r";
        span.textContent = run;
        pre.append(span);
      } else {
        pre.append(run);
      }
      run = "";
    };
    for (let y = 0; y < mask.length; y++) {
      const row = mask[y].padEnd(cols);
      for (let x = 0; x < cols; x++) {
        const cell = row[x];
        const color = cell === "r" ? "r" : "k";
        if (color !== runColor) { flush(); runColor = color; }
        run += cell === " " ? " " : glyphAt(x, y, color);
      }
      run += "\n";
    }
    flush();
    el.style.setProperty("--cols", cols);
    el.replaceChildren(pre);
  }

  for (const el of document.querySelectorAll(".partner-art[data-logo]")) {
    const mask = LOGOS[el.dataset.logo];
    if (mask) draw(el, mask);
  }
})();
