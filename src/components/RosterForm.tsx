"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { primaryButton } from "@/components/import/buttons";
import { isSamePerson, type DashboardPlayer, type DashboardTeam } from "@/lib/stats";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

function describeSaveError(cause: unknown) {
  const { code, message } = (cause ?? {}) as { code?: string; message?: string };
  // PGRST205: the table isn't in the API's schema. 42P01: Postgres has no such table.
  if (code === "PGRST205" || code === "42P01") {
    return "The database isn't set up yet, so your team wasn't saved. Run supabase/schema.sql in the Supabase SQL Editor, then save again. Everything you entered is still here.";
  }
  return message || "Could not save the roster.";
}

const POSITIONS = ["Forward", "Wing", "Midfielder", "Defender", "Goalkeeper"] as const;
type Position = (typeof POSITIONS)[number];

/** `id` is set once the player exists in the database. */
type PlayerDraft = { key: number; id?: string; name: string; jersey: string; positions: Position[] };

const isPosition = (text: string): text is Position => (POSITIONS as readonly string[]).includes(text);
const readPositions = (position?: string | null) => (position ?? "").split(", ").filter(isPosition);
const blankPlayer = (key: number): PlayerDraft => ({ key, name: "", jersey: "", positions: [] });

const asRow = (player: PlayerDraft) => ({
  name: player.name.trim(),
  default_jersey: Number(player.jersey),
  position: player.positions.join(", ") || null,
});

const inputClass =
  "w-full min-w-0 rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700";
const labelClass = "text-sm font-medium text-neutral-700 dark:text-neutral-300";

// Shared by the header and every row: they are separate grids, so the columns
// only line up if the Remove column has a fixed width.
const desktopColumns = "sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_5rem]";

