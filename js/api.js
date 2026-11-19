/* Players' votes and the "better than X% of players" number.

   There is no server yet. On your computer (localhost or a file opened
   directly) this file returns DEMO numbers so the screens can be seen and
   tuned. On a live site it calls the real API below and, until that API
   exists, simply shows "Not enough votes yet".

   API (Cloudflare Worker + D1, see worker/ and db/schema.sql):
     POST /api/vote    { day, a, b, pick, cid }   -> { total, votesA }
     POST /api/slider  { day, a, b, value, cid }  -> { avg, total }
     POST /api/score   { day, total, cid }        -> { percentile, players }
   cid = a random ID made once in this browser (no name, no account), so each
   browser counts once per fight.                                            */
(function () {
  const W = window.WIS;
  const cfg = W.config;
  const E = W.engine;

  const isLocal =
    location.protocol === "file:" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    /\.localhost$|\.test$/.test(location.hostname);
  const demo = cfg.crowdMode === "demo" || (cfg.crowdMode === "auto" && isLocal);

  function clientId() {
    try {
      let id = localStorage.getItem("wis:cid");
      if (!id) {
        const a = new Uint8Array(12);
        crypto.getRandomValues(a);
        id = Array.from(a, (n) => n.toString(36).padStart(2, "0")).join("").slice(0, 20);
        localStorage.setItem("wis:cid", id);
      }
      return id;
    } catch (e) { return "anon" + Math.random().toString(36).slice(2, 14); }
  }

  function post(path, body) {
    body.cid = clientId();
    return fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }

  /* Resolves to { total, pctA, demo } or null when there is nothing to show. */
  function vote(dayKey, m, pickId) {
    if (demo) {
      const rnd = E.rngFrom("crowd:" + dayKey + ":" + E.pairKey(m.a, m.b));
      const share = Math.min(0.92, Math.max(0.08, m.pA + (rnd() - 0.5) * 0.34));
      const total = 180 + Math.floor(rnd() * 1400);
      const votesA = Math.round(total * share) + (pickId === m.a ? 1 : 0);
      return Promise.resolve({ total: total + 1, pctA: Math.round((votesA / (total + 1)) * 100), demo: true });
    }
    return post("/api/vote", { day: dayKey, a: m.a, b: m.b, pick: pickId }).then((res) => {
      if (!res || !(res.total >= cfg.minVotesToShow)) return null;
      return { total: res.total, pctA: Math.round((res.votesA / res.total) * 100), demo: false };
    });
  }

  /* Slider rounds: resolves to { avg, total, demo } or null.
     avg = the average player's guess for the left fighter. */
  function sliderVote(dayKey, m, value) {
    if (demo) {
      const rnd = E.rngFrom("slider-crowd:" + dayKey + ":" + E.pairKey(m.a, m.b));
      const avg = Math.round(Math.min(95, Math.max(5, m.pctA + (rnd() - 0.5) * 24)));
      return Promise.resolve({ avg, total: 150 + Math.floor(rnd() * 900), demo: true });
    }
    return post("/api/slider", { day: dayKey, a: m.a, b: m.b, value }).then((res) => {
      if (!res || !(res.total >= cfg.minVotesToShow)) return null;
      return { avg: Math.round(res.avg), total: res.total, demo: false };
    });
  }

  /* Resolves to { pct, demo } or null. */
  function percentile(dayKey, total, max) {
    if (demo) {
      const z = (total - 0.7 * max) / (0.14 * max);
      const pct = Math.round(100 / (1 + Math.exp(-1.7 * z)));
      return Promise.resolve({ pct: Math.min(99, Math.max(1, pct)), demo: true });
    }
    return post("/api/score", { day: dayKey, total }).then((res) =>
      res && res.percentile != null ? { pct: res.percentile, demo: false } : null
    );
  }

  W.api = { vote, sliderVote, percentile, demo };
})();
