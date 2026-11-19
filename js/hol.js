/* Higher or Lower: is the next fighter's stat higher or lower?
   Each round picks a random stat (never the same twice in a row).
   The run ends on the first mistake. Equal values count as correct. */
(function () {
  const W = window.WIS;
  const cfg = W.config, E = W.engine, S = W.store, t = W.t;
  const { $, esc, countUp, reducedMotion } = W.ui;

  const rnd = Math.random;
  const pickFrom = (arr) => arr[Math.floor(rnd() * arr.length)];

  W.views.hol = function (root) {
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, reducedMotion() ? 0 : ms));
    let left, right, stat, lastStat = null, score = 0, locked = false;
    const recent = [];

    function nextStat() {
      const options = E.STAT_KEYS.filter((k) => k !== lastStat);
      lastStat = pickFrom(options);
      return lastStat;
    }
    // a fresh opponent: not seen lately, and (if possible) not a tie on this stat
    function nextRight(from, key) {
      const fresh = W.characters.filter((c) => c.id !== from.id && !recent.includes(c.id));
      const pool = fresh.length ? fresh : W.characters.filter((c) => c.id !== from.id);
      const noTie = pool.filter((c) => c.stats[key] !== from.stats[key]);
      const pick = pickFrom(noTie.length ? noTie : pool);
      recent.push(pick.id);
      if (recent.length > 20) recent.shift();
      return pick;
    }

    // the stat name, coloured, explains itself on hover
    const statChip = (cls) =>
      `<span class="stat-chip ${cls || ""}" tabindex="0" data-tip="${esc(t("statDesc")[stat] || "")}">${esc(t("stat." + stat))}</span>`;

    function card(c, side, value, hidden) {
      const tx = W.text(c.id);
      return `<div class="hol-card ${side}">
        ${W.portrait(c)}
        <b class="hc-name">${esc(tx.name)}</b>
        <span class="hc-uni">${esc(tx.universe)}</span>
        <div class="hc-value ${hidden ? "hidden" : ""}"><b ${hidden ? 'id="holValue"' : ""}>${hidden ? "?" : value}</b>${statChip("small")}</div>
      </div>`;
    }

    function hud() {
      const best = S.settings.holBest || 0;
      return `<div class="hud free-hud">
        <div class="free-meta"><b>${t("mode.hol.title")}</b><span>${t("hol.best", { n: best })}</span></div>
        <div class="hud-score"><b id="holScore">${score}</b> ${t("hol.run")}</div>
      </div>`;
    }

    function draw(slide) {
      locked = false;
      const A = W.text(left.id).name, B = W.text(right.id).name, st = t("stat." + stat);
      root.innerHTML = `
        <section class="hol ${slide ? "slide" : ""}">
          ${hud()}
          <h1 class="question hol-q">${t("hol.q", { stat: statChip() })}</h1>
          <div class="hol-arena">
            ${card(left, "left", left.stats[stat], false)}
            <span class="vs" aria-hidden="true">VS</span>
            ${card(right, "right", right.stats[stat], true)}
          </div>
          <p class="hol-ask">${t("hol.ask", { a: `<b>${esc(A)}</b>`, b: `<b>${esc(B)}</b>`, stat: `<span class="stat-word">${esc(st.toLowerCase())}</span>` })}</p>
          <div class="hol-actions">
            <button type="button" class="hol-btn up" data-g="up"><span aria-hidden="true">▲</span> ${t("hol.higher")}</button>
            <button type="button" class="hol-btn down" data-g="down"><span aria-hidden="true">▼</span> ${t("hol.lower")}</button>
          </div>
          <div id="holEnd"></div>
        </section>`;
      root.querySelectorAll(".hol-btn").forEach((b) => b.addEventListener("click", () => answer(b.dataset.g)));
    }

    function answer(guess) {
      if (locked) return;
      locked = true;
      const a = left.stats[stat], b = right.stats[stat];
      const ok = b === a || (guess === "up" ? b > a : b < a);
      root.querySelectorAll(".hol-btn").forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.g === guess) btn.classList.add("chosen");
      });
      W.sound.play("hit");

      const valEl = $("#holValue", root);
      const box = valEl.closest(".hc-value");
      box.classList.remove("hidden");
      countUp(valEl, 0, b, 650);
      W.sound.play("roll", 650);

      later(() => {
        box.classList.add(ok ? "ok" : "no");
        $(".hol-card.right", root).classList.add(ok ? "ok" : "no");
        W.ui.flash(ok ? "good" : "bad");
        if (ok) {
          W.sound.play("win", { run: score + 1 });
          score++;
          countUp($("#holScore", root), score - 1, score, 300);
          later(() => {
            left = right;
            stat = nextStat();
            right = nextRight(left, stat);
            draw(true);
          }, 950);
        } else {
          W.sound.play("lose");
          gameOver();
        }
      }, 700);
    }

    function gameOver() {
      const prevBest = S.settings.holBest || 0;
      const isBest = score > prevBest;
      if (isBest) S.setSetting("holBest", score);
      S.setSetting("holGames", (S.settings.holGames || 0) + 1);

      const end = $("#holEnd", root);
      end.innerHTML = `
        <div class="hol-over">
          <p class="crumb">${t("hol.over")}</p>
          <b class="hol-final">${t("hol.score", { n: score })}</b>
          ${isBest && score > 0 ? `<span class="rank">${t("hol.newBest")}</span>` : `<span class="hol-bestline">${t("hol.best", { n: Math.max(prevBest, score) })}</span>`}
          <div class="hol-over-actions">
            <button type="button" class="btn wide" id="holAgain">${t("hol.again")}</button>
            <button type="button" class="ghost" id="holShare">${t("result.share")}</button>
            <a class="ghost" href="#/">${t("hol.home")}</a>
          </div>
        </div>`;
      $(".hol-actions", root).hidden = true;
      $("#holAgain", end).addEventListener("click", () => { W.sound.play("tap"); start(); window.scrollTo(0, 0); });
      $("#holShare", end).addEventListener("click", () => {
        W.sound.play("tap");
        W.ui.share(cfg.brand + " · " + t("hol.share", { n: score }) + (score >= 5 ? " 🔥" : ""));
      });
      end.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    }

    function start() {
      score = 0;
      recent.length = 0;
      left = pickFrom(W.characters);
      recent.push(left.id);
      stat = nextStat();
      right = nextRight(left, stat);
      draw(false);
    }

    start();
    return () => timers.forEach(clearTimeout);
  };
})();
