/* Square character portraits.
   A portrait shows the picture from assets/characters/<img> when the file
   exists. Until then it shows an emblem drawn here, so the site never has
   an empty frame. */
(function () {
  const W = window.WIS;

  function burst(n, outer, inner) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (Math.PI * i) / n - Math.PI / 2;
      pts.push((50 + r * Math.cos(a)).toFixed(1) + "," + (50 + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }
  function rays(n, from, to, width) {
    let s = "";
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const c = Math.cos(a), d = Math.sin(a);
      s += `<line x1="${(50 + from * c).toFixed(1)}" y1="${(50 + from * d).toFixed(1)}" x2="${(50 + to * c).toFixed(1)}" y2="${(50 + to * d).toFixed(1)}" stroke-width="${width}" stroke-linecap="round" stroke="#fff"/>`;
    }
    return s;
  }
  function spiral(turns, maxR) {
    const pts = [];
    const steps = turns * 40;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const a = p * turns * 2 * Math.PI;
      const r = 3 + p * maxR;
      pts.push((50 + r * Math.cos(a)).toFixed(1) + "," + (50 + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }

  const EMBLEMS = {
    // energy aura
    goku: `<path d="M50 6c6 18 26 26 26 50 0 20-12 36-26 36S24 76 24 56c0-12 8-18 10-30 6 6 9 11 10 17 2-12 2-24 6-37z"/><path d="M50 50c4 8 11 12 11 22 0 9-5 15-11 15s-11-6-11-15c0-10 7-14 11-22z" fill="#ffd21f"/>`,
    // one punch
    saitama: `<polygon points="${burst(12, 45, 25)}"/><circle cx="50" cy="50" r="12" fill="#e2372b"/>`,
    // yellow sun
    superman: `${rays(12, 27, 42, 5)}<circle cx="50" cy="50" r="19" fill="#ffd84a"/>`,
    // hammer and lightning
    thor: `<g transform="rotate(-24 50 50)"><rect x="22" y="12" width="50" height="27" rx="5"/><rect x="42" y="39" width="10" height="48" rx="4"/></g><path d="M78 40 62 64h10l-7 26 22-32H76l8-18z" fill="#ffe14a"/>`,
    // fist
    hulk: `<rect x="21" y="27" width="14" height="24" rx="6"/><rect x="36" y="23" width="14" height="26" rx="6"/><rect x="51" y="23" width="14" height="26" rx="6"/><rect x="66" y="27" width="14" height="24" rx="6"/><rect x="21" y="38" width="59" height="44" rx="12"/><rect x="13" y="53" width="44" height="17" rx="8.5" stroke="rgba(11,5,32,.4)" stroke-width="3"/><path d="M35 40v-6M50 40v-8M65 40v-6" stroke="rgba(11,5,32,.4)" stroke-width="2.5" stroke-linecap="round"/>`,
    // spiral
    naruto: `<polyline points="${spiral(3, 38)}" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
    // the mustache
    omniman: `<path d="M50 44c-8-13-27-13-41 4 10-3 16 7 27 10 7 2 12-3 14-8 2 5 7 10 14 8 11-3 17-13 27-10-14-17-33-17-41-4z"/>`,
    // straw hat
    luffy: `<ellipse cx="50" cy="65" rx="43" ry="11" fill="#ffe08a"/><path d="M24 63c0-32 52-32 52 0z" fill="#ffe08a"/><path d="M25 54c14 7 36 7 50 0v8c-14 7-36 7-50 0z" fill="#c8202a"/>`,
    // infinity
    gojo: `<path d="M50 50C40 33 13 33 13 50s27 17 37 0c10-17 37-17 37 0S60 67 50 50z" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`,
    // reactor
    ironman: `<circle cx="50" cy="50" r="35" fill="none" stroke="#fff" stroke-width="6"/>${rays(10, 19, 28, 6)}<circle cx="50" cy="50" r="11" fill="#bff3ff"/>`,
    // hidden fighter
    unknown: `<text x="50" y="72" text-anchor="middle" font-size="64" font-family="'Bricolage Grotesque', sans-serif" font-weight="800">?</text>`
  };

  function initials(name) {
    const letters = name.split(/\s|-/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return `<text x="50" y="66" text-anchor="middle" font-size="44" font-family="'Bricolage Grotesque', sans-serif" font-weight="800">${letters}</text>`;
  }

  W.portrait = function (c, extraClass) {
    const name = W.text(c.id).name;
    const img = c.img
      ? `<img src="assets/characters/${c.img}" alt="" loading="lazy" decoding="async" style="object-position:${c.pos || "50% 12%"}" onload="this.classList.add('ok')" onerror="this.remove()">`
      : "";
    return `<span class="portrait ${extraClass || ""}" style="--c1:${c.colors[0]};--c2:${c.colors[1]}">` +
      `<svg viewBox="0 0 100 100" aria-hidden="true" fill="#fff">${EMBLEMS[c.id] || initials(name)}</svg>${img}</span>`;
  };

  W.mysteryPortrait = function (extraClass) {
    return `<span class="portrait mystery ${extraClass || ""}" style="--c1:#4a4f5c;--c2:#2a2d35">` +
      `<svg viewBox="0 0 100 100" aria-hidden="true" fill="#fff">${EMBLEMS.unknown}</svg></span>`;
  };
})();
