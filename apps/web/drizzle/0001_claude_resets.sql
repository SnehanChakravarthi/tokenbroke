-- Historical resets, so "days since last reset" is true for both labs.
-- Anthropic reset all subscriber limits on 2026-04-23 (quality-issues apology) and quietly reset
-- 5-hour + weekly limits on 2026-07-10 after a stretch of outages (press-documented).
INSERT INTO "resets" ("tool", "announced_at", "landed_at", "source", "note") VALUES
  ('claude-code', '2026-04-23T00:00:00Z', '2026-04-23T18:00:00Z', 'admin', 'apology reset after acknowledged quality regressions'),
  ('claude-code', NULL, '2026-07-10T18:00:00Z', 'admin', 'quiet reset of 5h + weekly limits after outages');
