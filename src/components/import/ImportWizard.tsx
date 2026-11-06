"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/import/buttons";
import { useImportRun } from "@/components/import/ImportRunner";
import { discoverGames, discoverTeams, pingExtension } from "@/lib/veo-extension";
import { reportUrl, type RosterPlayer, type VeoGame, type VeoTeam } from "@/lib/veo";

type Step = 1 | 2 | 3;
const STEP_NAMES = ["Install extension", "Connect to Veo", "Import your games"];
const STORAGE_KEY = "veo-import-wizard-v2";
const TEAM_POLL_MS = 3_000;

type WizardState = { step: Step; appTeamId: string; veoTeam: VeoTeam | null };

export type AppTeam = { id: string; name: string };
export type ImportedGame = { team_id: string; veo_url: string | null };

type ImportWizardProps = {
  teams: AppTeam[];
  roster: RosterPlayer[];
  importedGames: ImportedGame[];
};

function initialState(teams: AppTeam[]): WizardState {
  const fresh: WizardState = { step: 1, appTeamId: teams[0]?.id ?? "", veoTeam: null };
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
  const [state, setState] = useState<WizardState>(() => initialState(teams));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the wizard still works, it just can't survive a refresh.
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
          onAppTeamChange={(appTeamId) => update({ appTeamId })}
          onBack={() => update({ step: 1 })}
          onContinue={(veoTeam) => update({ step: 3, veoTeam })}
        />
      )}

      {state.step === 3 && state.veoTeam && (
        <ImportStep
          veoTeam={state.veoTeam}
          teamId={state.appTeamId}
          roster={roster.filter((player) => player.team_id === state.appTeamId)}
          importedUrls={importedGames.filter((game) => game.team_id === state.appTeamId).map((game) => game.veo_url)}
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
  onBack,
}: {
  veoTeam: VeoTeam;
  teamId: string;
  roster: RosterPlayer[];
  importedUrls: (string | null)[];
  onBack: () => void;
}) {
  const router = useRouter();
  const { run, start } = useImportRun();
  const [games, setGames] = useState<VeoGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedHere, setStartedHere] = useState(false);

  const eligible = games?.filter((game) => game.hasReport !== false) ?? [];
  const isSaved = (game: VeoGame) => importedUrls.includes(reportUrl(game.slug));
  const newGames = eligible.filter((game) => !isSaved(game));

  function begin(list: VeoGame[]) {
    setStartedHere(true);
    start({ teamId, games: list, roster });
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
      if (fresh.length > 0 && !run?.active) begin(fresh);
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

  const firstGameSaved = startedHere && (run?.saved ?? 0) > 0;
  useEffect(() => {
    if (firstGameSaved) router.push("/dashboard");
  }, [firstGameSaved, router]);

  const importing = Boolean(run?.active);
  const finishedWithNothing = startedHere && run && !run.active && run.saved === 0;

  return (
    <section className="flex flex-col items-start gap-4">
      <h2 className="text-lg font-semibold">Importing your games</h2>

      {!games && !error && (
        <Working title="Finding your games on Veo…" detail="A small Veo window will open and close by itself." />
      )}
      {importing && (
        <Working
          title={`Reading ${run?.games.length} ${run?.games.length === 1 ? "game" : "games"} from Veo…`}
          detail="Your dashboard opens as soon as the first one is in, usually within a minute. The rest keep coming while you look around."
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {finishedWithNothing && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          No games could be imported. The details are in the message at the bottom of the page.
        </p>
      )}

      {games && !importing && !finishedWithNothing && newGames.length === 0 && eligible.length > 0 && (
        <>
          <p className="text-sm">
            <span aria-hidden="true" className="text-success">✓ </span>
            All {eligible.length} {eligible.length === 1 ? "game is" : "games are"} already imported.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className={primaryButton}>
              Go to Dashboard
            </Link>
            <button type="button" className={secondaryButton} onClick={() => begin(eligible)}>
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
          {(error || finishedWithNothing) && (
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
