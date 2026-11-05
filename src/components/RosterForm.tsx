"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

function describeSaveError(cause: unknown) {
  const { code, message } = (cause ?? {}) as { code?: string; message?: string };
  // PGRST205: the table isn't in the API's schema. 42P01: Postgres has no such table.
  if (code === "PGRST205" || code === "42P01") {
    return "The database isn't set up yet, so your team wasn't saved. Run supabase/schema.sql in the Supabase SQL Editor, then click Save Team again. Everything you entered is still here.";
  }
  return message || "Could not save the roster.";
}

const POSITIONS = ["Forward", "Wing", "Midfielder", "Defender", "Goalkeeper"] as const;
type Position = (typeof POSITIONS)[number];

type PlayerDraft = { key: number; name: string; jersey: string; positions: Position[] };

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

export default function RosterForm() {
  const router = useRouter();
  const [team, setTeam] = useState({ name: "", club: "", ageGroup: "" });
  const [players, setPlayers] = useState<PlayerDraft[]>([
    { key: 0, name: "", jersey: "", positions: [] },
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
    setPlayers((current) => [...current, { key: nextKey, name: "", jersey: "", positions: [] }]);
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

      const { error: playersError } = await supabase.from("players").insert(
        players.map((player) => ({
          team_id: savedTeam.id,
          name: player.name.trim(),
          default_jersey: Number(player.jersey),
          position: player.positions.join(", ") || null,
        })),
      );
      if (playersError) {
        // The two inserts aren't a transaction, so don't leave an empty team behind.
        await supabase.from("teams").delete().eq("id", savedTeam.id);
        throw playersError;
      }

      router.push("/onboarding/games");
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
            onChange={(event) => setTeam({ ...team, name: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Club (optional)</span>
          <input
            placeholder="e.g. Riverside SC"
            value={team.club}
            onChange={(event) => setTeam({ ...team, club: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Age group (optional)</span>
          <input
            placeholder="e.g. U14"
            value={team.ageGroup}
            onChange={(event) => setTeam({ ...team, ageGroup: event.target.value })}
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
              onClick={() =>
                setPlayers((current) => current.filter((other) => other.key !== player.key))
              }
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

      <button
        type="submit"
        disabled={saving || !isSupabaseConfigured}
        className="self-start rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Team"}
      </button>
    </form>
  );
}
