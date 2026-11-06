-- Stores AI scouting reports and the coach's notes on each player. Safe to run more than once.
-- New databases get these columns from schema.sql.
ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS scouting_report TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS strengths TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS areas_to_develop TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS coach_notes TEXT;
