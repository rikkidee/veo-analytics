"use client";

import { useState, type FormEvent } from "react";
import { primaryButton, secondaryButton } from "@/components/import/buttons";
import { describeSaveError, saveGame } from "@/lib/games";
import { getSupabase } from "@/lib/supabase/client";
import {
  detectedJerseys,
  NOISE,
  suggestPlayer,
  unassignedEvents,
  type RosterPlayer,
  type VeoGame,
  type VeoPayload,
} from "@/lib/veo";

const selectClass =
  "min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent p-2 text-sm sm:max-w-xs dark:border-neutral-700";
const inputClass =
  "w-full min-w-0 rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700";

type MappingStepProps = {
  teamId: string;
  roster: RosterPlayer[];
  payload: VeoPayload;
  game: VeoGame | null;
  remaining: number;
  onDone: (outcome: "saved" | "skipped") => void;
};

function PlayerOptions({ roster }: { roster: RosterPlayer[] }) {
  return roster.map((player) => (
    <option key={player.id} value={player.id}>
      #{player.default_jersey} {player.name}
    </option>
  ));
}

export default function MappingStep({
  teamId,
  roster,
  payload,
  game,
  remaining,
  onDone,
}: MappingStepProps) {
  const jerseys = detectedJerseys(payload);
  const events = unassignedEvents(payload);
  const unreadRows = payload.players.rows.filter((row) => row.jersey === null).length;

  const [label, setLabel] = useState(game?.title || payload.pageTitle || "");
  const [date, setDate] = useState(game?.date ?? "");
  const [opponent, setOpponent] = useState(game?.opponent ?? "");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [eventChoices, setEventChoices] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = Object.fromEntries(
    jerseys.map((jersey) => [jersey, overrides[jersey] ?? suggestPlayer(jersey, roster)]),
  );
  const unmatched = jerseys.filter((jersey) => !suggestPlayer(jersey, roster));
  const matched = jerseys.filter((jersey) => suggestPlayer(jersey, roster));
  const undecided = jerseys.filter((jersey) => !choices[jersey]);

  function renderJerseyRow(jersey: number) {
    const id = `jersey-${jersey}`;
    return (
      <li key={jersey} className="flex items-center gap-3">
        <label htmlFor={id} className="w-14 font-mono text-sm">
          #{jersey}
        </label>
        <select
          id={id}
          value={choices[jersey]}
          onChange={(event) =>
            setOverrides((current) => ({ ...current, [jersey]: event.target.value }))
          }
          className={selectClass}
        >
          <option value="">Choose…</option>
          <PlayerOptions roster={roster} />
          <option value={NOISE}>Skip: not a player (noise)</option>
        </select>
      </li>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveGame(getSupabase(), {
        teamId,
        payload,
        label,
        date,
        opponent,
        roster,
        choices,
        eventAssignments: events.flatMap((keyEvent, index) =>
          eventChoices[index] ? [{ type: keyEvent.type, playerId: eventChoices[index] }] : [],
        ),
      });
      onDone("saved");
    } catch (cause) {
      setError(describeSaveError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Map jerseys</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {remaining} {remaining === 1 ? "game" : "games"} left to review. Each game saves when you
          confirm it.
        </p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Game</legend>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Date</span>
          <input
            required
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Opponent (optional)</span>
          <input
            value={opponent}
            onChange={(event) => setOpponent(event.target.value)}
            className={inputClass}
          />
        </label>
      </fieldset>

      {(payload.warnings.length > 0 || unreadRows > 0) && (
        <ul className="list-disc rounded-md border border-amber-300 bg-amber-50 p-3 pl-7 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {payload.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
          {unreadRows > 0 && (
            <li>
              {unreadRows} {unreadRows === 1 ? "row has" : "rows have"} no readable jersey number
              and won&apos;t be saved.
            </li>
          )}
        </ul>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Jerseys with no roster match</h3>
        {unmatched.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Every jersey matched your roster.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unmatched.map(renderJerseyRow)}
          </ul>
        )}
        {matched.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              {matched.length} matched automatically
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {matched.map(renderJerseyRow)}
            </ul>
          </details>
        )}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Assigning two jerseys to one player combines their stats for this game.
        </p>
      </section>

      {events.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="font-semibold">Unassigned goals and shots</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Veo couldn&apos;t tell who these belong to. Leave any that aren&apos;t your
              team&apos;s, or that you can&apos;t identify, as unassigned.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {events.map((keyEvent, index) => {
              const id = `event-${index}`;
              return (
                <li key={id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                    <span className="font-medium capitalize">{keyEvent.type}</span>
                    {keyEvent.time ? ` at ${keyEvent.time}` : ""}
                    <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                      {keyEvent.description}
                    </span>
                  </label>
                  <select
                    id={id}
                    value={eventChoices[index] ?? ""}
                    onChange={(event) =>
                      setEventChoices((current) => ({ ...current, [index]: event.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="">Leave unassigned</option>
                    <PlayerOptions roster={roster} />
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {undecided.length > 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          To save, choose a player or skip for: {undecided.map((jersey) => `#${jersey}`).join(", ")}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className={primaryButton}
          disabled={saving || undecided.length > 0}
        >
          {saving ? "Saving…" : "Save Game"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={saving}
          onClick={() => onDone("skipped")}
        >
          Skip this game
        </button>
      </div>
    </form>
  );
}
