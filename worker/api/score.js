/* POST /api/score  { day, total, cid }  ->  { percentile, players }
   percentile = share of that day's players you beat (ties count half).
   null until 20 players have finished the day. Needs the D1 binding "DB". Called from worker/index.js. */
const DAY = /^\d{4}-\d{2}-\d{2}$/, CID = /^[a-z0-9]{8,40}$/;
const MIN_PLAYERS = 20;
const json = (data, status) => new Response(JSON.stringify(data), {
  status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
function dayOk(day) {
  if (!DAY.test(day)) return false;
  const t = Date.parse(day + "T00:00:00Z"), now = Date.now();
  return t >= Date.parse("2026-11-01T00:00:00Z") && t <= now + 2 * 864e5;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const { day, cid } = body || {};
  const total = Number(body && body.total);
  if (!dayOk(day) || !Number.isInteger(total) || total < 0 || total > 1000 || !CID.test(cid || "")) {
    return json({ error: "bad request" }, 400);
  }
  await env.DB.prepare("INSERT OR IGNORE INTO scores (day, cid, total, created) VALUES (?, ?, ?, ?)")
    .bind(day, cid, total, Date.now()).run();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS players, SUM(total < ?) AS below, SUM(total = ?) AS same FROM scores WHERE day = ?"
  ).bind(total, total, day).first();
  const players = row.players || 0;
  if (players < MIN_PLAYERS) return json({ percentile: null, players });
  const pct = Math.round((100 * ((row.below || 0) + 0.5 * Math.max(0, (row.same || 0) - 1))) / (players - 1));
  return json({ percentile: Math.min(99, Math.max(1, pct)), players });
}

export const onRequest = () => json({ error: "POST only" }, 405);
