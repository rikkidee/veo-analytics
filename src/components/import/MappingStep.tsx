"use client";

import { useState, type FormEvent } from "react";
import { primaryButton, secondaryButton } from "@/components/import/buttons";
import { describeSaveError, saveGame } from "@/lib/games";
import { getSupabase } from "@/lib/supabase/client";
import {
  attributeEvents,
  creditsForMatchedEvents,
  detectedJerseys,
  matchVideoUrl,
  minutesByJersey,
  NOISE,
  suggestPlayer,
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
  // Jerseys needing a decision come first. Sorted by the suggestion rather than the
  // current choice, so a row doesn't jump while it's being changed.
  const orderedJerseys = [
    ...jerseys.filter((jersey) => !suggestPlayer(jersey, roster)),
    ...jerseys.filter((jersey) => suggestPlayer(jersey, roster)),
  ];
  const veoNames = new Map(payload.players.rows.map((row) => [row.jersey, row.name]));
  const jerseyMinutes = minutesByJersey(payload);
  const undecided = jerseys.filter((jersey) => !choices[jersey]);
  const { matched: matchedEvents, unassigned: events } = attributeEvents(payload, choices, roster);

  function renderJerseyRow(jersey: number) {
    const id = `jersey-${jersey}`;
    const minutes = jerseyMinutes.get(jersey);
    return (
      <li key={jersey} className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
        <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm sm:w-40 sm:flex-none">
          <span className="font-mono">#{jersey}</span>
          {veoNames.get(jersey) && (
            <span className="text-neutral-600 dark:text-neutral-400"> {veoNames.get(jersey)}</span>
          )}
        </label>
        <span className="w-14 shrink-0 text-right text-sm tabular-nums text-neutral-600 dark:text-neutral-400">
          {minutes !== undefined && `${Math.round(minutes)} min`}
        </span>
        <select
          id={id}
          value={choices[jersey]}
          onChange={(event) =>
            setOverrides((current) => ({ ...current, [jersey]: event.target.value }))
          }
          className={`${selectClass} basis-full sm:basis-0`}
        >
          <option value="">Choose…</option>
          <PlayerOptions roster={roster} />
          <option value={NOISE}>Skip: opponent or not a player</option>
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
        eventAssignments: [
          ...creditsForMatchedEvents(payload, matchedEvents, choices),
          ...events.flatMap(({ event: keyEvent, index }) =>
            eventChoices[index] ? [{ type: keyEvent.type, playerId: eventChoices[index] }] : [],
          ),
        ],
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
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          This is a one-time setup for each game. It takes about 3–5 minutes, and once it&apos;s
          done it&apos;s saved, so you won&apos;t need to map this game again.
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
        <h3 className="font-semibold">Jerseys Veo detected</h3>
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-neutral-600 dark:text-neutral-400">
            Veo often misreads jersey numbers, so unmatched jerseys are likely your own players
            under the wrong number. Assign every jersey that belongs to a player and their stats
            combine for this game.
          </p>
          <details className="text-neutral-600 dark:text-neutral-400">
            <summary className="w-fit cursor-pointer font-medium">Learn more</summary>
            <p className="mt-2">
              Veo identifies players by reading jersey numbers from the video using OCR. Hair
              covering jerseys, camera angles, similar-looking digits (like 7 and 1) and players
              turning away from the camera can all cause errors. To figure out who a jersey is,
              look for that number in the match video, then assign it to the correct player. Its
              minutes can help too: 40 minutes suggests a starter, 5 minutes maybe a sub.
            </p>
          </details>
          <a
            href={matchVideoUrl(payload.slug)}
            target="_blank"
            rel="noreferrer"
            className="w-fit font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Watch the match video to identify players →
          </a>
          <p className="text-neutral-600 dark:text-neutral-400">
            <strong className="font-semibold text-neutral-900 dark:text-neutral-100">Tip:</strong>{" "}
            In the Veo match report, click any jersey number in the player stats table to see their
            highlighted clips in the video. You&apos;ll quickly recognize who that player is.
          </p>
        </div>
        <ul className="flex flex-col gap-2">{orderedJerseys.map(renderJerseyRow)}</ul>
      </section>

      {matchedEvents.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {matchedEvents.length} {matchedEvents.length === 1 ? "goal or shot" : "goals and shots"}{" "}
            matched by name
          </summary>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Anything Veo&apos;s player table already counts won&apos;t be counted twice.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {matchedEvents.map(({ event: keyEvent, playerId }, position) => {
              const player = roster.find((other) => other.id === playerId);
              return (
                <li key={position}>
                  <span className="capitalize">{keyEvent.type}</span>
                  {keyEvent.time ? ` at ${keyEvent.time}` : ""}: #{player?.default_jersey}{" "}
                  {player?.name}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {events.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="font-semibold">Unassigned goals and shots</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              These couldn&apos;t be matched to a player on your roster. Leave any that aren&apos;t
              your team&apos;s, or that you can&apos;t identify, as unassigned.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {events.map(({ event: keyEvent, index }) => {
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
