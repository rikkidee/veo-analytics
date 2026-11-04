"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type PlayerDraft = { key: number; name: string; jersey: string; position: string };

const inputClass =
  "w-full min-w-0 rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700";

export default function RosterForm() {
  const router = useRouter();
  const [team, setTeam] = useState({ name: "", club: "", ageGroup: "" });
  const [players, setPlayers] = useState<PlayerDraft[]>([
    { key: 0, name: "", jersey: "", position: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePlayer(key: number, changes: Partial<PlayerDraft>) {
    setPlayers((current) =>
      current.map((player) => (player.key === key ? { ...player, ...changes } : player)),
    );
  }

  function addPlayer() {
    setPlayers((current) => [...current, { key: nextKey, name: "", jersey: "", position: "" }]);
    setNextKey(nextKey + 1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sign in to save a team. Your data is tied to your account.");
        return;
      }

      const { data: savedTeam, error: teamError } = await supabase
        .from("teams")
        .insert({
          name: team.name.trim(),
          club: team.club.trim() || null,
          age_group: team.ageGroup.trim() || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (teamError) throw teamError;

      const { error: playersError } = await supabase.from("players").insert(
        players.map((player) => ({
          team_id: savedTeam.id,
          name: player.name.trim(),
          default_jersey: Number(player.jersey),
          position: player.position.trim() || null,
        })),
      );
      if (playersError) {
        // The two inserts aren't a transaction, so don't leave an empty team behind.
        await supabase.from("teams").delete().eq("id", savedTeam.id);
        throw playersError;
      }

      router.push("/onboarding/games");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the roster.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Team</legend>
        <input
          required
          aria-label="Team name"
          placeholder="Team name"
          value={team.name}
          onChange={(event) => setTeam({ ...team, name: event.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Club"
          placeholder="Club"
          value={team.club}
          onChange={(event) => setTeam({ ...team, club: event.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Age group"
          placeholder="Age group, e.g. U14"
          value={team.ageGroup}
          onChange={(event) => setTeam({ ...team, ageGroup: event.target.value })}
          className={inputClass}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Players</legend>
        {players.map((player) => (
          <div key={player.key} className="grid grid-cols-[5rem_1fr] gap-2 sm:grid-cols-[5rem_1fr_1fr_auto]">
            <input
              required
              type="number"
              min={0}
              step={1}
              aria-label="Jersey number"
              placeholder="#"
              value={player.jersey}
              onChange={(event) => updatePlayer(player.key, { jersey: event.target.value })}
              className={inputClass}
            />
            <input
              required
              aria-label="Player name"
              placeholder="Name"
              value={player.name}
              onChange={(event) => updatePlayer(player.key, { name: event.target.value })}
              className={inputClass}
            />
            <input
              aria-label="Position"
              placeholder="Position"
              value={player.position}
              onChange={(event) => updatePlayer(player.key, { position: event.target.value })}
              className={inputClass}
            />
            <button
              type="button"
              disabled={players.length === 1}
              onClick={() =>
                setPlayers((current) => current.filter((other) => other.key !== player.key))
              }
              className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:underline disabled:opacity-40 dark:text-neutral-400"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addPlayer}
          className="mt-1 self-start text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          + Add player
        </button>
      </fieldset>

      {!isSupabaseConfigured && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Saving is off until NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || !isSupabaseConfigured}
        className="self-start rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
