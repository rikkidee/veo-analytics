-- Public, view-only links to a team's dashboard. Safe to run more than once.
-- New databases get the column from schema.sql, but need this file run as well for the function.

-- The secret part of the team's link. Empty when sharing is off. Replacing it stops the old link working.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

-- Row level security still keeps every table to the team's owner. This is the only way in
-- for someone without an account: given a team's token, it returns that one team's stats.
-- Coach notes, coach context and the Veo links are left out, as they're the coach's own.
CREATE OR REPLACE FUNCTION public.get_shared_team(token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shared public.teams;
BEGIN
  -- Tokens are 43 characters (32 random bytes), so anything much shorter can't be one.
  IF token IS NULL OR length(token) < 32 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO shared FROM public.teams t WHERE t.share_token = token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'team', to_jsonb(shared) - 'coach_context' - 'share_token' - 'created_by',
    'players', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) - 'coach_notes') FROM public.players p WHERE p.team_id = shared.id),
      '[]'::jsonb
    ),
    'games', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'team_id', g.team_id, 'game_label', g.game_label, 'game_date', g.game_date,
          'opponent', g.opponent, 'team_stats', g.team_stats, 'created_at', g.created_at))
        FROM public.games g WHERE g.team_id = shared.id),
      '[]'::jsonb
    ),
    'stats', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('game_id', s.game_id, 'player_id', s.player_id, 'stats', s.stats))
        FROM public.player_game_stats s JOIN public.games g ON g.id = s.game_id WHERE g.team_id = shared.id),
      '[]'::jsonb
    ),
    'corrections', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'game_id', c.game_id, 'player_id', c.player_id, 'event_type', c.event_type, 'value', c.value))
        FROM public.event_corrections c JOIN public.games g ON g.id = c.game_id WHERE g.team_id = shared.id),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_team(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_team(TEXT) TO anon, authenticated;
