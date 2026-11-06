-- Stores the AI-written season analysis on each team. Safe to run more than once.
-- New databases get this column from schema.sql.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_analysis TEXT;
