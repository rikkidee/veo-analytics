"use client";

import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from "react";
import { describeSaveError, saveGame, type SaveGameInput } from "@/lib/games";
import type { GamePreview } from "@/lib/stats";
import { getSupabase } from "@/lib/supabase/client";
import {
  attributeEvents,
  buildPlayerStats,
  creditsForMatchedEvents,
  detectedJerseys,
  eventVideoUrl,
  goalsForMapping,
  matchVideoUrl,
  minutesByJersey,
  NOISE,
  type RosterPlayer,
  type VeoGame,
  type VeoKeyEvent,
  type VeoPayload,
} from "@/lib/veo";

const selectClass =
  "min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent p-2 text-sm sm:max-w-xs dark:border-neutral-700";
const inputClass =
  "w-full min-w-0 rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700";

// Long enough to pick several jerseys in a row or finish typing without a save for each.
const SAVE_DELAY_MS = 700;

export type MappingPreview = Omit<GamePreview, "saved">;
/** `retry` keeps working after moving on to another game. */
export type SaveState = "idle" | "saving" | "saved" | { error: string; retry: () => void };

type MappingStepProps = {
  teamId: string;
  roster: RosterPlayer[];
  payload: VeoPayload;
  game: VeoGame | null;
  gameId: string;
  position: number;
  total: number;
  /** The decisions saved on this game so far. */
  saved: { choices: Record<number, string>; eventChoices: Record<number, string> };
  /** Each player's saved minutes, by game. */
  seasonMinutes: Record<string, Record<string, number>>;
  /** Shown below the game's details. */
  intro: ReactNode;
  /** Called as soon as anything changes, ahead of it being saved. */
  onPreview: (preview: MappingPreview) => void;
  onSaveState: (state: SaveState) => void;
  /** Called with the version that reached the database. */
  onSaved: (version: string) => void;
};

// Dates are plain calendar days, so UTC keeps them from shifting across time zones.
function formatGameDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

