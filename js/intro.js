/* Intro screen: shown once per visit before the home screen.
   Logo with a VS badge in place of the "o", today's date, Play,
   two rows of fighters gliding past each other, and the rules below. */
(function () {
  const W = window.WIS;
  const cfg = W.config, E = W.engine, S = W.store, t = W.t;
  const { esc, tierChip } = W.ui;
  const KEY = "wis:entered";

  W.intro = {
    seen() { try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return true; } },
    markSeen() { try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ } }
  };

  // only fighters with real pictures; if there are very few, top up with others
  function rosterIds() {
    const withImg = W.characters.filter((c) => c.img).map((c) => c.id);
    if (withImg.length >= 6) return withImg;
    const rest = E.shuffle(W.characters.filter((c) => !c.img).map((c) => c.id), Math.random);
    return withImg.concat(rest.slice(0, 10 - withImg.length));
  }

  function row(ids, cls) {
    // each half of the track must be wider than any screen (~96px per portrait)
    const repeat = Math.max(1, Math.ceil(2200 / (ids.length * 96)));
    const one = ids.map((id) => `<span class="ro-item">${W.portrait(W.char(id))}</span>`).join("").repeat(repeat);
    // the track holds that half twice so the loop has no seam
    return `<div class="roster-row ${cls}"><div class="track">${one}${one}</div></div>`;
  }

  W.views.intro = function (root) {
    const ids = rosterIds();
    // both rows show everyone, in a different order, so neighbours never match
    const top = E.shuffle(ids, Math.random);
    const bottom = E.shuffle(ids, Math.random);
    if (bottom[0] === top[0]) bottom.push(bottom.shift());
    const date = new Date().toLocaleDateString(cfg.locale, { weekday: "long", month: "long", day: "numeric" });
    const streak = S.streak().current;

    // small pieces of the real interface illustrate each mode
    // any two pictured fighters (never today's real fights: no spoilers)
    const pics = E.shuffle(ids, Math.random);
    const pA = W.char(pics[0]), pB = W.char(pics[1] || pics[0]);
    const tiers = [1, 2, 3, 4, 5, 6].map((n) =>
      `<li><span class="tier t${n}">${esc(W.tierName(n))}</span><p>${esc(t("tierDesc")[n])}</p></li>`).join("");

    root.innerHTML = `
      <section class="intro">
        <div class="intro-hero">
          <h1 class="logo" aria-label="${esc(cfg.brand)}">
            <span class="logo-small" aria-hidden="true">${t("intro.who")}</span>
            <span class="logo-big" aria-hidden="true">Str<span class="logo-vs"><b>VS</b></span>nger?</span>
          </h1>
          <p class="intro-date">${esc(date)}</p>
          <p class="intro-sub">${t("intro.sub")}</p>
          <button class="btn intro-play" type="button" data-play><span aria-hidden="true">▶</span> ${t("intro.play")}</button>
          ${streak ? `<p class="intro-streak">🔥 ${t("intro.streak", { n: streak })}</p>` : ""}
        </div>

        <div class="roster" aria-hidden="true">
          ${row(top, "r1")}
          ${row(bottom, "r2")}
        </div>

        <button class="scroll-cue" type="button" data-how>
          ${t("intro.how")}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>

        <section class="how" id="how" aria-labelledby="howTitle">
          <h2 id="howTitle">${t("intro.how")}</h2>

          <article class="how-mode">
            <div class="how-art art-fight" aria-hidden="true">
              <span class="hf l">${W.portrait(pA)}</span>
              <span class="vs">VS</span>
              <span class="hf r">${W.portrait(pB)}</span>
              <span class="hf-bar"><i></i></span>
            </div>
            <div>
              <h3>${t("mode.battle.title")}</h3>
              <p>${t("intro.fight")}</p>
            </div>
          </article>

          <article class="how-mode">
            <div class="how-art art-guess" aria-hidden="true">
              <span class="cmp no"><small>${t("cmp.universe")}</small><b>Marvel</b></span>
              <span class="cmp no"><small>${t("cmp.tier")}</small><b>${t("tiers")[3]} ↑</b></span>
              <span class="cmp ok"><small>${t("cmp.role")}</small><b>${t("role.hero")}</b></span>
              <span class="cmp ok"><small>${t("cmp.source")}</small><b>${t("source.alien")}</b></span>
            </div>
            <div>
              <h3>${t("mode.guess.title")}</h3>
              <p>${t("intro.guess")}</p>
            </div>
          </article>

          ${cfg.features.higherLower ? `
          <article class="how-mode">
            <div class="how-art art-hol" aria-hidden="true">
              <span class="hv">92</span><span class="hv q">?</span>
              <span class="hb up">▲</span><span class="hb down">▼</span>
            </div>
            <div>
              <h3>${t("mode.hol.title")}</h3>
              <p>${t("intro.hol")}</p>
            </div>
          </article>` : ""}

          <div class="how-tiers">
            <h3>${t("tier.title")}</h3>
            <p>${t("intro.tiers")}</p>
            <ol>${tiers}</ol>
          </div>

          <p class="how-daily">${t("intro.daily")}</p>
          <button class="btn wide" type="button" data-play><span aria-hidden="true">▶</span> ${t("intro.play")}</button>
        </section>
      </section>`;

    root.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => {
      W.sound.play("logo");
      W.intro.markSeen();
      if (location.hash === "" || location.hash === "#/" || location.hash === "#") W.ui.rerender();
      else W.ui.go("#/");
    }));
    root.querySelector("[data-how]").addEventListener("click", () => {
      document.getElementById("how").scrollIntoView({ behavior: W.ui.reducedMotion() ? "auto" : "smooth" });
    });
  };
})();
