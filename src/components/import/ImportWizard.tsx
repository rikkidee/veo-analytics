"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/import/buttons";
import GamesStep from "@/components/import/GamesStep";
import MappingStep from "@/components/import/MappingStep";
import {
  discoverGames,
  discoverTeams,
  pingExtension,
  type GameResult,
} from "@/lib/veo-extension";
import { reportUrl, type RosterPlayer, type VeoGame, type VeoTeam } from "@/lib/veo";

type Step = 1 | 2 | 3 | 4 | 5;
const STEP_NAMES = ["Install extension", "Connect to Veo", "Import games", "Map jerseys", "Complete"];
const STORAGE_KEY = "veo-import-wizard-v1";
const TEAM_POLL_MS = 3_000;

type Outcome = "saved" | "skipped";

type WizardState = {
  step: Step;
  appTeamId: string;
  veoTeam: VeoTeam | null;
  games: VeoGame[];
  selected: string[];
  results: Record<string, GameResult>;
  outcomes: Record<string, Outcome>;
};

export type AppTeam = { id: string; name: string };
export type ImportedGame = { team_id: string; veo_url: string | null };

type ImportWizardProps = {
  teams: AppTeam[];
  roster: RosterPlayer[];
  importedGames: ImportedGame[];
};

function initialState(teams: AppTeam[]): WizardState {
  const fresh: WizardState = {
    step: 1,
    appTeamId: teams[0]?.id ?? "",
    veoTeam: null,
    games: [],
    selected: [],
    results: {},
    outcomes: {},
  };
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return fresh;
    const restored = JSON.parse(stored) as WizardState;
    return teams.some((team) => team.id === restored.appTeamId) ? restored : fresh;
  } catch {
    return fresh;
  }
}

