"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/import/buttons";
import { useImportRun } from "@/components/import/ImportRunner";
import { discoverGames, discoverTeams, pingExtension } from "@/lib/veo-extension";
import { reportUrl, type RosterPlayer, type VeoGame, type VeoTeam } from "@/lib/veo";

type Step = 1 | 2 | 3;
const STEP_NAMES = ["Install extension", "Connect to Veo", "Import your games"];
const STORAGE_KEY = "veo-import-wizard-v3";
const TEAM_POLL_MS = 3_000;

type WizardState = { step: Step; appTeamId: string; veoTeam: VeoTeam | null };

export type AppTeam = { id: string; name: string };

type ImportWizardProps = {
  /** The team on screen, which the games go into. */
  team: AppTeam;
  roster: RosterPlayer[];
  importedUrls: (string | null | undefined)[];
  /** Called when games start coming in, so the panel can get out of the way. */
  onStarted: () => void;
  onClose: () => void;
};

function initialState(teamId: string): WizardState {
  const fresh: WizardState = { step: 1, appTeamId: teamId, veoTeam: null };
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return fresh;
    const restored = JSON.parse(stored) as WizardState;
    if (restored.appTeamId !== teamId) return fresh;
    // Opening this panel shouldn't start reading from Veo until someone asks.
    return { ...restored, step: restored.step === 3 ? 2 : restored.step };
  } catch {
    return fresh;
  }
}

export default function ImportWizard({ team, roster, importedUrls, onStarted, onClose }: ImportWizardProps) {
  const { run } = useImportRun();
  const [state, setState] = useState<WizardState>(() => initialState(team.id));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: this still works, it just can't survive a refresh.
    }
  }, [state]);

  const update = (changes: Partial<WizardState>) => setState((current) => ({ ...current, ...changes }));

  // Someone with the extension already installed has nothing to do on the first step.
  // Only on arrival, so Back can still reach it.
  const arrived = useRef(true);
  const skipInstall = useEffectEvent(() => setState((current) => (current.step === 1 ? { ...current, step: 2 } : current)));
  useEffect(() => {
    if (!arrived.current) return;
    arrived.current = false;
    pingExtension().then(
      (response) => {
        if (response.ok) skipInstall();
      },
      () => {},
    );
  }, []);

  // Came back while an import started earlier is still going.
  if (run?.active && state.step !== 3) {
    return (
      <Working
        title={`Reading ${run.games.length} ${run.games.length === 1 ? "game" : "games"} from Veo…`}
        detail="You can close this panel while they come in."
      />
    );
  }

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
          team={team}
          remembered={state.veoTeam}
          onBack={() => update({ step: 1 })}
          onContinue={(veoTeam) => update({ step: 3, veoTeam })}
        />
      )}

      {state.step === 3 && state.veoTeam && (
        <ImportStep
          veoTeam={state.veoTeam}
          teamId={team.id}
          roster={roster}
          importedUrls={importedUrls}
          onStarted={onStarted}
          onClose={onClose}
          onBack={() => update({ step: 2 })}
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
            <span className="font-medium text-success">
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
  team,
  remembered,
  onBack,
  onContinue,
}: {
  team: AppTeam;
  /** The Veo team used last time in this session, which doesn't need Veo open again. */
  remembered: VeoTeam | null;
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

  const found = discovery.teams.length > 0 ? discovery.teams : remembered ? [remembered] : [];
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
          (found.length > 0
            ? `Found ${found.length} ${found.length === 1 ? "team" : "teams"} on Veo.`
            : !discovery.veoOpen
              ? "Waiting for a Veo tab…"
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

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Games go into <strong className="font-semibold text-neutral-100">{team.name}</strong>, the team on your dashboard.
      </p>

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
          Import my games
        </button>
      </div>
    </section>
  );
}

/**
 * Finds the team's games and imports the new ones with no further questions. The
 * dashboard opens as soon as the first is saved, and the rest keep arriving there.
 */
function ImportStep({
  veoTeam,
  teamId,
  roster,
  importedUrls,
  onStarted,
  onClose,
  onBack,
}: {
  veoTeam: VeoTeam;
  teamId: string;
  roster: RosterPlayer[];
  importedUrls: (string | null | undefined)[];
  onStarted: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const { run, start } = useImportRun();
  const [games, setGames] = useState<VeoGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligible = games?.filter((game) => game.hasReport !== false) ?? [];
  const isSaved = (game: VeoGame) => importedUrls.includes(reportUrl(game.slug));
  const newGames = eligible.filter((game) => !isSaved(game));

  function begin(list: VeoGame[], holdDashboard: boolean) {
    start({ teamId, games: list, roster, holdDashboard });
    onStarted();
  }

  async function load() {
    setError(null);
    setGames(null);
    try {
      const response = await discoverGames(veoTeam);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setGames(response.games);
      if (response.games.length === 0) {
        setError(`No games were found at ${response.pageUrl}. Check that this is the team's recordings page in Veo.`);
        return;
      }
      const fresh = response.games.filter((game) => game.hasReport !== false && !importedUrls.includes(reportUrl(game.slug)));
      if (fresh.length > 0 && !run?.active) begin(fresh, true);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  // Once per visit: a failed read shows its message and waits, rather than
  // reopening the Veo window in a loop.
  const loaded = useRef(false);
  const loadOnArrival = useEffectEvent(() => void load());
  useEffect(() => {
    if (loaded.current) return;
    const timer = setTimeout(() => {
      loaded.current = true;
      loadOnArrival();
    });
    return () => clearTimeout(timer);
  }, []);

  const importing = Boolean(run?.active);

  return (
    <section className="flex flex-col items-start gap-4">
      <h2 className="text-lg font-semibold">Importing your games</h2>

      {!games && !error && (
        <Working title="Finding your games on Veo…" detail="A small Veo window will open and close by itself." />
      )}
      {importing && (
        <Working
          title={`Reading ${run?.games.length} ${run?.games.length === 1 ? "game" : "games"} from Veo…`}
          detail="You can close this panel while they come in."
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {games && !importing && newGames.length === 0 && eligible.length > 0 && (
        <>
          <p className="text-sm">
            <span aria-hidden="true" className="text-success">✓ </span>
            All {eligible.length} {eligible.length === 1 ? "game is" : "games are"} already imported.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryButton} onClick={onClose}>
              Back to Dashboard
            </button>
            <button type="button" className={secondaryButton} onClick={() => begin(eligible, false)}>
              Import all {eligible.length} again
            </button>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Importing again refreshes each game&apos;s stats from Veo and keeps your jersey assignments.
          </p>
        </>
      )}

      {!importing && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={secondaryButton} onClick={onBack}>
            Back
          </button>
          {error && (
            <button type="button" className={primaryButton} onClick={() => void load()}>
              Try again
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Working({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="status" className="flex items-start gap-3 text-sm">
      <span
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-700 motion-reduce:animate-none dark:border-neutral-700 dark:border-t-emerald-400"
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-neutral-600 dark:text-neutral-400">{detail}</span>
      </span>
    </div>
  );
}
