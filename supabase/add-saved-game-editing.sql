-- Lets saved games be re-mapped. Safe to run more than once.
-- New databases get these columns from schema.sql.

-- The Veo report as it was read. player_game_stats merges rows by player and drops
-- skipped jerseys, so changing a mapping has to start from the original numbers.
ALTER TABLE games ADD COLUMN IF NOT EXISTS veo_payload JSONB;

-- Which key event in veo_payload a hand assignment came from.
ALTER TABLE event_corrections ADD COLUMN IF NOT EXISTS event_index INTEGER;
