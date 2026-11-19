-- Votes database (Cloudflare D1). Create once:
--   Cloudflare dashboard → Storage & Databases → D1 → Create "whoisstrongest"
--   → open it → Console → paste this file → Execute.
-- Pairs are stored in alphabetical order (a < b) so "goku vs superman" and
-- "superman vs goku" count together. cid = random browser ID, one answer each.
-- sliders.value = the guessed % for fighter a.
-- Keep comments OUTSIDE the statements: the D1 console joins lines into one.

CREATE TABLE IF NOT EXISTS votes (
  day TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL,
  cid TEXT NOT NULL, pick TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY (day, a, b, cid)
);

CREATE TABLE IF NOT EXISTS sliders (
  day TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL,
  cid TEXT NOT NULL, value INTEGER NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY (day, a, b, cid)
);

CREATE TABLE IF NOT EXISTS scores (
  day TEXT NOT NULL, cid TEXT NOT NULL, total INTEGER NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY (day, cid)
);
CREATE INDEX IF NOT EXISTS scores_day_total ON scores (day, total);