export default function ImportWizard({ teams, roster, importedGames }: ImportWizardProps) {
  const router = useRouter();
  // Kept for this browser tab, so a refresh during jersey mapping doesn't lose
  // games that took minutes to read.
  const [state, setState] = useState<WizardState>(() => initialState(teams));
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the wizard still works, it just can't survive a refresh.
    }
  }, [state]);

  const update = (changes: Partial<WizardState>) =>
    setState((current) => ({ ...current, ...changes }));

  const teamRoster = roster.filter((player) => player.team_id === state.appTeamId);
  const importedUrls = new Set(
    importedGames
      .filter((game) => game.team_id === state.appTeamId)
      .map((game) => game.veo_url),
  );
  const isImported = (slug: string) =>
    importedUrls.has(reportUrl(slug)) || state.outcomes[slug] === "saved";

  const mappingQueue = Object.entries(state.results)
    .filter(([slug, result]) => result.ok && !state.outcomes[slug])
    .map(([slug]) => slug);

  async function loadGames(team: VeoTeam) {
    setGamesLoading(true);
    setGamesError(null);
    try {
      const response = await discoverGames(team);
      if (!response.ok) {
        setGamesError(response.error);
        return;
      }
      setState((current) => ({
        ...current,
        games: response.games,
        selected: response.games
          .filter((game) => game.hasReport !== false && !isImported(game.slug))
          .map((game) => game.slug),
      }));
      if (response.games.length === 0) {
        setGamesError(
          `No games were found at ${response.pageUrl}. Check that this is the team's recordings page in Veo, then try again.`,
        );
      }
    } catch (cause) {
      setGamesError((cause as Error).message);
    } finally {
      setGamesLoading(false);
    }
  }

  function recordOutcome(slug: string, outcome: Outcome) {
    setState((current) => {
      const outcomes = { ...current.outcomes, [slug]: outcome };
      const remaining = Object.entries(current.results).some(
        ([other, result]) => result.ok && !outcomes[other],
      );
      return { ...current, outcomes, step: remaining ? current.step : 5 };
    });
    if (outcome === "saved") router.refresh();
  }

  function recordResult(slug: string, result: GameResult) {
    setState((current) => {
      const outcomes = { ...current.outcomes };
      delete outcomes[slug]; // A fresh read has to be reviewed again.
      return {
        ...current,
        results: { ...current.results, [slug]: result },
        outcomes,
        // Failed games stay ticked, ready to try again.
        selected: result.ok
          ? current.selected.filter((other) => other !== slug)
          : current.selected,
      };
    });
  }

  const currentSlug = mappingQueue[0];
  const currentResult = currentSlug ? state.results[currentSlug] : null;

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {STEP_NAMES.map((name, index) => {
          const number = index + 1;
          const isCurrent = number === state.step;
          return (
            <li
              key={name}
              aria-current={isCurrent ? "step" : undefined}
              className={
                isCurrent
                  ? "font-semibold text-emerald-700 dark:text-emerald-400"
                  : "text-neutral-500 dark:text-neutral-400"
              }
            >
              {number < state.step ? "✓" : `${number}.`} {name}
            </li>
          );
        })}
      </ol>

      {state.step === 1 && <InstallStep onContinue={() => update({ step: 2 })} />}

      {state.step === 2 && (
        <ConnectStep
          teams={teams}
          appTeamId={state.appTeamId}
          onAppTeamChange={(appTeamId) => update({ appTeamId, games: [], selected: [] })}
          onBack={() => update({ step: 1 })}
          onContinue={(veoTeam) => {
            update({ step: 3, veoTeam, games: [], selected: [] });
            void loadGames(veoTeam);
          }}
        />
      )}

      {state.step === 3 && (
        <GamesStep
          games={state.games}
          selected={state.selected}
          results={state.results}
          isImported={isImported}
          loading={gamesLoading}
          loadError={gamesError}
          onReload={() => state.veoTeam && void loadGames(state.veoTeam)}
          onSelectedChange={(selected) => update({ selected })}
          onResult={recordResult}
          pendingMappings={mappingQueue.length}
          onBack={() => update({ step: 2 })}
          onContinue={() => update({ step: 4 })}
        />
      )}

      {state.step === 4 && currentSlug && currentResult?.ok && (
        <MappingStep
          key={currentSlug}
          teamId={state.appTeamId}
          roster={teamRoster}
          payload={currentResult.data}
          game={state.games.find((game) => game.slug === currentSlug) ?? null}
          remaining={mappingQueue.length}
          onDone={(outcome) => recordOutcome(currentSlug, outcome)}
        />
      )}
      {state.step === 4 && !currentSlug && (
        <div className="flex flex-col items-start gap-3">
          <p>There are no games waiting for jersey mapping.</p>
          <button type="button" className={secondaryButton} onClick={() => update({ step: 3 })}>
            Back to games
          </button>
        </div>
      )}

      {state.step === 5 && (
        <CompleteStep
          state={state}
          onImportMore={() =>
            setState((current) => ({
              ...current,
              step: 3,
              results: {},
              outcomes: {},
              selected: current.games
                .filter((game) => game.hasReport !== false && !isImported(game.slug))
                .map((game) => game.slug),
            }))
          }
        />
      )}
    </div>
  );
}

