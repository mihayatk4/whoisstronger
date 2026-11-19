/* Free play: pick the universes you know, then fight forever.
   Doesn't touch the daily score or streak.
   Two ways to mix:
     "only"  both fighters come from your picks
     "vs"    one fighter from your picks, the other from the rest (crossovers) */
(function () {
  const W = window.WIS;
  const E = W.engine, S = W.store, t = W.t;
  const { $, esc } = W.ui;

  const GROUP_ORDER = ["Anime", "Marvel", "DC", "Invincible / The Boys", "Other"];

  // group -> universe -> [character ids], built from the data
  function catalog() {
    const groups = {};
    W.characters.forEach((c) => {
      const u = W.text(c.id).universe;
      const g = (groups[c.group] = groups[c.group] || {});
      (g[u] = g[u] || []).push(c.id);
    });
    const names = Object.keys(groups).sort((x, y) => {
      const ix = GROUP_ORDER.indexOf(x), iy = GROUP_ORDER.indexOf(y);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
    });
    return names.map((g) => ({
      name: g,
      universes: Object.keys(groups[g])
        .sort((x, y) => groups[g][y].length - groups[g][x].length || x.localeCompare(y))
        .map((u) => ({ name: u, ids: groups[g][u] }))
    }));
  }

  function loadFilter(cat) {
    const all = cat.flatMap((g) => g.universes.map((u) => u.name));
    const saved = S.settings.freeFilter;
    const picked = saved && Array.isArray(saved.universes) ? saved.universes.filter((u) => all.includes(u)) : all;
    return { universes: new Set(picked), mode: saved && saved.mode === "only" ? "only" : "vs" };
  }
  function saveFilter(f) {
    S.setSetting("freeFilter", { universes: Array.from(f.universes), mode: f.mode });
  }

  // ---------- fights from the filtered pool ----------
  function makePicker(poolIds, mode) {
    const pool = poolIds.map(W.char);
    const poolSet = new Set(poolIds);
    const others = W.characters.filter((c) => !poolSet.has(c.id));
    const used = new Set();
    const recent = []; // fighters seen in the last few fights rest for a while
    const rnd = Math.random;
    const pickFrom = (arr) => arr[Math.floor(rnd() * arr.length)];
    const oppSource = mode === "vs" && others.length ? others : pool;
    // how many recent fighters to avoid: as many as the pool can spare
    const restFor = (list) => Math.max(0, Math.min(10, list.length - 2));
    const resting = (c, list) => recent.slice(-restFor(list)).includes(c.id);

    function opponentsFor(a, strict) {
      let list = oppSource.filter((c) => c.id !== a.id && !used.has(E.pairKey(a.id, c.id)));
      if (strict) list = list.filter((c) => !resting(c, oppSource));
      const near = list.filter((c) => Math.abs(c.tier - a.tier) <= 1);
      return near.length ? near : list;
    }

    return function next() {
      for (let attempt = 0; attempt < 3; attempt++) {
        const strict = attempt === 0;
        const order = E.shuffle(pool, rnd);
        for (const a of order) {
          if (strict && resting(a, pool)) continue;
          const opp = opponentsFor(a, strict);
          if (!opp.length) continue;
          const b = pickFrom(opp);
          used.add(E.pairKey(a.id, b.id));
          recent.push(a.id, b.id);
          return rnd() < 0.5 ? { a: a.id, b: b.id } : { a: b.id, b: a.id };
        }
        if (attempt === 1) used.clear(); // every pair was seen this session: start over
      }
      const two = E.shuffle(pool.length > 1 ? pool : W.characters, rnd);
      return { a: two[0].id, b: two[1].id };
    };
  }

  W.views.free = function (root) {
    const cat = catalog();
    const filter = loadFilter(cat);
    let cleanup = null;

    function poolIds() {
      return cat.flatMap((g) => g.universes.filter((u) => filter.universes.has(u.name)).flatMap((u) => u.ids));
    }

    // ---------- setup ----------
    function drawSetup() {
      if (cleanup) { cleanup(); cleanup = null; }
      const ids = poolIds();
      const enough = filter.mode === "only" ? ids.length >= 2 : ids.length >= 1;

      const groupsHtml = cat.map((g) => {
        const on = g.universes.filter((u) => filter.universes.has(u.name)).length;
        const state = on === g.universes.length ? "on" : on ? "part" : "";
        const count = g.universes.reduce((n, u) => n + u.ids.length, 0);
        const chips = g.universes.map((u) =>
          `<button type="button" class="fchip ${filter.universes.has(u.name) ? "on" : ""}" data-u="${esc(u.name)}" aria-pressed="${filter.universes.has(u.name)}">${esc(u.name)} <small>${u.ids.length}</small></button>`
        ).join("");
        return `<div class="fgroup">
          <button type="button" class="fgroup-head ${state}" data-g="${esc(g.name)}" aria-pressed="${state === "on"}">
            <span class="fcheck" aria-hidden="true"></span><b>${esc(g.name)}</b><small>${count}</small>
          </button>
          ${g.universes.length > 1 ? `<div class="fchips">${chips}</div>` : ""}
        </div>`;
      }).join("");

      root.innerHTML = `
        <section class="free">
          <h1 class="page-title">${t("free.title")}</h1>
          <p class="page-sub">${t("free.sub")}</p>

          <div class="fmode" role="radiogroup" aria-label="${t("free.mixLabel")}">
            <button type="button" role="radio" data-mode="vs" aria-checked="${filter.mode === "vs"}" class="${filter.mode === "vs" ? "on" : ""}">
              <b>${t("free.vs")}</b><span>${t("free.vsHelp")}</span>
            </button>
            <button type="button" role="radio" data-mode="only" aria-checked="${filter.mode === "only"}" class="${filter.mode === "only" ? "on" : ""}">
              <b>${t("free.only")}</b><span>${t("free.onlyHelp")}</span>
            </button>
          </div>

          <div class="fbar">
            <span>${t("free.count", { n: ids.length })}</span>
            <span class="fbar-actions">
              <button type="button" class="link-btn" data-act="all">${t("free.all")}</button>
              <button type="button" class="link-btn" data-act="none">${t("free.none")}</button>
            </span>
          </div>
          <div class="fgroups">${groupsHtml}</div>

          <div class="next-bar">
            <button class="btn wide" id="freeStart" type="button" ${enough ? "" : "disabled"}>
              ${enough ? t("free.start") : t(filter.mode === "only" ? "free.needTwo" : "free.needOne")}
            </button>
          </div>
        </section>`;

      root.querySelector(".free").addEventListener("click", (ev) => {
        const u = ev.target.closest("[data-u]");
        const g = ev.target.closest("[data-g]");
        const md = ev.target.closest("[data-mode]");
        const act = ev.target.closest("[data-act]");
        if (u) {
          const name = u.dataset.u;
          filter.universes.has(name) ? filter.universes.delete(name) : filter.universes.add(name);
        } else if (g) {
          const grp = cat.find((x) => x.name === g.dataset.g);
          const allOn = grp.universes.every((x) => filter.universes.has(x.name));
          grp.universes.forEach((x) => (allOn ? filter.universes.delete(x.name) : filter.universes.add(x.name)));
        } else if (md) {
          filter.mode = md.dataset.mode;
        } else if (act) {
          cat.forEach((grp) => grp.universes.forEach((x) =>
            act.dataset.act === "all" ? filter.universes.add(x.name) : filter.universes.delete(x.name)));
        } else return;
        W.sound.play("tap");
        saveFilter(filter);
        const y = window.scrollY;
        drawSetup();
        window.scrollTo(0, y);
      });

      $("#freeStart", root).addEventListener("click", () => {
        W.sound.play("tap");
        startPlay();
      });
    }

    // ---------- endless fights ----------
    function startPlay() {
      const next = makePicker(poolIds(), filter.mode);
      const pairs = [];
      const state = { picks: [], score: 0, raw: 0, streak: 0 };
      let best = S.settings.freeBest || 0;

      cleanup = W.fights(root, {
        getPair(r) {
          while (pairs.length <= r) pairs.push(next());
          return pairs[r];
        },
        getState: () => state,
        addPick(p) {
          state.picks.push(p);
          state.raw += p.pts;
          state.score = Math.max(0, state.raw);
          state.streak = p.streakAfter;
          if (state.streak > best) { best = state.streak; S.setSetting("freeBest", best); }
          S.setSetting("freeFights", (S.settings.freeFights || 0) + 1);
          return state;
        },
        isLast: () => false,
        onFinish: () => {},
        voteKey: "free",
        hud(round, st) {
          return `<div class="hud free-hud">
            <div class="free-meta">
              <b>${t("free.fight", { n: round + 1 })}</b>
              <span>${t("free.best", { n: best })}</span>
            </div>
            <div class="free-right">
              <span class="hud-score"><b id="hudScore">${st.score}</b> ${t("pts")}</span>
              <button type="button" class="ghost small" id="freeFilters">${t("free.filters")}</button>
            </div>
          </div>`;
        }
      });

      // the filters button is redrawn with every fight, so listen on the root
      root.addEventListener("click", onFiltersClick);
    }
    function onFiltersClick(ev) {
      if (!ev.target.closest("#freeFilters")) return;
      W.sound.play("tap");
      root.removeEventListener("click", onFiltersClick);
      drawSetup();
      window.scrollTo(0, 0);
    }

    drawSetup();
    return () => {
      root.removeEventListener("click", onFiltersClick);
      if (cleanup) cleanup();
    };
  };
})();
