import Leaderboard from "@/components/Leaderboard";
import PlayerProfile from "@/components/PlayerProfile";
import TeamOverview from "@/components/TeamOverview";

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <TeamOverview />
      <div className="grid gap-6 md:grid-cols-2">
        <Leaderboard />
        <PlayerProfile />
      </div>
    </div>
  );
}
