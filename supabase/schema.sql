-- Teams
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  club TEXT,
  age_group TEXT,
  logo_url TEXT,
  -- The dashboard's Analysis tab.
  analysis TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players (roster)
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_jersey INTEGER NOT NULL,
  position TEXT,
  nickname TEXT,
  scouting_report TEXT,
  -- Shown on the dashboard's player profile.
  strengths TEXT,
  areas_to_develop TEXT,
  coach_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games
CREATE TABLE games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  game_label TEXT NOT NULL,
  game_date DATE NOT NULL,
  opponent TEXT,
  veo_url TEXT,
  team_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jersey mappings per game (for misdetected jerseys)
CREATE TABLE jersey_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  detected_jersey INTEGER NOT NULL,
  player_id UUID REFERENCES players(id),
  is_noise BOOLEAN DEFAULT FALSE
);

-- Player game stats (raw scraped + corrected)
CREATE TABLE player_game_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  stats JSONB NOT NULL DEFAULT '{}',
  is_corrected BOOLEAN DEFAULT FALSE,
  UNIQUE(game_id, player_id)
);

-- Event corrections (manual goal/shot assignments)
CREATE TABLE event_corrections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  event_type TEXT NOT NULL,
  value INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE jersey_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_corrections ENABLE ROW LEVEL SECURITY;

-- RLS policies (team creator can do everything)
CREATE POLICY "Users can manage their teams" ON teams FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Users can manage players on their teams" ON players FOR ALL USING (team_id IN (SELECT id FROM teams WHERE created_by = auth.uid()));
CREATE POLICY "Users can manage games on their teams" ON games FOR ALL USING (team_id IN (SELECT id FROM teams WHERE created_by = auth.uid()));
CREATE POLICY "Users can manage jersey mappings" ON jersey_mappings FOR ALL USING (game_id IN (SELECT g.id FROM games g JOIN teams t ON g.team_id = t.id WHERE t.created_by = auth.uid()));
CREATE POLICY "Users can manage player game stats" ON player_game_stats FOR ALL USING (game_id IN (SELECT g.id FROM games g JOIN teams t ON g.team_id = t.id WHERE t.created_by = auth.uid()));
CREATE POLICY "Users can manage event corrections" ON event_corrections FOR ALL USING (game_id IN (SELECT g.id FROM games g JOIN teams t ON g.team_id = t.id WHERE t.created_by = auth.uid()));
