/* POST /api/slider  { day, a, b, value, cid }  ->  { avg, total }
   value = the player's % for the LEFT fighter (body.a), 1-99.
   avg comes back for the same left fighter. Needs the D1 binding "DB". Called from worker/index.js. */
const ID = /^[a-z0-9]{1,40}$/, DAY = /^\d{4}-\d{2}-\d{2}$/, CID = /^[a-z0-9]{8,40}$/;
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
  const { day, a, b, cid } = body || {};
  const value = Number(body && body.value);
  if (!dayOk(day) || !ID.test(a) || !ID.test(b) || a === b || !Number.isInteger(value) || value < 1 || value > 99 || !CID.test(cid || "")) {
    return json({ error: "bad request" }, 400);
  }
  const swap = a > b;
  const [x, y] = swap ? [b, a] : [a, b];
  await env.DB.prepare("INSERT OR IGNORE INTO sliders (day, a, b, cid, value, created) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(day, x, y, cid, swap ? 100 - value : value, Date.now()).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS total, AVG(value) AS avg FROM sliders WHERE day = ? AND a = ? AND b = ?")
    .bind(day, x, y).first();
  const avg = row.avg == null ? null : swap ? 100 - row.avg : row.avg;
  return json({ avg, total: row.total || 0 });
}

export const onRequest = () => json({ error: "POST only" }, 405);
