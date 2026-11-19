/* Fight history: the full breakdown of any fight you already played.
   Address: #/fight/<day>/<n>  (n = 1..5). Unplayed fights stay hidden. */
(function () {
  const W = window.WIS;
  const E = W.engine, S = W.store, t = W.t;
  const { $, esc, go, tierChip } = W.ui;

  function card(c, side, m, pickedId) {
    const tx = W.text(c.id);
    const result = m.even ? "even" : c.id === m.favorite ? "win" : "lose";
    const picked = pickedId === c.id;
    return `<div class="fighter static ${side} ${result} ${picked ? "picked" : pickedId ? "passed" : ""}">
      <span class="f-pic">
        ${W.portrait(c)}
        <span class="f-mark rich-only" aria-hidden="true">${m.even ? "=" : c.id === m.favorite ? "✓" : "✕"}</span>
        <span class="f-pct rich-only"><b>${c.id === m.a ? m.pctA : m.pctB}</b>%</span>
      </span>
      <span class="f-flag">${t("battle.yourPick")}</span>
      <span class="f-name">${esc(tx.name)}</span>
      <span class="f-meta"><span>${esc(tx.universe)}</span>${tierChip(c)}</span>
    </div>`;
  }

  W.views.fight = function (root, key, parts) {
    const idx = E.dayIndex(key);
    const day = E.battleDay(idx);
    const d = S.day(key);
    const total = day.pairs.length;
    const n = Math.max(1, Math.min(total, parseInt(parts[2], 10) || 1));
    const pk = d.battle.picks[n - 1];
    if (!pk) { go("#/result/" + key, true); return; } // not played yet: no spoilers

    const a = W.char(pk.a), b = W.char(pk.b);
    const m = E.matchup(a, b);
    const boss = n === total;
    const played = d.battle.picks.length;
    const link = (k) => `#/fight/${key}/${k}`;

    root.innerHTML = `
      <section class="history">
        <a class="hist-back" href="#/result/${key}">‹ ${t("result.title", { n: idx + 1 })}</a>
        <div class="hist-top">
          ${n > 1 ? `<a class="hist-arrow" href="${link(n - 1)}" aria-label="${t("history.prev")}">‹</a>` : `<span class="hist-arrow off" aria-hidden="true">‹</span>`}
          <span class="hist-count">
            <b>${t("history.fight", { n, total })}</b>
            ${boss ? `<i class="hist-boss">${t("battle.boss")}</i>` : ""}${pk.type === "slider" ? `<i class="hist-slider">${t("history.slider")}</i>` : ""}
            <span class="hist-dots">${Array.from({ length: total }, (_, i) => {
              const p = d.battle.picks[i];
              const mood = p ? E.moodOf(p) : "";
              return p ? `<a class="hd ${mood} ${i + 1 === n ? "cur" : ""}" href="${link(i + 1)}" aria-label="${t("history.fight", { n: i + 1, total })}"></a>` : `<span class="hd"></span>`;
            }).join("")}</span>
          </span>
          ${n < played ? `<a class="hist-arrow" href="${link(n + 1)}" aria-label="${t("history.next")}">›</a>` : `<span class="hist-arrow off" aria-hidden="true">›</span>`}
        </div>
        <div class="arena revealed">
          ${card(a, "left", m, pk.type === "choice" ? pk.pick : null)}
          <span class="vs" aria-hidden="true">VS</span>
          ${card(b, "right", m, pk.type === "choice" ? pk.pick : null)}
        </div>
        <div class="reveal on" id="detail">${W.fightDetail.html(m, a, b, pk, { live: false })}</div>
        <nav class="hist-nav">
          ${n > 1 ? `<a class="ghost" href="${link(n - 1)}">‹ ${t("history.prev")}</a>` : "<span></span>"}
          ${n < played ? `<a class="btn small" href="${link(n + 1)}">${t("history.next")} ›</a>` : `<a class="btn small" href="#/result/${key}">${t("seeResult")}</a>`}
        </nav>
      </section>`;

    W.fightDetail.loadCrowd($("#detail", root), m, a, b, pk, key);
  };
})();
