-- Scouting reports, team analysis and logos for the dashboard. Safe to run more than once.
-- New databases get these columns from schema.sql.
ALTER TABLE players ADD COLUMN IF NOT EXISTS strengths TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS areas_to_develop TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS analysis TEXT;
