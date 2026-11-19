/* POST /api/vote  { day, a, b, pick, cid }  ->  { total, votesA }
   One vote per browser per fight (the first one counts). votesA = votes for
   the fighter the player saw on the LEFT (body.a). Needs the D1 binding "DB". Called from worker/index.js. */
const ID = /^[a-z0-9]{1,40}$/, DAY = /^\d{4}-\d{2}-\d{2}$/, CID = /^[a-z0-9]{8,40}$/;
const json = (data, status) => new Response(JSON.stringify(data), {
  status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
function dayOk(day) {
  if (!DAY.test(day)) return false;
  const t = Date.parse(day + "T00:00:00Z"), now = Date.now();
  return t >= Date.parse("2026-11-01T00:00:00Z") && t <= now + 2 * 864e5; // no future days
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const { day, a, b, pick, cid } = body || {};
  if (!dayOk(day) || !ID.test(a) || !ID.test(b) || a === b || (pick !== a && pick !== b) || !CID.test(cid || "")) {
    return json({ error: "bad request" }, 400);
  }
  const [x, y] = a < b ? [a, b] : [b, a];
  await env.DB.prepare("INSERT OR IGNORE INTO votes (day, a, b, cid, pick, created) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(day, x, y, cid, pick, Date.now()).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(pick = ?) AS votesA FROM votes WHERE day = ? AND a = ? AND b = ?")
    .bind(a, day, x, y).first();
  return json({ total: row.total || 0, votesA: row.votesA || 0 });
}

export const onRequest = () => json({ error: "POST only" }, 405);