// Veo shows match minutes as 15' or 45+2', which the scraper stores as "15" or "45+2".
const formatEventTime = (time: string) => (time.includes(":") ? time : `${time}'`);

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
  gameId,
  position,
  total,
  saved,
  seasonMinutes,
  intro,
  onPreview,
  onSaveState,
  onSaved,
}: MappingStepProps) {
  const jerseys = detectedJerseys(payload);
  const unreadRows = payload.players.rows.filter((row) => row.jersey === null).length;

  const [label, setLabel] = useState(game?.title || payload.pageTitle || "");
  const [date, setDate] = useState(game?.date ?? "");
  const [opponent, setOpponent] = useState(game?.opponent ?? "");
  const [overrides, setOverrides] = useState<Record<number, string>>(saved.choices);
  const [eventChoices, setEventChoices] = useState<Record<number, string>>(saved.eventChoices);
  // How the game was when opened. The minutes comparison measures from it and rows are
  // ordered by it, so a row doesn't jump while it's being changed.
  const [savedChoices] = useState(saved.choices);

  // Each game mounts fresh, so this brings the next one into view from the arrows.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest("[data-panel-scroll]")?.scrollTo(0, 0);
  }, []);

  const choices = Object.fromEntries(
    jerseys.map((jersey) => [jersey, overrides[jersey] ?? ""]),
  );
  // Unassigned jerseys come first.
  const orderedJerseys = [
    ...jerseys.filter((jersey) => !savedChoices[jersey]),
    ...jerseys.filter((jersey) => savedChoices[jersey]),
  ];
  const veoNames = new Map(payload.players.rows.map((row) => [row.jersey, row.name]));
  const jerseyMinutes = minutesByJersey(payload);
  const undecided = jerseys.filter((jersey) => !choices[jersey]);

  const minutesHere = (playerId: string, from: Record<number, string>) =>
    jerseys.reduce((sum, jersey) => sum + (from[jersey] === playerId ? (jerseyMinutes.get(jersey) ?? 0) : 0), 0);
  const minutesElsewhere = (playerId: string) =>
    Object.entries(seasonMinutes[playerId] ?? {}).reduce(
      (sum, [otherGame, minutes]) => sum + (otherGame === gameId ? 0 : minutes),
      0,
    );
  const playerMinutes = roster
    .map((player) => {
      const elsewhere = minutesElsewhere(player.id);
      return {
        player,
        before: Math.round(elsewhere + minutesHere(player.id, savedChoices)),
        after: Math.round(elsewhere + minutesHere(player.id, choices)),
      };
    })
    .sort((a, b) => a.after - b.after);
  const mostMinutes = Math.max(...playerMinutes.map(({ after }) => after), 1);
  const { matched: matchedEvents, unassigned: events } = attributeEvents(payload, choices, roster);
  const goals = goalsForMapping(payload, choices, roster);
  const assignedByHand = goals.unassigned.filter(({ index }) => eventChoices[index]).length;
  const goalsToAssign = goals.unassigned.length - assignedByHand + goals.waitingOnJersey.length;
  const goalCount = goals.matched.length + goals.unassigned.length + goals.waitingOnJersey.length;

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
          <option value="">Unassigned</option>
          <PlayerOptions roster={roster} />
          <option value={NOISE}>Skip: opponent or not a player</option>
        </select>
      </li>
    );
  }

  function renderGoalMoment(keyEvent: VeoKeyEvent, labelFor?: string) {
    const time = keyEvent.time ? formatEventTime(keyEvent.time) : null;
    const credit = (
      <>
        <span aria-hidden="true">— </span>
        <span className="font-medium">Goal</span>
        {keyEvent.player ? ` by ${keyEvent.player}` : keyEvent.jersey !== null ? ` by jersey #${keyEvent.jersey}` : ""}
      </>
    );
    return (
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="whitespace-nowrap font-mono text-lg font-semibold tabular-nums">
          {time ? (
            <>
              <span aria-hidden="true">⏱ </span>
              {time}
            </>
          ) : (
            "–"
          )}
        </span>
        {labelFor ? (
          <label htmlFor={labelFor} className="text-sm">
            {credit}
          </label>
        ) : (
          <span className="text-sm">{credit}</span>
        )}
        <a
          href={eventVideoUrl(payload.slug, keyEvent.time)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Watch in video: goal${time ? ` at ${time}` : ""}`}
          className="whitespace-nowrap text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Watch in video ↗
        </a>
      </div>
    );
  }

  // Everything saves by itself, and what the dashboard shows changes straight away.
  const eventAssignments: SaveGameInput["eventAssignments"] = [
    ...creditsForMatchedEvents(payload, matchedEvents, choices),
    ...events.flatMap(({ event: keyEvent, index }) =>
      eventChoices[index] ? [{ type: keyEvent.type, playerId: eventChoices[index], eventIndex: index }] : [],
    ),
  ];
  const version = JSON.stringify({ label, date, opponent, choices, eventChoices });
  const canSave = Boolean(label.trim() && date);

  // The last version handed to a save, and the last one that finished.
  const sent = useRef(version);
  const confirmed = useRef(version);
  const previewed = useRef(version);
  const pending = useRef<{ version: string; input: SaveGameInput } | null>(null);

  function persist(next: { version: string; input: SaveGameInput }) {
    sent.current = next.version;
    onSaveState("saving");
    saveGame(getSupabase(), next.input).then(
      () => {
        confirmed.current = next.version;
        if (sent.current === next.version) onSaveState("saved");
        onSaved(next.version);
      },
      (cause) => {
        if (sent.current !== next.version) return; // A newer version is on its way and replaces this.
        sent.current = confirmed.current;
        onSaveState({ error: describeSaveError(cause), retry: () => persist(next) });
      },
    );
  }

  const changed = useEffectEvent(() => {
    if (!canSave) {
      pending.current = null;
      return undefined;
    }
    const next = {
      version,
      input: { teamId, payload, label, date, opponent, roster, choices, eventAssignments },
    };
    pending.current = next;
    if (version === previewed.current) return undefined;
    previewed.current = version;
    onPreview({
      version,
      stats: buildPlayerStats(payload, choices, roster).map(({ player_id, stats }) => ({ player_id, stats })),
      corrections: eventAssignments.map(({ type, playerId }) => ({ player_id: playerId, event_type: type })),
      coverage: {
        matched: jerseys.length - undecided.length,
        unassigned: undecided.length,
        unassignedMinutes: undecided.reduce((sum, jersey) => sum + (jerseyMinutes.get(jersey) ?? 0), 0),
      },
      details: { game_label: label.trim(), game_date: date, opponent: opponent.trim() || null },
    });
    // Changed back to what's already saved, so there's nothing to write.
    if (version === sent.current) {
      if (version === confirmed.current) onSaved(version);
      return undefined;
    }
    const timer = setTimeout(() => persist(next), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  });
  useEffect(() => changed(), [version, canSave]);

  // Moving to another game, or closing the panel, doesn't wait out the delay.
  function flush() {
    if (pending.current && pending.current.version !== sent.current) persist(pending.current);
  }
  const flushOnLeaving = useEffectEvent(flush);
  useEffect(() => () => flushOnLeaving(), []);

  useEffect(() => {
    function warnIfUnsaved(event: BeforeUnloadEvent) {
      if (pending.current && pending.current.version !== confirmed.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => window.removeEventListener("beforeunload", warnIfUnsaved);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    flush();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Game {position} of {total}
          </p>
          <h2 ref={heading} tabIndex={-1} className="mt-1 text-xl font-semibold outline-none">
            {label.trim() || "Untitled game"}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {formatGameDate(date) ?? "Date needed"}
            {opponent.trim() ? ` · vs ${opponent.trim()}` : ""}
          </p>
          {!canSave && (
            <p role="alert" className="mt-2 text-sm text-amber-400">
              Add a name and date and your changes will save.
            </p>
          )}
        </div>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Game details</legend>
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

      {intro}

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
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 className="font-semibold">Jerseys Veo detected</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {jerseys.length - undecided.length} matched · {undecided.length} unassigned
          </p>
        </div>
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
      </section>

      {goalCount > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h3 className="font-semibold">Unassigned goals</h3>
              <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
                {goalCount - goalsToAssign} matched · {goalsToAssign} unassigned
              </p>
            </div>
            {goals.unassigned.length + goals.waitingOnJersey.length > 0 ? (
              <>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Veo sometimes can&apos;t tell who scored. Goals update as you assign jerseys below, so start there, then
                  pick a player for anything left. Leave any that belong to the opponent as unassigned.
                </p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  If a link doesn&apos;t jump to the moment, scrub to the time shown. The video may also include warm-up
                  or halftime, so the moment can be later than the match minute.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm font-medium text-success">
                <span aria-hidden="true">✓ </span>Every goal is matched to a player.
              </p>
            )}
          </div>
          {goals.waitingOnJersey.length + goals.unassigned.length > 0 && (
            <ul className="flex flex-col gap-3">
              {goals.waitingOnJersey.map(({ event: keyEvent, jersey }, position) => (
                <li key={`waiting-${position}`}>
                  {renderGoalMoment(keyEvent)}
                  <label htmlFor={`jersey-${jersey}`} className="block cursor-pointer text-xs text-amber-400">
                    Assign jersey #{jersey} below to credit this goal.
                  </label>
                </li>
              ))}
              {goals.unassigned.map(({ event: keyEvent, index }) => {
                const id = `event-${index}`;
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      {renderGoalMoment(keyEvent, id)}
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">{keyEvent.description}</p>
                    </div>
                    <select
                      id={id}
                      value={eventChoices[index] ?? ""}
                      onChange={(event) =>
                        setEventChoices((current) => ({ ...current, [index]: event.target.value }))
                      }
                      className={`${selectClass} basis-full sm:basis-0`}
                    >
                      <option value="">Leave unassigned</option>
                      <PlayerOptions roster={roster} />
                    </select>
                  </li>
                );
              })}
            </ul>
          )}
          {goals.matched.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {goals.matched.map(({ event: keyEvent, playerId }, position) => {
                const player = roster.find((other) => other.id === playerId);
                return (
                  <li key={`matched-${position}`} className="text-neutral-600 dark:text-neutral-400">
                    <span aria-hidden="true" className="text-success">✓ </span>
                    Goal{keyEvent.time ? ` at ${formatEventTime(keyEvent.time)}` : ""}: #{player?.default_jersey} {player?.name}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Jersey mapping</h3>
        <ul className="flex flex-col gap-2">{orderedJerseys.map(renderJerseyRow)}</ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Season minutes by player</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          A player far below their teammates usually has jerseys still to map. This updates as you assign them.
        </p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {playerMinutes.map(({ player, before, after }) => (
            <li key={player.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3">
              <span className="truncate">
                #{player.default_jersey} {player.name}
              </span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <span
                  className={`block h-full rounded-full ${after > before ? "bg-emerald-700" : "bg-emerald-900"}`}
                  style={{ width: `${(after / mostMinutes) * 100}%` }}
                />
              </span>
              <span className="whitespace-nowrap tabular-nums">
                {after === before ? `${after} min` : (
                  <>
                    {before} min → <strong className="text-success">{after} min</strong>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

    </form>
  );
}