function InstallStep({ onContinue }: { onContinue: () => void }) {
  const [status, setStatus] = useState<"idle" | "checking" | "connected" | "missing">("idle");
  const [version, setVersion] = useState<string | undefined>();

  async function check() {
    setStatus("checking");
    try {
      const response = await pingExtension();
      setVersion(response.version);
      setStatus(response.ok ? "connected" : "missing");
    } catch {
      setStatus("missing");
    }
  }

  return (
    <section className="flex flex-col items-start gap-4">
      <h2 className="text-lg font-semibold">Install the Chrome extension</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Open <code className="font-mono">chrome://extensions</code> in Chrome.
        </li>
        <li>Turn on Developer mode, in the top right corner.</li>
        <li>Click Load unpacked.</li>
        <li>
          Choose the <code className="font-mono">chrome-extension</code> folder from this project.
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={secondaryButton}
          disabled={status === "checking"}
          onClick={check}
        >
          {status === "checking" ? "Checking…" : "Check Connection"}
        </button>
        <p role="status" className="text-sm">
          {status === "connected" && (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              <span aria-hidden="true">✓ </span>Extension connected
              {version ? ` (version ${version})` : ""}
            </span>
          )}
          {status === "missing" && (
            <span className="text-red-700 dark:text-red-400">
              Extension not detected. Check that it&apos;s turned on, then refresh this page and
              try again.
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        className={primaryButton}
        disabled={status !== "connected"}
        onClick={onContinue}
      >
        Continue
      </button>
    </section>
  );
}

function ConnectStep({
  teams,
  appTeamId,
  onAppTeamChange,
  onBack,
  onContinue,
}: {
  teams: AppTeam[];
  appTeamId: string;
  onAppTeamChange: (teamId: string) => void;
  onBack: () => void;
  onContinue: (team: VeoTeam) => void;
}) {
  const [discovery, setDiscovery] = useState({
    veoOpen: false,
    onClubPage: false,
    teams: [] as VeoTeam[],
  });
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await discoverTeams();
        if (!active) return;
        if (response.ok) {
          setDiscovery(response);
          setError(null);
        } else {
          setError(response.error);
        }
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    }
    void poll();
    const timer = setInterval(poll, TEAM_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const found = discovery.teams;
  const picked =
    found.find((team) => team.id === pickedId) ?? (found.length === 1 ? found[0] : null);

  return (
    <section className="flex flex-col items-start gap-4">
      <h2 className="text-lg font-semibold">Connect to Veo</h2>
      <p className="text-sm">
        Open{" "}
        <a
          href="https://app.veo.co"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-emerald-700 underline dark:text-emerald-400"
        >
          app.veo.co
        </a>{" "}
        in another tab, sign in, and go to your club page. This page updates by itself.
      </p>

      <div
        role="note"
        className="w-full rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        Match Reports must be enabled on your Veo account. Games without a match report can&apos;t
        be imported.
      </div>

      <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
        {error ??
          (!discovery.veoOpen
            ? "Waiting for a Veo tab…"
            : found.length > 0
              ? `Found ${found.length} ${found.length === 1 ? "team" : "teams"} on Veo.`
              : discovery.onClubPage
                ? "Reading your teams from Veo…"
                : "Veo is open. Go to your club page so your teams can be read.")}
      </p>

      {found.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Which Veo team?</legend>
          {found.map((team) => (
            <label key={team.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="veo-team"
                checked={picked?.id === team.id}
                onChange={() => setPickedId(team.id)}
                className="accent-emerald-700"
              />
              {team.name}
            </label>
          ))}
        </fieldset>
      )}
      {found.length === 1 && (
        <p className="text-sm font-medium">
          <span aria-hidden="true">✓ </span>
          {found[0].name}
        </p>
      )}

      {teams.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Import into which roster?</span>
          <select
            value={appTeamId}
            onChange={(event) => onAppTeamChange(event.target.value)}
            className="rounded-md border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-3">
        <button type="button" className={secondaryButton} onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className={primaryButton}
          disabled={!picked}
          onClick={() => picked && onContinue(picked)}
        >
          Continue
        </button>
      </div>
    </section>
  );
}

function CompleteStep({
  state,
  onImportMore,
}: {
  state: WizardState;
  onImportMore: () => void;
}) {
  const outcomes = Object.values(state.outcomes);
  const saved = outcomes.filter((outcome) => outcome === "saved").length;
  const skipped = outcomes.length - saved;
  const failed = Object.values(state.results).filter((result) => !result.ok).length;

  return (
    <section className="flex flex-col items-start gap-4">
      <h2 className="text-lg font-semibold">Import complete</h2>
      <ul className="text-sm">
        <li>
          {saved} {saved === 1 ? "game" : "games"} saved
        </li>
        {skipped > 0 && <li>{skipped} skipped</li>}
        {failed > 0 && <li>{failed} could not be read from Veo</li>}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={primaryButton}>
          View Dashboard
        </Link>
        <button type="button" className={secondaryButton} onClick={onImportMore}>
          Import more games
        </button>
      </div>
    </section>
  );
}
