/* Mode 2: "Guess the character" - six hints, from vague to exact. */
(function () {
  const W = window.WIS;
  const cfg = W.config, E = W.engine, S = W.store, t = W.t;
  const { $, esc, tierChip } = W.ui;

  W.views.guess = function (root, key) {
    const idx = E.dayIndex(key);
    const targetId = E.guessTarget(idx);
    const hints = E.hints(targetId);

    /* How hard today's hidden fighter is to guess: 1-3 bars + a word. */
    function diffBadge() {
      const d = W.char(targetId).diff || "medium";
      const n = { easy: 1, medium: 2, hard: 3 }[d];
      return `<span class="diff ${d}" title="${t("diff.help")}"><i class="${n >= 1 ? "on" : ""}"></i><i class="${n >= 2 ? "on" : ""}"></i><i class="${n >= 3 ? "on" : ""}"></i>${t("diff." + d)}</span>`;
    }

    /* One wrong guess: green tile = same as the hidden fighter, red = different,
       arrow on tier = the hidden fighter is stronger (↑) or weaker (↓). */
    function compareRow(id, isNew) {
      const tiles = E.compare(id, targetId).map((c) => {
        const arrow = c.dir === "up" ? " ↑" : c.dir === "down" ? " ↓" : "";
        const tip = c.dir ? ` title="${t(c.dir === "up" ? "guess.higher" : "guess.lower")}"` : "";
        const sr = c.dir ? `<span class="sr">${t(c.dir === "up" ? "guess.higher" : "guess.lower")}</span>` : "";
        return `<span class="cmp ${c.ok ? "ok" : "no"}"${tip}><small>${t("cmp." + c.key)}</small><b>${esc(c.value)}${arrow}</b>${sr}</span>`;
      }).join("");
      return `<li class="${isNew ? "fresh" : ""}">
        <div class="cmp-who">${W.portrait(W.char(id))}<b>${esc(W.text(id).name)}</b></div>
        <div class="cmp-tiles">${tiles}</div>
      </li>`;
    }

    function draw(fresh) {
      const g = S.day(key).guess;
      if (g.done) return drawDone(g);

      const wrong = g.guesses.length;
      const open = Math.min(hints.length, wrong + 1);

      const list = hints.map((h, i) => {
        const pts = cfg.guessPoints[i];
        if (i < open) {
          return `<li class="hint open hint-${h.kind} ${fresh && i === open - 1 ? "fresh" : ""} ${i === open - 1 ? "current" : ""}">
            <span class="hint-n">${i + 1}</span>
            <div class="hint-body"><small>${t("hint." + h.kind)}</small><p>${esc(h.text)}</p></div>
            <span class="hint-pts">${pts}</span>
          </li>`;
        }
        return `<li class="hint locked">
          <span class="hint-n">${i + 1}</span>
          <div class="hint-body"><p>${t("guess.locked", { n: i + 1 })}</p></div>
          <span class="hint-pts">${pts}</span>
        </li>`;
      }).join("");

      root.innerHTML = `
        <section class="guess">
          <h1 class="question">${t("guess.q")}</h1>
          ${diffBadge()}
          <p class="page-sub">${t("guess.sub")}</p>
          <ol class="hints">${list}</ol>
          <div class="guess-box ${fresh ? "shake" : ""}">
            <input id="guessInput" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
              placeholder="${t("guess.placeholder")}" aria-label="${t("guess.placeholder")}">
            <ul class="suggest" id="suggest" hidden></ul>
          </div>
          ${wrong ? `<h2 class="sec-title">${t("guess.yours")}</h2>
          <ul class="cmp-list">${g.guesses.slice().reverse().map((id, i) => compareRow(id, fresh && i === 0)).join("")}</ul>` : ""}
        </section>`;

      wire(g);
    }

    function wire(g) {
      const input = $("#guessInput", root);
      const box = $("#suggest", root);
      let matches = [], active = 0;

      function refresh() {
        const q = input.value.trim().toLowerCase();
        if (!q) { box.hidden = true; matches = []; return; }
        matches = W.characters
          .filter((c) => !g.guesses.includes(c.id) && W.text(c.id).name.toLowerCase().includes(q))
          .sort((x, y) => {
            const sx = W.text(x.id).name.toLowerCase().startsWith(q) ? 0 : 1;
            const sy = W.text(y.id).name.toLowerCase().startsWith(q) ? 0 : 1;
            return sx - sy || W.text(x.id).name.localeCompare(W.text(y.id).name);
          })
          .slice(0, 6);
        active = 0;
        box.hidden = false;
        box.innerHTML = matches.length
          ? matches.map((c, i) => {
              const tx = W.text(c.id);
              return `<li><button type="button" data-id="${c.id}" class="${i === 0 ? "active" : ""}">${W.portrait(c)}<b>${esc(tx.name)}</b><span>${esc(tx.universe)}</span></button></li>`;
            }).join("")
          : `<li class="none">${t("guess.none")}</li>`;
      }

      function mark() {
        box.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", i === active));
      }

      input.addEventListener("input", refresh);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowDown" && matches.length) { active = (active + 1) % matches.length; mark(); ev.preventDefault(); }
        else if (ev.key === "ArrowUp" && matches.length) { active = (active - 1 + matches.length) % matches.length; mark(); ev.preventDefault(); }
        else if (ev.key === "Enter" && matches[active]) { ev.preventDefault(); submit(matches[active].id); }
        else if (ev.key === "Escape") { box.hidden = true; }
      });
      box.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button[data-id]");
        if (btn) submit(btn.dataset.id);
      });
    }

    function submit(id) {
      const correct = id === targetId;
      const g = S.addGuess(key, id, correct);
      if (correct) {
        W.sound.play("solve", g.points);
        W.ui.flash("good");
        drawDone(g, true);
      } else if (g.done) {
        W.sound.play("lose");
        W.ui.flash("bad");
        drawDone(g, true);
      } else {
        W.sound.play("wrong");
        W.sound.play("flips", E.compare(id, targetId).map((c) => c.ok));
        W.ui.flash("bad");
        setTimeout(() => W.sound.play("hint"), 220);
        draw(true);
        const input = $("#guessInput", root);
        if (input) input.focus({ preventScroll: true });
      }
      W.ui.refreshHeader();
    }

    function drawDone(g, fresh) {
      const c = W.char(targetId), tx = W.text(targetId);
      root.innerHTML = `
        <section class="guess done ${fresh ? "fresh" : ""}">
          <p class="crumb">${g.solved ? t("guess.solved", { n: g.guesses.length }) : t("guess.failed")} ${diffBadge()}</p>
          <h1 class="question">${g.solved ? esc(tx.name) : t("guess.itWas", { name: esc(tx.name) })}</h1>
          <div class="answer-hero">
            ${W.portrait(c)}
            <div class="answer-info">
              <span class="f-meta"><span>${esc(tx.universe)}</span>${tierChip(c)}</span>
              <p>${esc(tx.desc)}</p>
              <div class="guess-score ${g.solved ? "good" : "bad"}">
                <b>+${g.points}</b><span class="squares">${E.guessSquares(g)}</span>
              </div>
            </div>
          </div>
          <div class="block">
            <div class="block-head"><h2>${t("abilities")}</h2></div>
            <p class="chips">${tx.abilities.map((a) => `<span>${esc(a)}</span>`).join("")}</p>
            <ul class="feat-list">${tx.feats.map((f) => `<li>${esc(f.text)} <cite>${esc(f.source)}</cite></li>`).join("")}</ul>
          </div>
          <a class="btn wide" href="#/result/${key}">${t("seeResult")}</a>
        </section>`;
    }

    draw(false);
  };
})();
