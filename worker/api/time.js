/* POST /api/time  { sid, day, ms, cid }  — how long one visit has lasted so far.
   sid = random ID of this visit (one open tab), ms = active time in ms.
   The game resends the growing total, so only the biggest value is kept.
   The "visits" table is created here on first use (no manual SQL needed). */
const DAY = /^\d{4}-\d{2}-\d{2}$/, ID = /^[a-z0-9]{8,40}$/;
const MAX_MS = 3 * 3600 * 1000; // one visit counts at most 3 hours
const json = (data, status) => new Response(JSON.stringify(data), {
  status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

let ready = null;
export function ensureVisits(db) {
  if (!ready) {
    ready = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS visits (
        sid TEXT PRIMARY KEY, cid TEXT NOT NULL, day TEXT NOT NULL,
        ms INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS visits_day ON visits (day)")
    ]).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

function dayOk(day) {
  if (!DAY.test(day)) return false;
  const t = Date.parse(day + "T00:00:00Z"), now = Date.now();
  return t >= Date.parse("2026-11-01T00:00:00Z") && t <= now + 2 * 864e5;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ error: "bad json" }, 400); }
  const { sid, day, cid } = body || {};
  const ms = Number(body && body.ms);
  if (!ID.test(sid || "") || !ID.test(cid || "") || !dayOk(day) || !Number.isFinite(ms) || ms < 0) {
    return json({ error: "bad request" }, 400);
  }
  await ensureVisits(env.DB);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO visits (sid, cid, day, ms, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(sid) DO UPDATE SET ms = MAX(ms, excluded.ms), updated = excluded.updated`
  ).bind(sid, cid, day, Math.min(MAX_MS, Math.round(ms)), now).run();
  return json({ ok: true });
}

export const onRequest = () => json({ error: "POST only" }, 405);
