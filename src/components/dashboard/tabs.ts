export const TABS = [
  ["team", "Team Overview"],
  ["players", "Player Profiles"],
  ["leaderboard", "Leaderboards"],
  ["gamelog", "Game Log"],
  ["analysis", "Analysis"],
] as const;

export type Tab = (typeof TABS)[number][0];
