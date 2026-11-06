-- Tracks when each player's report was written and when their stats last changed. Safe to run more than once.
-- New databases get these columns from schema.sql.
ALTER TABLE players ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS stats_changed_at TIMESTAMPTZ;

-- Reports already saved count as current from now, so running this doesn't start regenerating them.
-- The next new game replaces them, as it does any report.
UPDATE players
SET report_generated_at = NOW()
WHERE report_generated_at IS NULL
  AND (nickname IS NOT NULL OR scouting_report IS NOT NULL OR strengths IS NOT NULL OR areas_to_develop IS NOT NULL);
