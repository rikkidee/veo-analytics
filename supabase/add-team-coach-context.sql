-- What the coach wants the team analysis to take into account. Run once in the Supabase SQL Editor.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_context TEXT;
