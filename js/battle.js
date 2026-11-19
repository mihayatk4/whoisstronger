/* The fight screen: two fighters, pick the winner, see the verdict.
   W.fights() runs it for any source of fights; the daily mode ("Who wins?")
   and free play (free.js) each plug in their own fights and scoring. */
(function () {
  const W = window.WIS;
  const E = W.engine, S = W.store, t = W.t;
  const { $, esc, countUp, go, tierChip, reducedMotion } = W.ui;

  /* src:
       getPair(round)       -> { a, b } character ids
       getState()           -> { picks: [...], score, streak }
       addPick(pick)        -> new state after saving the pick
       roundType(round)     -> "choice" (tap the winner) or "slider" (guess the odds)
       sliderMax            -> max points of a slider round (300 or 275)
       hud(round, state)    -> html for the top bar (must contain #hudScore)
       isBoss(round)        -> true for the boss fight
       isLast(round)        -> true when "Next" should finish
       onFinish()           -> called after the last fight
       voteKey              -> key for players' votes and agree/disagree
       startRound           -> first round to show */
  /* ---------- the fight breakdown (after a pick, and in the day's history) ---------- */
  const fmtMult = (x) => "×" + x;
  const edge = (v) => (v >= 85 ? "edge-r" : v <= 15 ? "edge-l" : "");

  /* The verdict strip: points with a sign plus one line that says why. */
  function verdictLine(pk, m) {
    const favName = esc(W.text(m.favorite).name);
    if (pk.type === "slider") {
      const who = m.even ? t("reveal.statsEven") : t("reveal.statsLine", { name: favName, pct: m.favPct });
      return (pk.e === 0 ? t("verdict.perfect") : pk.e <= (W.config.scoring.sliderGrace || 0) ? t("verdict.bullseye") : t("verdict.off", { n: pk.e })) + " " + who + ".";
    }
    if (pk.correct) return m.even ? t("verdict.coin") : t("verdict.right", { mult: fmtMult(pk.mult) });
    if (pk.contested) return t("verdict.contested");
    return t("verdict.wrong", { name: favName, gap: pk.gap, lost: -pk.pts });
  }

  /* When weapons and abilities change the result compared with raw power,
     say so: that's the part people argue about. */
  function rawNote(m) {
    if (!m.judged) return "";
    const baseFavA = m.basePctA >= 50;
    const baseFav = baseFavA ? m.a : m.b, basePct = baseFavA ? m.basePctA : 100 - m.basePctA;
    if (baseFav !== m.favorite) return `<p class="raw-note flip">⚡ ${t("reveal.flip", { name: esc(W.text(baseFav).name), pct: basePct })}</p>`;
    if (Math.abs(basePct - m.favPct) >= 10) return `<p class="raw-note">${t("reveal.shift", { pct: basePct })}</p>`;
    return "";
  }

  W.fightDetail = {
    /* opts.live: right after the pick (numbers count up, streak chip);
       otherwise the final numbers are shown straight away (history). */
    html(m, a, b, pk, opts) {
      opts = opts || {};
      const A = W.text(a.id), B = W.text(b.id);
      const favName = W.text(m.favorite).name;
      const isSlider = pk.type === "slider";
      const mood = E.moodOf(pk), tone = mood === "exact" ? "good" : mood;
      const pts = pk.pts, sign = pts > 0 ? "+" : pts < 0 ? "−" : "";
      const streak = opts.streak || 0;
      const showStreak = opts.live && !isSlider && pk.correct && streak >= 2;

      const rows = E.STAT_KEYS.map((k, i) => {
        const va = a.stats[k], vb = b.stats[k];
        return `<div class="stat-row" style="--i:${i}">
          <b class="sv ${va >= vb ? "lead" : ""}">${va}</b>
          <span class="sbar l ${va >= vb ? "lead" : ""}"><i style="--w:${va}%"></i></span>
          <span class="sname stat-tip" tabindex="0" data-tip="${esc(t("statDesc")[k] || "")}">${t("stat." + k)}</span>
          <span class="sbar r ${vb >= va ? "lead" : ""}"><i style="--w:${vb}%"></i></span>
          <b class="sv ${vb >= va ? "lead" : ""}">${vb}</b>
        </div>`;
      }).join("");

      const feats = (tx, side) => `
        <div class="feat-col ${side}">
          <h3>${esc(tx.name)}</h3>
          <p class="feat-abilities">${tx.abilities.map(esc).join(", ")}</p>
          <ul>${tx.feats.map((f) => `<li>${esc(f.text)} <cite>${esc(f.source)}</cite></li>`).join("")}</ul>
        </div>`;

      const fav = m.favorite === a.id ? a : b, dog = m.favorite === a.id ? b : a;
      const cd = E.card(m);
      const cardHtml = cd ? `
          <ol class="beats">
            <li><b>${t("card.start")}</b><p>${esc(cd.start)}</p></li>
            <li><b>${t("card.turn")}</b><p>${esc(cd.turn)}</p></li>
            <li class="end"><b>${t("card.finish")}</b><p>${esc(cd.finish)}</p></li>
          </ol>
          <div class="underdog"><b>${t("card.path", { name: esc(W.text(dog.id).name) })}</b><p>${esc(cd.path)}</p></div>` : "";
      const leads = E.STAT_KEYS.filter((k) => fav.stats[k] > dog.stats[k]).length;
      const verdictHead = m.even ? t("reveal.statsEven") : t("reveal.statsLine", { name: esc(favName), pct: m.favPct });

      return `
        <div class="verdict ${tone} ${mood === "exact" ? "exact" : ""} ${isSlider && pk.e === 0 ? "perfect" : ""}">
          <i class="v-icon rich-only" aria-hidden="true">${isSlider && pk.e === 0 ? "💎" : mood === "exact" ? "🎯" : tone === "good" ? "✓" : tone === "mid" ? "~" : "✕"}</i>
          <b>${sign}<span id="ptsNum">${opts.live ? 0 : Math.abs(pts)}</span></b>
          <span class="v-text">${verdictLine(pk, m)}</span>
          ${showStreak ? `<span class="combo rich-only">🔥 ${t("battle.nextMult", { mult: fmtMult(E.multAt(streak)) })}</span>` : ""}
        </div>

        ${isSlider ? `
        <div class="block scale-block ${mood === "exact" ? "bullseye" : ""} ${pk.e === 0 ? "perfect" : ""}">
          <div class="block-head"><h2>${t("slider.head")}</h2><p>${t("slider.guessed", { name: esc(A.name), you: pk.guess, data: pk.truth })}</p></div>
          <div class="scale" style="--you:${pk.guess}%;--data:${pk.truth}%">
            <div class="scale-track"></div>
            <span class="mk data ${edge(pk.truth)}"><i></i><b>${t("slider.data")} ${pk.truth}</b></span>
            <span class="mk you ${edge(pk.guess)}"><i></i><b>${t("slider.you")} ${pk.guess}</b></span>
            <span class="mk crowd" id="mkCrowd" hidden><i></i><b></b></span>
          </div>
        </div>` : ""}

        <div class="block">
          <div class="block-head">
            <h2>${t(cd ? "reveal.verdictHead" : "reveal.statsHead")}</h2>
            <p>${verdictHead}</p>
          </div>
          ${rawNote(m)}
          ${cd ? `<p class="factors">${cd.factors.map((f) => `<span>${esc(f)}</span>`).join("")}</p>` : ""}
          <div class="clash" style="--p:${m.pctA}%">
            <div class="clash-l"><i></i></div>
            <span class="clash-num l"><b id="numA">${opts.live ? 50 : m.pctA}</b>%</span>
            <span class="clash-num r"><b id="numB">${opts.live ? 50 : m.pctB}</b>%</span>
          </div>
          <div class="stat-rows">
            <div class="stat-names"><span>${esc(A.name)}</span><span>${esc(B.name)}</span></div>
            ${rows}
          </div>
          ${m.even ? "" : `<p class="lead-line rich-only">${t("reveal.leads", { name: esc(W.text(fav.id).name), n: leads, total: E.STAT_KEYS.length })}</p>`}
          ${cd ? cardHtml : `<p class="why">${esc(E.explanation(m))}</p>`}
        </div>

        <div class="block crowd" id="crowd" ${isSlider ? "hidden" : ""}>
          <div class="block-head"><h2>${t("reveal.crowdHead")}</h2><p id="crowdLine">&nbsp;</p></div>
          <div class="crowd-bar" id="crowdBar" hidden><i></i><span class="l"></span><span class="r"></span></div>
        </div>

        <details class="receipts">
          <summary>${t("reveal.receipts")}</summary>
          <div class="feat-cols">${feats(A, "l")}${feats(B, "r")}</div>
        </details>`;
    },

    /* bars fill, numbers count up */
    animate(el, m, later) {
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on")));
      countUp($("#numA", el), 50, m.pctA, 800);
      countUp($("#numB", el), 50, m.pctB, 800);
      if (later) E.STAT_KEYS.forEach((k, i) => later(() => W.sound.play("tick", i), 480 + i * 90));
    },

    /* players' picks (choice) or the average guess (slider) */
    loadCrowd(el, m, a, b, pk, voteKey) {
      const A = W.text(a.id), B = W.text(b.id);
      if (pk.type === "slider") {
        W.api.sliderVote(voteKey, m, pk.guess).then((res) => {
          const mk = $("#mkCrowd", el);
          if (!mk || !res) return;
          mk.hidden = false;
          mk.style.setProperty("--crowd", res.avg + "%");
          if (edge(res.avg)) mk.classList.add(edge(res.avg));
          $("b", mk).textContent = t("slider.crowd") + " " + res.avg + (res.demo ? "*" : "");
        });
        return;
      }
      W.api.vote(voteKey, m, pk.pick).then((res) => {
        const line = $("#crowdLine", el), bar = $("#crowdBar", el);
        if (!line) return;
        if (!res) { line.textContent = t("reveal.fewVotes"); return; }
        const topIsA = res.pctA >= 50;
        line.innerHTML =
          t("reveal.crowdLine", { pct: topIsA ? res.pctA : 100 - res.pctA, name: esc(topIsA ? A.name : B.name) }) +
          ` <small>${t("reveal.votes", { n: res.total.toLocaleString() })}</small>` +
          (res.demo ? ` <span class="demo-tag">${t("demo")}</span>` : "");
        bar.hidden = false;
        bar.style.setProperty("--p", res.pctA + "%");
        $(".l", bar).textContent = res.pctA + "%";
        $(".r", bar).textContent = 100 - res.pctA + "%";
      });
    }
  };

  W.fights = function (root, src) {
    let round = src.startRound || 0;
    let locked = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, reducedMotion() ? 0 : ms));

    const typeOf = (r) => (src.roundType ? src.roundType(r) : "choice");

    function fighter(c, side, slider) {
      const tx = W.text(c.id);
      return `<button class="fighter ${side} ${slider ? "static" : ""}" data-id="${c.id}" type="button" ${slider ? 'tabindex="-1" aria-disabled="true"' : ""}>
        <span class="f-pic">
          ${W.portrait(c)}
          <span class="f-mark rich-only" aria-hidden="true"></span>
          <span class="f-pct rich-only"></span>
        </span>
        <span class="f-flag">${t("battle.yourPick")}</span>
        <span class="f-name">${esc(tx.name)}</span>
        <span class="f-meta"><span>${esc(tx.universe)}</span><span class="f-tier" hidden>${tierChip(c)}</span></span>
        <span class="f-desc">${esc(tx.desc)}</span>
      </button>`;
    }

    function draw() {
      locked = false;
      const pair = src.getPair(round);
      const a = W.char(pair.a), b = W.char(pair.b);
      const boss = !!(src.isBoss && src.isBoss(round));
      const slider = typeOf(round) === "slider";
      const A = W.text(a.id).name, B = W.text(b.id).name;

      const question = slider ? t("slider.q", { name: esc(A) }) : t(boss ? "battle.bossQ" : "battle.q");
      root.innerHTML = `
        <section class="battle enter ${boss ? "is-boss" : ""} ${slider ? "is-slider" : ""}">
          ${src.hud(round, src.getState())}
          <h1 class="question">${question}</h1>
          ${slider ? `<p class="tier-tip">${t("slider.help")}</p>` : ""}
          <div class="arena">
            ${fighter(a, "left", slider)}
            <span class="vs" aria-hidden="true">VS</span>
            ${fighter(b, "right", slider)}
            ${boss ? `<div class="boss-banner" aria-hidden="true">${t("battle.boss")}</div>` : ""}
          </div>
          ${slider ? `
          <div class="slider-box" id="sliderBox">
            <div class="sl-read">
              <span class="l"><b id="slA">50</b>% <small>${esc(A)}</small></span>
              <span class="r"><small>${esc(B)}</small> <b id="slB">50</b>%</span>
            </div>
            <input type="range" id="slInput" min="1" max="99" step="1" value="50" style="--v:50%"
              aria-label="${esc(t("slider.aria", { name: A }))}" aria-valuetext="${esc(A)} 50%">
            <button class="btn wide" id="slLock" type="button">${t("slider.lock")}</button>
          </div>` : ""}
          <div class="reveal" id="reveal" aria-live="polite"></div>
        </section>`;

      if (slider) {
        const input = $("#slInput", root);
        const sync = () => {
          const v = Number(input.value);
          $("#slA", root).textContent = v;
          $("#slB", root).textContent = 100 - v;
          input.style.setProperty("--v", v + "%");
          input.setAttribute("aria-valuetext", `${A} ${v}%, ${B} ${100 - v}%`);
        };
        input.addEventListener("input", () => {
          sync();
          W.sound.play("slide", Number(input.value));
        });
        $("#slLock", root).addEventListener("click", () => lockSlider(Number(input.value), a, b));
      } else {
        root.querySelectorAll(".fighter").forEach((el) =>
          el.addEventListener("click", () => pick(el.dataset.id, a, b))
        );
      }
      W.sound.setScene(boss ? "boss" : "fight");
      W.sound.play(boss ? "boss" : "vs");
    }

    // colour the two cards after the answer: green = wins by the verdict, red = loses
    function markFighters(m, pickedId) {
      root.querySelectorAll(".fighter").forEach((el) => {
        const fid = el.dataset.id;
        el.disabled = true;
        if (pickedId) el.classList.add(fid === pickedId ? "picked" : "passed");
        el.classList.add(m.even ? "even" : fid === m.favorite ? "win" : "lose");
        $(".f-pct", el).innerHTML = `<b>${fid === m.a ? m.pctA : m.pctB}</b>%`;
        $(".f-mark", el).textContent = m.even ? "=" : fid === m.favorite ? "✓" : "✕";
        // tiers stay hidden until the pick: a higher tier almost always wins
        const tier = $(".f-tier", el);
        if (tier) tier.hidden = false;
      });
      $(".arena", root).classList.add("revealed");
      $(".battle", root).classList.add("impact");
    }

    function lockSlider(value, a, b) {
      if (locked) return;
      locked = true;
      const m = E.matchup(a, b);
      const e = Math.abs(value - m.pctA);
      const pts = E.sliderPoints(e, src.sliderMax || 300);
      const before = src.getState().score;
      const state = src.addPick({ type: "slider", a: a.id, b: b.id, guess: value, truth: m.pctA, e, pts });
      $("#slInput", root).disabled = true;
      $("#slLock", root).hidden = true;
      markFighters(m, null);
      const mood = E.moodOf(state.picks[state.picks.length - 1]);
      W.sound.play("hit");
      if (e === 0) {
        // right to the percent: the big celebration
        W.ui.flash("gold");
        const sec = $(".battle", root);
        sec.classList.add("perfect", "pf-shake");
        later(() => sec.classList.remove("pf-shake"), 600);
        later(() => { W.celebrate.perfect({ pct: value }); W.sound.play("perfect"); }, 120);
      } else {
        W.ui.flash(mood === "exact" || mood === "good" ? "good" : mood === "mid" ? "mid" : "bad");
        // the answer sound lands with the ✓ / ✕ marks
        later(() => W.sound.play(mood === "exact" ? "correct" : mood === "good" ? "win" : mood === "mid" ? "partial" : "lose", { level: 2 }), 200);
      }
      later(() => reveal(m, a, b, null, state.picks[state.picks.length - 1], before, state), 240);
    }

    function pick(id, a, b) {
      if (locked) return;
      locked = true;

      const m = E.matchup(a, b);
      const before = src.getState().score;
      const res = E.choiceResult(m, id, src.getState().streak || 0);
      const state = src.addPick({
        type: "choice", a: a.id, b: b.id, pick: id, pts: res.pts, mult: res.mult,
        correct: res.correct, contested: res.contested, gap: res.gap, streakAfter: res.streakAfter
      });
      const pts = res.pts;

      markFighters(m, id);
      W.ui.flash(res.correct ? "good" : res.contested ? "mid" : "bad");
      W.sound.play("hit", id === a.id ? -1 : 1);
      // the answer sound lands with the ✓ / ✕ marks; the streak makes it fuller
      const boss = !!(src.isBoss && src.isBoss(round));
      later(() => W.sound.play(res.correct ? "win" : res.contested ? "partial" : "lose", { level: res.streakAfter, boss }), 200);

      later(() => reveal(m, a, b, id, state.picks[state.picks.length - 1], before, state), 240);
    }

    function reveal(m, a, b, pickId, pk, before, state) {
      const pts = pk.pts;
      const mood = E.moodOf(pk);
      const tone = mood === "exact" ? "good" : mood;
      const last = src.isLast(round);
      const isSlider = pk.type === "slider";
      const nextMult = E.multAt(state.streak || 0);
      const sign = pts > 0 ? "+" : pts < 0 ? "−" : "";

      const el = $("#reveal", root);
      el.innerHTML = W.fightDetail.html(m, a, b, pk, { streak: state.streak || 0, live: true }) + `
        <div class="agree" id="agree">
          <span>${t("reveal.agreeQ")}</span>
          <button type="button" class="ghost" data-v="agree">👍 ${t("reveal.agree")}</button>
          <button type="button" class="ghost" data-v="disagree">👎 ${t("reveal.disagree")}</button>
        </div>

        <div class="next-bar">
          <button class="btn wide" id="nextBtn" type="button">${t(last ? "battle.finish" : "battle.next")}</button>
        </div>`;

      W.fightDetail.animate(el, m, later);
      W.fightDetail.loadCrowd(el, m, a, b, pk, src.voteKey);

      later(() => {
        if (pts > 0) W.sound.play("points", pts); // coins tick with the counter
        countUp($("#ptsNum", el), 0, Math.abs(pts), 500);
        const pic = $(".fighter.picked .f-pic", root) || (isSlider ? $(".fighter.win .f-pic", root) || $(".fighter .f-pic", root) : null);
        if (pic) {
          const fl = document.createElement("span");
          fl.className = "f-float rich-only " + tone + (isSlider && pk.e === 0 ? " perfect" : "");
          fl.textContent = sign + Math.abs(pts);
          pic.appendChild(fl);
        }
        countUp($("#hudScore", root), before, state.score, 500);
        const multEl = $("#hudMult", root);
        if (multEl) {
          multEl.textContent = "×" + nextMult;
          multEl.parentElement.classList.toggle("hot", (state.streak || 0) >= 1);
          multEl.parentElement.classList.toggle("reset", !isSlider && !pk.correct && !pk.contested);
        }
        const pip = root.querySelectorAll(".pip")[round];
        if (pip) pip.className = "pip " + mood + (isSlider ? " sl" : "") + (src.isBoss && src.isBoss(round) ? " boss" : "");
      }, 700);

      const arena = $(".arena", root);
      if (arena && arena.scrollIntoView) {
        later(() => arena.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }), 60);
      }

      // agree / disagree with the verdict
      $("#agree", el).addEventListener("click", (ev) => {
        const btn = ev.target.closest("button[data-v]");
        if (!btn) return;
        S.setVerdict(src.voteKey, E.pairKey(a.id, b.id), btn.dataset.v);
        W.sound.play("tap");
        $("#agree", el).innerHTML = `<span>${t("reveal.thanks")}</span>`;
      });

      $("#nextBtn", el).addEventListener("click", () => {
        W.sound.play("tap");
        if (last) {
          W.sound.play("done", state.score);
          src.onFinish();
        } else {
          round++;
          draw();
          window.scrollTo(0, 0);
        }
      });
    }

    draw();
    return () => timers.forEach(clearTimeout);
  };

  /* Daily mode: today's five fights, the last one is the boss. */
  W.views.battle = function (root, key) {
    const idx = E.dayIndex(key);
    const day = E.battleDay(idx);
    const total = day.pairs.length;
    const plan = E.sliderPlan(idx);
    const isSlider = (r) => plan.positions.includes(r);
    if (S.day(key).battle.done) { go("#/result/" + key, true); return; }

    return W.fights(root, {
      startRound: S.day(key).battle.picks.length,
      getPair: (r) => day.pairs[r],
      getState: () => S.day(key).battle,
      addPick: (p) => S.addPick(key, p, total),
      roundType: (r) => (isSlider(r) ? "slider" : "choice"),
      sliderMax: plan.max,
      isBoss: (r) => r === total - 1,
      isLast: (r) => r === total - 1,
      onFinish: () => go("#/result/" + key),
      voteKey: key,
      hud(round, state) {
        let pips = "";
        for (let i = 0; i < total; i++) {
          const p = state.picks[i];
          const cls = p ? E.moodOf(p) : i === round ? "now" : "";
          pips += `<i class="pip ${cls} ${isSlider(i) ? "sl" : ""} ${i === total - 1 ? "boss" : ""}"></i>`;
        }
        const streak = state.streak || 0;
        return `<div class="hud">
          <div class="pips" role="img" aria-label="${t("battle.round", { n: round + 1, total })}">${pips}</div>
          <div class="hud-right">
            <span class="mult ${streak ? "hot" : ""}" title="${t("battle.multHelp")}">🔥 <b id="hudMult">×${E.multAt(streak)}</b></span>
            <span class="hud-score"><b id="hudScore">${state.score}</b> ${t("pts")}</span>
          </div>
        </div>`;
      }
    });
  };
})();
