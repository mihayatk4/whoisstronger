/* Big celebrations drawn over the whole screen.
   W.celebrate.perfect({ pct }) — the slider guess was exactly right:
   gold flash, light rays, shock rings, "PERFECT!" slams in, confetti. */
(function () {
  const W = window.WIS;
  const COLORS = ["#ffd166", "#ffe9a8", "#f59e0b", "#3ee39b", "#ff6b8b", "#5cc8ff", "#ffffff"];

  function confetti(box) {
    const cv = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    box.appendChild(cv);
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const cx = w / 2, cy = h * 0.42;
    const parts = [];
    for (let i = 0; i < 140; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5; // mostly upward
      const speed = 6 + Math.random() * 11;
      parts.push({
        x: cx + (Math.random() - 0.5) * 40, y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 7, h: 3 + Math.random() * 5,
        c: COLORS[i % COLORS.length], round: Math.random() < 0.25
      });
    }
    const start = performance.now(), life = 2600;
    function frame(now) {
      const k = (now - start) / life;
      if (k >= 1 || !cv.isConnected) return;
      g.clearRect(0, 0, w, h);
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      parts.forEach((p) => {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
        if (p.round) { g.beginPath(); g.arc(0, 0, p.h * 0.7, 0, Math.PI * 2); g.fill(); }
        else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1); // flutter
        g.restore();
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  W.celebrate = {
    perfect(opts) {
      opts = opts || {};
      const reduce = W.ui.reducedMotion();
      const box = document.createElement("div");
      box.className = "perfect-fx";
      box.setAttribute("aria-hidden", "true");
      box.innerHTML = `
        <div class="pf-flash"></div>
        <div class="pf-rays"></div>
        <div class="pf-ring"></div><div class="pf-ring r2"></div><div class="pf-ring r3"></div>
        <div class="pf-text"><b>${W.t("perfect.title")}</b><span>${W.t("perfect.sub", { pct: opts.pct })}</span></div>`;
      document.body.appendChild(box);
      if (!reduce) confetti(box);
      setTimeout(() => box.classList.add("out"), reduce ? 1400 : 2000);
      setTimeout(() => box.remove(), reduce ? 1800 : 2700);
    }
  };
})();
