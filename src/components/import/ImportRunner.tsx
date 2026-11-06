"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { PanelLink } from "@/components/panels/links";
import { autoSaveGame, describeSaveError } from "@/lib/games";
import { getSupabase } from "@/lib/supabase/client";
import type { RosterPlayer, VeoGame } from "@/lib/veo";
import { cancelImport, startImport, subscribeToImportEvents, type GameResult } from "@/lib/veo-extension";

const STORAGE_KEY = "veo-import-run-v1";
// Longer than the extension allows for one report, so this only fires if it died.
const STALL_TIMEOUT_MS = 150_000;

type Failure = { title: string; error: string };

export type ImportRun = {
  teamId: string;
  games: VeoGame[];
  roster: RosterPlayer[];
  /** The dashboard shows progress instead of stats until this import is over. */
  holdDashboard: boolean;
  saved: number;
  failures: Failure[];
  active: boolean;
  stopping: boolean;
  /** A problem with the import as a whole, rather than one game. */
  error: string | null;
};

type ImportRunContext = {
  run: ImportRun | null;
  /** True until an import has ended and the page is showing its results. */
  busy: boolean;
  start: (input: { teamId: string; games: VeoGame[]; roster: RosterPlayer[]; holdDashboard: boolean }) => void;
  stop: () => void;
};

const Context = createContext<ImportRunContext>({ run: null, busy: false, start: () => {}, stop: () => {} });

export const useImportRun = () => use(Context);

/**
 * Runs imports from the root layout, so they keep going while the user moves around
 * the app. The extension reads each game and this saves it as soon as it arrives.
 */
export default function ImportRunner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isRefreshing, startRefresh] = useTransition();
  const [run, setRun] = useState<ImportRun | null>(null);
  const runRef = useRef<ImportRun | null>(null);
  const saves = useRef<Promise<void>>(Promise.resolve());
  const lastActivity = useRef(0);

  const update = useCallback((change: (current: ImportRun) => ImportRun) => {
    if (!runRef.current) return;
    runRef.current = change(runRef.current);
    setRun(runRef.current);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(runRef.current));
    } catch {
      // Storage full or blocked: the import still works, it just can't survive a refresh.
    }
  }, []);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const finish = useCallback(
    (error: string | null) => {
      // Waits for saves still running, so "done" means everything is in.
      saves.current = saves.current.then(() => {
        update((current) => ({ ...current, active: false, stopping: false, error: error ?? current.error }));
        refresh();
      });
    },
    [refresh, update],
  );

  async function saveResult(slug: string, result: GameResult) {
    const current = runRef.current;
    if (!current) return;
    const game = current.games.find((other) => other.slug === slug) ?? null;
    const title = game?.title || "A game";
    if (!result.ok) {
      update((now) => ({ ...now, failures: [...now.failures, { title, error: result.error }] }));
      return;
    }
    try {
      await autoSaveGame(getSupabase(), {
        teamId: current.teamId,
        payload: result.data,
        game,
        roster: current.roster,
      });
      update((now) => ({ ...now, saved: now.saved + 1 }));
      refresh();
    } catch (cause) {
      update((now) => ({ ...now, failures: [...now.failures, { title, error: describeSaveError(cause) }] }));
    }
  }

  const onEvent = useEffectEvent((event: Parameters<Parameters<typeof subscribeToImportEvents>[0]>[0]) => {
    if (!runRef.current?.active) return;
    lastActivity.current = Date.now();
    if (event.type === "IMPORT_GAME_RESULT") {
      saves.current = saves.current.then(() => saveResult(event.slug, event.result));
    } else if (event.type === "IMPORT_DONE") {
      finish(event.error);
    }
  });

  useEffect(() => subscribeToImportEvents(onEvent), []);

  // Picks up after a page refresh. The extension keeps going through one, so any
  // game finished in between is simply offered again on the next import.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        const restored = stored ? (JSON.parse(stored) as ImportRun) : null;
        if (restored?.active && !runRef.current) {
          runRef.current = restored;
          lastActivity.current = Date.now();
          setRun(restored);
        }
      } catch {
        // Nothing usable was stored.
      }
    });
    return () => clearTimeout(timer);
  }, []);

  const active = Boolean(run?.active);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current < STALL_TIMEOUT_MS) return;
      void cancelImport().catch(() => {});
      finish("The import stopped responding. Games already saved are safe. Import again to pick up the rest.");
    }, 5_000);
    return () => clearInterval(timer);
  }, [active, finish]);

  const start = useCallback<ImportRunContext["start"]>(
    ({ teamId, games, roster, holdDashboard }) => {
      if (runRef.current?.active) return;
      saves.current = Promise.resolve();
      lastActivity.current = Date.now();
      runRef.current = { teamId, games, roster, holdDashboard, saved: 0, failures: [], active: true, stopping: false, error: null };
      update((current) => current);
      startImport(games.map((game) => game.slug)).then(
        (response) => {
          if (!response.ok) finish(response.error ?? "The import could not start.");
        },
        (cause: Error) => finish(cause.message),
      );
    },
    [finish, update],
  );

  const stop = useCallback(() => {
    update((current) => ({ ...current, stopping: true }));
    void cancelImport().catch(() => {});
  }, [update]);

  function dismiss() {
    runRef.current = null;
    setRun(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up.
    }
  }

  const value = useMemo(
    () => ({ run, busy: active || isRefreshing, start, stop }),
    [run, active, isRefreshing, start, stop],
  );
  const total = run?.games.length ?? 0;
  const handled = (run?.saved ?? 0) + (run?.failures.length ?? 0);

  return (
    <Context value={value}>
      {children}
      {run && !(run.active && run.holdDashboard && pathname === "/dashboard") && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 xl:right-6 xl:left-auto xl:translate-x-0 flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm shadow-lg"
        >
          {run.active ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {run.stopping ? "Stopping after this game…" : "Importing your games from Veo…"} {run.saved} of {total} saved
                </p>
                {!run.stopping && (
                  <button
                    type="button"
                    className="shrink-0 text-neutral-400 hover:underline"
                    onClick={stop}
                  >
                    Stop
                  </button>
                )}
              </div>
              <div
                role="progressbar"
                aria-label="Import progress"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={handled}
                className="h-1.5 overflow-hidden rounded-full bg-neutral-800"
              >
                <div className="h-full rounded-full bg-emerald-700 transition-[width]" style={{ width: `${total ? (handled / total) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-neutral-400">
                You can use the app while this runs. Keep this tab open, and the small Veo window too.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {run.saved > 0 && <span aria-hidden="true" className="text-success">✓ </span>}
                  {run.saved} of {total} {total === 1 ? "game" : "games"} imported
                </p>
                <button type="button" className="shrink-0 text-neutral-400 hover:underline" onClick={dismiss}>
                  Dismiss
                </button>
              </div>
              {run.error && <p className="text-red-400">{run.error}</p>}
              {run.failures.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-neutral-400">
                  {run.failures.map(({ title, error }) => (
                    <li key={title}>
                      {title}: {error}
                    </li>
                  ))}
                </ul>
              )}
              {run.saved < total && (
                <PanelLink panel="import" className="w-fit font-medium text-emerald-400 hover:underline" onClick={dismiss}>
                  Try the rest again →
                </PanelLink>
              )}
            </>
          )}
        </div>
      )}
    </Context>
  );
}
