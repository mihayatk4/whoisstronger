/* GET /api/admin?from=YYYY-MM-DD&day=YYYY-MM-DD  — numbers for admin.html.
   Needs the header  Authorization: Bearer <ADMIN_KEY>,  where ADMIN_KEY is a
   secret set in Cloudflare (Worker → Settings → Variables and Secrets).
   "from" hides older days (test data), "day" picks the day shown in detail.
   A "player" is one browser (cid) that answered at least one fight.        */
import { ensureVisits } from "./time.js";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const json = (data, status) => new Response(JSON.stringify(data), {
  status: status || 200,
  headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" }
});

async function sha(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function keyOk(request, env) {
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!got || !env.ADMIN_KEY) return false;
  const [a, b] = await Promise.all([sha(got), sha(env.ADMIN_KEY)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; // same time for every wrong key
  return diff === 0;
}

// every (day, browser) that did anything
const PLAYS = `(SELECT day, cid FROM votes WHERE day >= ?1
  UNION SELECT day, cid FROM sliders WHERE day >= ?1
  UNION SELECT day, cid FROM scores WHERE day >= ?1)`;

export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_KEY) return json({ error: "ADMIN_KEY is not set in Cloudflare yet" }, 503);
  if (!(await keyOk(request, env))) {
    await new Promise((r) => setTimeout(r, 600)); // slows down guessing
    return json({ error: "wrong key" }, 401);
  }
  const url = new URL(request.url);
  const from = DAY.test(url.searchParams.get("from") || "") ? url.searchParams.get("from") : "2026-11-17";
  const db = env.DB;
  const all = (sql, ...args) => db.prepare(sql).bind(...args).all().then((r) => r.results || []);

  await ensureVisits(db);
  const [totals, daily, newPlayers, finished, hours, latest, time, timeDaily] = await Promise.all([
    all(`SELECT
        (SELECT COUNT(DISTINCT cid) FROM ${PLAYS}) AS players,
        (SELECT COUNT(*) FROM (SELECT cid FROM ${PLAYS} GROUP BY cid HAVING COUNT(*) > 1)) AS came_back,
        (SELECT COUNT(*) FROM votes WHERE day >= ?1) AS votes,
        (SELECT COUNT(*) FROM sliders WHERE day >= ?1) AS sliders,
        (SELECT COUNT(*) FROM scores WHERE day >= ?1) AS finished`, from),
    all(`SELECT day, COUNT(*) AS players FROM ${PLAYS} GROUP BY day ORDER BY day`, from),
    all(`SELECT first AS day, COUNT(*) AS n FROM (SELECT cid, MIN(day) AS first FROM ${PLAYS} GROUP BY cid) GROUP BY first`, from),
    all(`SELECT day, COUNT(*) AS n, ROUND(AVG(total)) AS avg, MAX(total) AS best FROM scores WHERE day >= ?1 GROUP BY day`, from),
    // when people play: distinct browsers per hour (UTC) over the last 14 days
    all(`SELECT CAST((created / 3600000) % 24 AS INTEGER) AS h, COUNT(DISTINCT cid) AS n
         FROM votes WHERE day >= ?1 AND created > ?2 GROUP BY h`, from, Date.now() - 14 * 864e5),
    all(`SELECT MAX(day) AS day FROM ${PLAYS}`, from),
    // time on site: per visit (one open tab) and per person per day (all their visits added up)
    all(`SELECT COUNT(*) AS visits, ROUND(AVG(ms)) AS per_visit,
           (SELECT ROUND(AVG(t)) FROM (SELECT SUM(ms) AS t FROM visits WHERE day >= ?1 GROUP BY day, cid)) AS per_person
         FROM visits WHERE day >= ?1`, from),
    all(`SELECT day, COUNT(*) AS visits, ROUND(AVG(ms)) AS per_visit,
           (SELECT ROUND(AVG(t)) FROM (SELECT SUM(ms) AS t FROM visits v2 WHERE v2.day = v.day GROUP BY cid)) AS per_person
         FROM visits v WHERE day >= ?1 GROUP BY day`, from)
  ]);

  let day = url.searchParams.get("day");
  if (!DAY.test(day || "")) day = (latest[0] && latest[0].day) || from;

  const [votes, sliders, sliderHist, scoreHist] = await Promise.all([
    all(`SELECT a, b, pick, COUNT(*) AS n FROM votes WHERE day = ? GROUP BY a, b, pick`, day),
    all(`SELECT a, b, COUNT(*) AS n, ROUND(AVG(value), 1) AS avg FROM sliders WHERE day = ? GROUP BY a, b`, day),
    all(`SELECT a, b, MIN(value / 10, 9) AS bucket, COUNT(*) AS n FROM sliders WHERE day = ? GROUP BY a, b, bucket`, day),
    all(`SELECT MIN(total / 100, 9) AS bucket, COUNT(*) AS n FROM scores WHERE day = ? GROUP BY bucket`, day)
  ]);

  return json({
    from, day, generated: Date.now(),
    totals: totals[0], daily, newPlayers, finished, hours, time: time[0], timeDaily,
    detail: { votes, sliders, sliderHist, scoreHist }
  });
}

export const onRequest = () => json({ error: "GET only" }, 405);
