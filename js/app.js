/* App shell: routing, header, home, day result, archive, stats. */
(function () {
  const W = window.WIS;
  const cfg = W.config, E = W.engine, S = W.store, t = W.t;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  W.ui = { $, esc, reducedMotion, toast, countUp, go, tierChip, flash };

  /* Coloured glow around the screen edges: "good", "mid" or "bad". */
  function flash(kind) {
    const el = document.createElement("div");
    el.className = "edge-flash rich-only " + kind;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  W.views = {};

  // ---------- small helpers ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function countUp(el, from, to, ms) {
    if (!el) return;
    if (reducedMotion() || from === to) { el.textContent = to; return; }
    const start = performance.now();
    (function frame(now) {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(frame);
    })(start);
  }

  function go(hash, replace) {
    if (replace) location.replace(location.pathname + location.search + hash);
    else location.hash = hash;
  }

  function tierChip(c) {
    return `<span class="tier t${c.tier}" data-tier="${c.tier}" role="button" tabindex="0">${esc(W.tierName(c.tier))}</span>`;
  }

  /* Tapping a tier chip explains all six tiers. Works inside fighter cards
     too: the click is caught before it reaches the card, so it doesn't pick. */
  function openTierSheet(cur) {
    closeTierSheet();
    const names = t("tiers"), desc = t("tierDesc");
    const rows = [1, 2, 3, 4, 5, 6].map((n) =>
      `<li class="${n === cur ? "cur" : ""}"><span class="n">${n}</span><div><span class="tier t${n}">${esc(W.tierName(n))}</span><p>${esc(desc[n])}</p></div></li>`
    ).join("");
    const el = document.createElement("div");
    el.className = "tier-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", t("tier.title"));
    el.innerHTML = `<div class="ts-panel"><h3>${t("tier.title")}</h3><ol class="ts-list">${rows}</ol><button class="btn wide" type="button">${t("tier.close")}</button></div>`;
    el.addEventListener("click", (ev) => {
      if (ev.target === el || ev.target.closest("button")) closeTierSheet();
    });
    document.body.appendChild(el);
    el.querySelector("button").focus({ preventScroll: true });
    W.sound.play("tap");
    if (!S.settings.tierTipSeen) S.setSetting("tierTipSeen", true);
  }
  function closeTierSheet() {
    const el = document.querySelector(".tier-sheet");
    if (el) el.remove();
  }
  document.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".tier[data-tier]");
    if (!chip || chip.closest(".tier-sheet")) return;
    ev.preventDefault();
    ev.stopPropagation();
    openTierSheet(Number(chip.dataset.tier));
  }, true);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeTierSheet();
    const chip = ev.target.closest && ev.target.closest(".tier[data-tier]");
    if (chip && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      ev.stopPropagation();
      openTierSheet(Number(chip.dataset.tier));
    }
  }, true);

  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (n) => String(n).padStart(2, "0");
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60);
  }

  // ---------- header ----------
  const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="m16.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function refreshHeader() {
    const st = S.streak().current;
    $("#streakNum").textContent = st;
    // the flame changes look at 3, 7, 14, 30, 100 and 365 days
    const level = [3, 7, 14, 30, 100, 365].filter((n) => st >= n).length;
    $("#streakChip").className = "chip streak f" + level;
    const btn = $("#soundBtn");
    const on = S.settings.sound;
    btn.innerHTML = on ? ICON_ON : ICON_OFF;
    btn.setAttribute("aria-label", t(on ? "sound.on" : "sound.off"));
    btn.classList.toggle("off", !on);
  }
  W.ui.refreshHeader = refreshHeader;

  // ---------- share ----------
  function shareText(key) {
    const d = S.day(key);
    const lines = [cfg.brand + " #" + (E.dayIndex(key) + 1)];
    if (d.battle.done) lines.push(E.battleSquares(d.battle, E.battleDay(E.dayIndex(key)).pairs.length) + " · " + dayTitle(d.battle.score) + " · " + d.battle.score);
    if (d.guess.done) lines.push("🔎 " + E.guessSquares(d.guess) + " " + d.guess.points + "/" + E.maxGuess());
    const url = cfg.siteUrl || (location.protocol === "file:" ? "" : location.origin + location.pathname);
    if (url) lines.push(url);
    return lines.join("\n");
  }

  function share(key) {
    shareRaw(shareText(key));
  }
  // title for a day's fight score (out of 1000)
  function dayTitle(score) {
    return t("rank." + Math.min(4, Math.floor((score / E.maxBattle()) * 5)));
  }

  /* Global rank card: total fight points, progress to the next rank. */
  function rankCard() {
    if (!cfg.features.ranks) return "";
    const r = E.rankFor(S.totalPoints());
    const fmt = (n) => n.toLocaleString(cfg.locale);
    return `<a class="rank-card" href="#/stats">
      <span class="rc-badge r${r.index}" aria-hidden="true">${r.index + 1}</span>
      <span class="rc-main">
        <span class="rc-name"><b>${esc(r.cur.name)}</b><small>${esc(r.cur.label)}</small></span>
        <span class="rc-bar"><i style="width:${Math.round(r.progress * 100)}%"></i></span>
        <span class="rc-next">${r.next ? t("rank.toNext", { n: fmt(r.next.at - r.total), name: esc(r.next.name) }) : t("rank.top")}</span>
      </span>
      <span class="rc-total"><b>${fmt(r.total)}</b><small>${t("pts")}</small></span>
    </a>`;
  }
  W.ui.rankCard = rankCard;
  function siteUrl() {
    return cfg.siteUrl || (location.protocol === "file:" ? "" : location.origin + location.pathname);
  }
  W.ui.share = (text) => shareRaw(text + (siteUrl() ? "\n" + siteUrl() : ""));
  function shareRaw(text) {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    const done = () => toast(t("result.copied"));
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => legacyCopy(text, done));
    } else {
      legacyCopy(text, done);
    }
  }
  function legacyCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* nothing else to try */ }
    ta.remove();
  }

  // ---------- home ----------
  W.views.home = function (root) {
    const key = E.todayKey();
    const idx = E.dayIndex(key);
    const day = E.battleDay(idx);
    const d = S.day(key);
    const boss = day.pairs[day.pairs.length - 1];
    const total = day.pairs.length;

    let battleCta, battleHref = "#/battle";
    if (d.battle.done) {
      battleHref = "#/result";
      battleCta = `<span class="mode-score"><span class="squares">${E.battleSquares(d.battle, total)}</span><b>${d.battle.score}</b>/${E.maxBattle()}</span>`;
    } else if (d.battle.picks.length) {
      battleCta = `<span class="btn">${t("resume")} ${d.battle.picks.length}/${total}</span>`;
    } else {
      battleCta = `<span class="btn">${t("play")}</span>`;
    }

    let guessCta, guessHref = "#/guess";
    if (d.guess.done) {
      guessCta = `<span class="mode-score"><span class="squares">${E.guessSquares(d.guess)}</span><b>${d.guess.points}</b>/${E.maxGuess()}</span>`;
    } else if (d.guess.guesses.length) {
      guessCta = `<span class="btn alt">${t("resume")}</span>`;
    } else {
      guessCta = `<span class="btn alt">${t("play")}</span>`;
    }

    const sliders = E.sliderPlan(idx).count;

    root.innerHTML = `
      <section class="home">
        <div class="hero">
          <h1 class="hero-title">${esc(cfg.brand)}</h1>
          <p class="hero-sub">${t("tagline")}</p>
          <p class="hero-meta"><b>${t("home.day", { n: idx + 1 })}</b><span>${t("home.next")} <time data-countdown>${clock(E.msToMidnight())}</time></span></p>
        </div>

        ${rankCard()}

        ${d.battle.done ? `
        <a class="total-banner complete" href="#/result">
          <span>${t("home.total")}</span>
          <b>${d.battle.score}<small>/${E.maxBattle()}</small></b>
          <span class="link">${dayTitle(d.battle.score)}. ${t("seeResult")}</span>
        </a>` : ""}

        <a class="mode mode-battle" href="${battleHref}">
          <div class="mode-art">
            ${W.portrait(W.char(boss.a), "p1")}
            <span class="vs" aria-hidden="true">VS</span>
            ${W.portrait(W.char(boss.b), "p2")}
          </div>
          <div class="mode-body">
            <div>
              <h2>${t("mode.battle.title")}</h2>
              <p>${t("mode.battle.sub")} ${sliders ? t(sliders > 1 ? "mode.battle.sliders" : "mode.battle.slider", { n: sliders }) : ""}</p>
            </div>
            ${battleCta}
          </div>
        </a>

        <a class="mode mode-guess" href="${guessHref}">
          <div class="mode-art small">
            ${d.guess.done ? W.portrait(W.char(E.guessTarget(idx))) : W.mysteryPortrait()}
          </div>
          <div class="mode-body">
            <div>
              <h2>${t("mode.guess.title")}</h2>
              <p>${t("mode.guess.sub")}</p>
            </div>
            ${guessCta}
          </div>
        </a>

        ${cfg.features.higherLower ? `
        <a class="mode mode-guess mode-hol" href="#/hol">
          <div class="mode-art small hol-art" aria-hidden="true"><span>▲</span><span>▼</span></div>
          <div class="mode-body">
            <div>
              <h2>${t("mode.hol.title")}</h2>
              <p>${S.settings.holBest ? t("mode.hol.best", { n: S.settings.holBest }) : t("mode.hol.sub")}</p>
            </div>
            <span class="btn alt">${t("play")}</span>
          </div>
        </a>` : ""}

        ${cfg.features.freePlay ? `
        <a class="mode mode-guess mode-free" href="#/free">
          <div class="mode-art small free-art" aria-hidden="true"><span>∞</span></div>
          <div class="mode-body">
            <div>
              <h2>${t("mode.free.title")}</h2>
              <p>${t("mode.free.sub")}</p>
            </div>
            <span class="btn alt">${t("play")}</span>
          </div>
        </a>` : ""}
      </section>`;
  };

  // ---------- day result (also the hub for an archive day) ----------
  W.views.result = function (root, key) {
    const idx = E.dayIndex(key);
    const day = E.battleDay(idx);
    const d = S.day(key);
    const isToday = key === E.todayKey();
    const total = day.pairs.length;
    const anyDone = d.battle.done || d.guess.done;
    const bothDone = d.battle.done && d.guess.done;
    const sum = d.battle.done ? d.battle.score : 0;
    const max = E.maxBattle();

    const row = (icon, title, done, squares, score, maxScore, href, started) => `
      <div class="res-row">
        <span class="res-icon" aria-hidden="true">${icon}</span>
        <span class="res-name">${title}</span>
        ${done
          ? `<span class="squares">${squares}</span><span class="res-score"><b>${score}</b>/${maxScore}</span>`
          : `<a class="btn small" href="${href}">${t(started ? "resume" : "play")}</a>`}
      </div>`;

    let recap = "";
    if (d.battle.picks.length) {
      recap = `<h2 class="sec-title">${t("result.recap")}</h2><p class="recap-hint">${t("result.tapHint")}</p><ul class="recap">` +
        d.battle.picks.map((p, i) => {
          const a = W.text(p.a).name, b = W.text(p.b).name;
          const mood = E.moodOf(p);
          const cls = mood === "exact" ? "good" : mood;
          const pts = (p.pts > 0 ? "+" : p.pts < 0 ? "−" : "") + Math.abs(p.pts);
          const note = p.type === "slider"
            ? `<small>🎯 ${t("result.sliderNote", { you: p.guess, data: p.truth })}</small>`
            : p.correct && p.mult > 1 ? `<small>×${p.mult}</small>` : "";
          return `<li class="${cls}"><a href="#/fight/${key}/${i + 1}"><span class="recap-pair"><b class="${p.pick === p.a ? "me" : ""}">${esc(a)}</b> <i>vs</i> <b class="${p.pick === p.b ? "me" : ""}">${esc(b)}</b>${note}</span><span class="recap-pts">${pts}</span><span class="recap-go" aria-hidden="true">›</span></a></li>`;
        }).join("") + `</ul>`;
    }

    let answer = "";
    if (d.guess.done) {
      const c = W.char(E.guessTarget(idx)), tx = W.text(c.id);
      answer = `<h2 class="sec-title">${t("result.answer")}</h2>
        <div class="answer-card">${W.portrait(c)}<div><b>${esc(tx.name)}</b><span>${esc(tx.universe)}</span>${tierChip(c)}</div></div>`;
    }

    root.innerHTML = `
      <section class="result">
        <p class="crumb">${isToday ? t("result.today") : esc(E.formatDate(key))}</p>
        <h1 class="page-title">${t("result.title", { n: idx + 1 })}</h1>

        ${d.battle.done ? `
        <div class="score-card complete">
          <p class="rank rich-only">${dayTitle(sum)}</p>
          <div class="big-score"><b id="bigScore">${sum}</b><span>/ ${max}</span></div>
          <div class="score-meter rich-only"><i style="--w:${Math.round((sum / max) * 100)}%"></i></div>
          <p class="better" id="better" hidden></p>
          <a class="review-btn" href="#/fight/${key}/1"><span class="rb-icon" aria-hidden="true">⚔️</span> ${t("result.review")} <span class="rb-arrow" aria-hidden="true">›</span></a>
        </div>
        ${rankCard()}` : ""}

        <div class="res-rows">
          ${row("⚔️", t("mode.battle.title"), d.battle.done, E.battleSquares(d.battle, total), d.battle.score, E.maxBattle(), "#/battle/" + key, d.battle.picks.length > 0)}
          ${row("🔎", t("mode.guess.title"), d.guess.done, E.guessSquares(d.guess), d.guess.points, E.maxGuess(), "#/guess/" + key, d.guess.guesses.length > 0)}
        </div>

        ${anyDone ? `<button class="btn wide" id="shareBtn" type="button">${t("result.share")}</button>` : ""}
        ${isToday && bothDone ? `<p class="next-day">${t("result.nextDay")} <time data-countdown>${clock(E.msToMidnight())}</time></p>` : ""}

        ${recap}
        ${answer}

        <a class="text-link" href="#/archive">${t("nav.archive")}</a>
      </section>`;

    const shareBtn = $("#shareBtn", root);
    if (shareBtn) shareBtn.addEventListener("click", () => { W.sound.play("tap"); share(key); });

    if (d.battle.done) countUp($("#bigScore", root), 0, sum, 900);
    if (d.battle.done) {
      W.api.percentile(key, sum, E.maxBattle()).then((res) => {
        const el = $("#better", root);
        if (!res || !el) return;
        el.hidden = false;
        el.innerHTML = t("result.better", { pct: `<b>${res.pct}</b>` }) + (res.demo ? ` <span class="demo-tag">${t("demo")}</span>` : "");
      });
    }
  };

  // ---------- archive ----------
  W.views.archive = function (root) {
    const today = E.dayIndex(E.todayKey());
    let rows = "";
    for (let i = today; i >= 0; i--) {
      const key = E.keyFromIndex(i);
      const d = S.day(key);
      const done = d.battle.done || d.guess.done;
      const total = E.battleDay(i).pairs.length;
      const status = done
        ? `<span class="squares">${d.battle.done ? E.battleSquares(d.battle, total) : ""}</span><b class="arch-score">${S.dayTotal(key)}</b>`
        : `<span class="arch-new">${i === today ? t("play") : t("archive.new")}</span>`;
      const href = i === today && !done ? "#/" : "#/result/" + key;
      rows += `<a class="arch-row ${done ? "done" : ""}" href="${href}">
        <span class="arch-day">#${i + 1}</span>
        <span class="arch-date">${i === today ? t("result.today") : esc(E.formatDate(key))}</span>
        ${status}
      </a>`;
    }
    root.innerHTML = `
      <section class="archive">
        <h1 class="page-title">${t("archive.title")}</h1>
        <p class="page-sub">${t("archive.sub")}</p>
        <div class="arch-list">${rows}</div>
      </section>`;
  };

  // ---------- stats ----------
  W.views.stats = function (root) {
    const s = S.summary();
    const maxDist = Math.max(1, ...s.dist);
    const bars = s.dist.map((n, i) => {
      const label = i === s.dist.length - 1 ? "✕" : i + 1;
      return `<div class="dist-row"><span>${label}</span><div class="dist-bar"><i style="width:${Math.max(n ? 8 : 0, (n / maxDist) * 100)}%"></i></div><b>${n}</b></div>`;
    }).join("");

    root.innerHTML = `
      <section class="stats-page">
        <h1 class="page-title">${t("stats.title")}</h1>
        ${rankCard()}
        ${s.played ? "" : `<p class="page-sub">${t("stats.empty")}</p>`}
        <div class="tiles">
          <div class="tile"><b>${s.played}</b><span>${t("stats.played")}</span></div>
          <div class="tile"><b>${s.streak.current}</b><span>${t("stats.streak")}</span></div>
          <div class="tile"><b>${s.streak.best}</b><span>${t("stats.best")}</span></div>
          <div class="tile"><b>${s.avg}</b><span>${t("stats.avg")}</span></div>
        </div>
        ${cfg.features.higherLower ? `
        <h2 class="sec-title">${t("mode.hol.title")}</h2>
        <div class="tiles">
          <div class="tile"><b>${S.settings.holBest || 0}</b><span>${t("hol.bestRun")}</span></div>
          <div class="tile"><b>${S.settings.holGames || 0}</b><span>${t("hol.games")}</span></div>
        </div>` : ""}
        <h2 class="sec-title">${t("stats.dist")}</h2>
        <div class="dist">${bars}</div>
        <a class="profile-link" href="#/archive">
          <span class="pl-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
          <span><b>${t("archive.title")}</b><small>${t("archive.sub")}</small></span>
          <span class="pl-arrow" aria-hidden="true">›</span>
        </a>
        <a class="btn wide" href="#/">${t("play")}</a>
      </section>`;
  };

  // ---------- router ----------
  let cleanup = null;
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    // Testing helper, works only on your own computer: open #/reset to wipe progress.
    if (parts[0] === "reset" && W.api.demo) {
      try { localStorage.removeItem(S.KEY); localStorage.removeItem("wis:v1"); } catch (e) { /* ignore */ }
      location.replace(location.pathname + location.search);
      return;
    }
    const off = { free: !cfg.features.freePlay, hol: !cfg.features.higherLower };
    let name = W.views[parts[0]] && !off[parts[0]] ? parts[0] : "home";
    // first visit in this session: the intro screen before home
    if (!parts.length && W.intro && !W.intro.seen()) name = "intro";
    if (parts[0] === "intro") name = "intro";
    const key = parts[1] && E.validKey(parts[1]) ? parts[1] : E.todayKey();
    if (typeof cleanup === "function") cleanup();
    const root = $("#view");
    root.className = "view-" + name;
    // background score follows the screen (the fight screen switches to "boss" itself)
    W.sound.setScene({ battle: "fight", hol: "fight", free: "fight", guess: "guess" }[name] || "menu");
    cleanup = W.views[name](root, key, parts) || null;
    window.scrollTo(0, 0);
    refreshHeader();
  }
  W.ui.rerender = route;

  // ---------- start ----------
  W.start = function () {
    document.documentElement.lang = cfg.locale;
    $("#brandName").textContent = cfg.brand;
    document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
    document.querySelectorAll("[data-t-label]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tLabel)));
    document.body.classList.toggle("no-ads", !cfg.showAdSlots);
    document.body.classList.add("look-rich");

    // visit counter (Cloudflare Web Analytics: no cookies). Live site only.
    if (cfg.analyticsToken && !W.api.demo) {
      const sc = document.createElement("script");
      sc.defer = true;
      sc.src = "https://static.cloudflareinsights.com/beacon.min.js";
      sc.setAttribute("data-cf-beacon", JSON.stringify({ token: cfg.analyticsToken }));
      document.head.appendChild(sc);
    }
    try { localStorage.removeItem("wis:look"); } catch (e) { /* old comparison setting */ }

    $("#soundBtn").addEventListener("click", () => {
      S.setSound(!S.settings.sound);
      refreshHeader();
      W.sound.refresh();
      W.sound.play("tap");
    });

    // Temporary: compare the two sound packs (only on your own computer)
    if (W.api.demo && W.config.showPackSwitch) {
      const sw = document.createElement("div");
      sw.className = "pack-switch";
      sw.innerHTML = '<span>Звук</span><button type="button" data-pack="classic">A · аркадный</button><button type="button" data-pack="epic">B · эпичный</button><button type="button" data-pack="soft">C · мягкий</button><button type="button" data-pack="signal">D · сигнал</button><button type="button" data-pack="theme">E · мотив</button><button type="button" data-pack="mix">F · аркада + мотив</button>';
      const mark = () => sw.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.pack === W.sound.pack));
      sw.addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-pack]");
        if (!b) return;
        W.sound.setPack(b.dataset.pack);
        mark();
        W.sound.play(b.dataset.pack === "theme" || b.dataset.pack === "mix" ? "logo" : "win");
      });
      document.body.appendChild(sw);
      mark();
    }

    // One timer drives every countdown and rolls the home screen over at midnight.
    let shownDay = E.todayKey();
    setInterval(() => {
      const left = clock(E.msToMidnight());
      document.querySelectorAll("[data-countdown]").forEach((el) => (el.textContent = left));
      if (E.todayKey() !== shownDay) {
        shownDay = E.todayKey();
        const onDayScreen = /^#?\/?$/.test(location.hash) || /^#\/(archive|stats)?$/.test(location.hash);
        if (onDayScreen) route();
      }
    }, 1000);

    window.addEventListener("hashchange", route);
    route();
  };
})();