function PositionPicker({
  value,
  onChange,
}: {
  value: Position[];
  onChange: (positions: Position[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  function toggle(position: Position) {
    const next = value.includes(position)
      ? value.filter((other) => other !== position)
      : [...value, position];
    // Keep a stable order regardless of the order they were ticked in.
    onChange(POSITIONS.filter((other) => next.includes(other)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      // Enter on a checkbox would otherwise submit the whole form.
      event.preventDefault();
      event.target.click();
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        // relatedTarget is null when clicking non-focusable things, which the
        // pointerdown listener handles; this catches tabbing out of the picker.
        if (event.relatedTarget && !rootRef.current?.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <div className="flex min-h-[38px] flex-wrap items-center gap-1 rounded-md border border-neutral-300 p-1 dark:border-neutral-700">
        {value.map((position) => (
          <span
            key={position}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 py-0.5 pl-2 pr-1 text-xs font-medium text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
          >
            {position}
            <button
              type="button"
              aria-label={`Remove ${position}`}
              onClick={() => toggle(position)}
              className="rounded-full px-1 leading-none hover:bg-emerald-200 dark:hover:bg-emerald-800"
            >
              ×
            </button>
          </span>
        ))}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            value.length > 0 ? `Change positions: ${value.join(", ")}` : "Select positions"
          }
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-16 flex-1 items-center justify-between gap-1 px-1 py-0.5 text-left text-sm text-neutral-500 dark:text-neutral-400"
        >
          <span>{value.length > 0 ? "" : "Select positions"}</span>
          <span aria-hidden="true" className="text-xs">
            {open ? "▲" : "▼"}
          </span>
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Positions this player can play"
          className="absolute left-0 right-0 z-10 mt-1 rounded-md border border-neutral-300 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <p className="px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400">
            Choose all that apply
          </p>
          {POSITIONS.map((position) => (
            <label
              key={position}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <input
                type="checkbox"
                checked={value.includes(position)}
                onChange={() => toggle(position)}
                className="accent-emerald-700"
              />
              {position}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

type RosterFormProps = {
  /** The team to edit. Without one, this creates a new team. */
  team?: DashboardTeam;
  players?: DashboardPlayer[];
  /** How many games each player has stats in, by player id. */
  gameCounts?: Record<string, number>;
  /** Called with the team's id once everything is in the database. */
  onSaved: (teamId: string) => void;
};

export default function RosterForm({ team: existing, players: saved = [], gameCounts = {}, onSaved }: RosterFormProps) {
  const [team, setTeam] = useState({
    name: existing?.name ?? "",
    club: existing?.club ?? "",
    ageGroup: existing?.age_group ?? "",
  });
  const [players, setPlayers] = useState<PlayerDraft[]>(() =>
    saved.length > 0
      ? saved
          .toSorted((a, b) => a.default_jersey - b.default_jersey)
          .map((player, key) => ({
            key,
            id: player.id,
            name: player.name,
            jersey: String(player.default_jersey),
            positions: readPositions(player.position),
          }))
      : [blankPlayer(0)],
  );
  const [nextKey, setNextKey] = useState(Math.max(saved.length, 1));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePlayer(key: number, changes: Partial<PlayerDraft>) {
    setJustSaved(false);
    setPlayers((current) =>
      current.map((player) => (player.key === key ? { ...player, ...changes } : player)),
    );
  }

  function addPlayer() {
    setJustSaved(false);
    setPlayers((current) => [...current, blankPlayer(nextKey)]);
    setNextKey(nextKey + 1);
  }

  const isUnchanged = (draft: PlayerDraft) => {
    const original = saved.find((player) => player.id === draft.id);
    return (
      original !== undefined &&
      original.name === draft.name.trim() &&
      original.default_jersey === Number(draft.jersey) &&
      (original.position ?? null) === asRow(draft).position
    );
  };

  async function createTeam() {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You've been signed out. Sign in again in another tab, then click Save Team.");
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

    const { error: playersError } = await supabase
      .from("players")
      .insert(players.map((player) => ({ team_id: savedTeam.id, ...asRow(player) })));
    if (playersError) {
      // The two inserts aren't a transaction, so don't leave an empty team behind.
      await supabase.from("teams").delete().eq("id", savedTeam.id);
      throw playersError;
    }
    onSaved(savedTeam.id);
  }

  /** Separate requests, not a transaction. Each step can safely run again if a later one fails. */
  async function saveEdits(teamId: string, removed: DashboardPlayer[]) {
    const supabase = getSupabase();
    const { error: teamError } = await supabase
      .from("teams")
      .update({ name: team.name.trim(), club: team.club.trim() || null, age_group: team.ageGroup.trim() || null })
      .eq("id", teamId);
    if (teamError) throw teamError;

    for (const draft of players.filter((player) => !player.id)) {
      const { data, error: insertError } = await supabase
        .from("players")
        .insert({ team_id: teamId, ...asRow(draft) })
        .select("id")
        .single();
      if (insertError) throw insertError;
      // Remembered right away, so saving again after a failure can't add them twice.
      updatePlayer(draft.key, { id: data.id });
    }

    for (const draft of players.filter((player) => player.id && !isUnchanged(player))) {
      const { error: updateError } = await supabase.from("players").update(asRow(draft)).eq("id", draft.id);
      if (updateError) throw updateError;
    }

    if (removed.length > 0) {
      const ids = removed.map((player) => player.id);
      // These two would otherwise block the delete. A jersey that loses its player
      // goes back to unassigned, and its stats can be mapped to someone else.
      for (const table of ["event_corrections", "jersey_mappings"]) {
        const { error: clearError } = await supabase.from(table).delete().in("player_id", ids);
        if (clearError) throw clearError;
      }
      const { error: removeError } = await supabase.from("players").delete().in("id", ids);
      if (removeError) throw removeError;
    }

    setJustSaved(true);
    onSaved(teamId);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setJustSaved(false);

    const entries = players.map((player) => ({ name: player.name, jersey: Number(player.jersey) }));
    // Two old rows that already match are left alone: their stats are combined on the
    // dashboard, and removing one to get past this would delete its stats.
    const repeated = entries.find((entry, index) =>
      entries
        .slice(0, index)
        .some(
          (other, otherIndex) =>
            isSamePerson(other, entry) && !(isUnchanged(players[index]) && isUnchanged(players[otherIndex])),
        ),
    );
    if (repeated) {
      setError(`"${repeated.name.trim()}" is on this roster twice. Remove one of them, then click Save.`);
      return;
    }

    const removed = saved.filter((player) => !players.some((draft) => draft.id === player.id));
    const removedWithStats = removed.filter((player) => gameCounts[player.id] > 0);
    if (
      removedWithStats.length > 0 &&
      !window.confirm(
        `Remove ${removedWithStats
          .map((player) => `${player.name} (stats in ${gameCounts[player.id]} ${gameCounts[player.id] === 1 ? "game" : "games"})`)
          .join(", ")}?\n\nTheir stats, report and coach notes will be deleted. Their jerseys go back to unassigned, so those games' stats can be mapped to someone else.`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      if (existing) await saveEdits(existing.id, removed);
      else await createTeam();
    } catch (cause) {
      setError(describeSaveError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Team</legend>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Team name</span>
          <input
            required
            placeholder="e.g. Riverside Rovers"
            value={team.name}
            onChange={(event) => {
              setJustSaved(false);
              setTeam({ ...team, name: event.target.value });
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Club (optional)</span>
          <input
            placeholder="e.g. Riverside SC"
            value={team.club}
            onChange={(event) => {
              setJustSaved(false);
              setTeam({ ...team, club: event.target.value });
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Age group (optional)</span>
          <input
            placeholder="e.g. U14"
            value={team.ageGroup}
            onChange={(event) => {
              setJustSaved(false);
              setTeam({ ...team, ageGroup: event.target.value });
            }}
            className={inputClass}
          />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Players</legend>
        <div aria-hidden="true" className={`hidden gap-2 sm:grid ${desktopColumns}`}>
          <span className={labelClass}>Jersey #</span>
          <span className={labelClass}>Player Name</span>
          <span className={labelClass}>Position(s)</span>
        </div>
        {players.map((player) => (
          <div
            key={player.key}
            className={`grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-2 rounded-md border border-neutral-200 p-3 sm:border-0 sm:p-0 dark:border-neutral-800 ${desktopColumns}`}
          >
            <label className="flex flex-col gap-1">
              <span className={`${labelClass} sm:hidden`}>Jersey #</span>
              <input
                required
                type="number"
                min={0}
                step={1}
                aria-label="Jersey number"
                placeholder="Jersey #"
                autoFocus={player.key !== 0}
                value={player.jersey}
                onChange={(event) => updatePlayer(player.key, { jersey: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={`${labelClass} sm:hidden`}>Player Name</span>
              <input
                required
                aria-label="Player name"
                placeholder="First and last name"
                value={player.name}
                onChange={(event) => updatePlayer(player.key, { name: event.target.value })}
                className={inputClass}
              />
            </label>
            <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className={`${labelClass} sm:hidden`}>Position(s)</span>
              <PositionPicker
                value={player.positions}
                onChange={(positions) => updatePlayer(player.key, { positions })}
              />
            </div>
            <button
              type="button"
              disabled={players.length === 1}
              aria-label={player.name.trim() ? `Remove ${player.name.trim()}` : "Remove player"}
              onClick={() => {
                setJustSaved(false);
                setPlayers((current) => current.filter((other) => other.key !== player.key));
              }}
              className="col-span-2 justify-self-end rounded-md px-2 py-2 text-sm text-neutral-600 hover:underline disabled:opacity-40 sm:col-span-1 dark:text-neutral-400"
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

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || !isSupabaseConfigured} className={primaryButton}>
          {saving ? "Saving…" : existing ? "Save Roster" : "Save Team"}
        </button>
        <p role="status" className="text-sm font-medium text-success">
          {justSaved && (
            <>
              <span aria-hidden="true">✓ </span>Saved. Your dashboard is up to date.
            </>
          )}
        </p>
      </div>
    </form>
  );
}
