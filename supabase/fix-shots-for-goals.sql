-- Every goal counts as at least one shot, so raises Shots to match Goals wherever it's lower or missing.
-- Run once in the Supabase SQL Editor. Safe to run again, as a fixed row no longer matches.
-- It reports how many rows changed. New imports and the dashboard already apply this rule.

WITH counts AS (
  SELECT
    id,
    CASE WHEN stats->>'Goals' ~ '^[0-9]+(\.[0-9]+)?$' THEN (stats->>'Goals')::numeric ELSE 0 END AS goals,
    CASE WHEN stats->>'Shots' ~ '^[0-9]+(\.[0-9]+)?$' THEN (stats->>'Shots')::numeric ELSE 0 END AS shots
  FROM player_game_stats
),
fixed AS (
  UPDATE player_game_stats s
  SET stats = s.stats || jsonb_build_object('Shots', c.goals)
  FROM counts c
  WHERE s.id = c.id AND c.goals > 0 AND c.shots < c.goals
  RETURNING s.id
)
SELECT count(*) AS rows_fixed FROM fixed;
