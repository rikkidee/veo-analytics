import type { VeoGame, VeoPayload, VeoTeam } from "@/lib/veo";

/**
 * The page's side of the protocol in chrome-extension/bridge.js. Messages stay on
 * this window and origin; the bridge relays them to the extension.
 */

export type GameResult = { ok: true; data: VeoPayload } | { ok: false; error: string };

export type ImportEvent =
  | { type: "IMPORT_PROGRESS"; slug: string; completed: number; total: number }
  | { type: "IMPORT_GAME_RESULT"; slug: string; result: GameResult }
  | { type: "IMPORT_DONE"; cancelled: boolean; error: string | null };

type Failure = { ok: false; error: string };

export type TeamDiscovery =
  | { ok: true; veoOpen: boolean; onClubPage: boolean; teams: VeoTeam[] }
  | Failure;
export type GameDiscovery = { ok: true; games: VeoGame[]; pageUrl: string } | Failure;

/** Where people install the extension. */
export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/veo-analytics-importer/eppgfdgbdljgncemcggbmgpfpffgkbfo";

const PING_TIMEOUT_MS = 1_500;
const DISCOVERY_TIMEOUT_MS = 90_000;

let nextId = 0;

function isFromExtension(event: MessageEvent) {
  return (
    event.source === window &&
    event.origin === window.location.origin &&
    event.data?.source === "veo-analytics-extension"
  );
}

function request<T>(type: string, payload: unknown, timeoutMs: number): Promise<T> {
  const id = `${Date.now()}-${(nextId += 1)}`;
  return new Promise((resolve, reject) => {
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      settle();
    };
    const onMessage = (event: MessageEvent) => {
      if (isFromExtension(event) && event.data.id === id) {
        finish(() => resolve(event.data.response as T));
      }
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("The extension didn't respond."))),
      timeoutMs,
    );
    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "veo-analytics-app", id, type, payload },
      window.location.origin,
    );
  });
}

export const pingExtension = () =>
  request<{ ok: boolean; version?: string }>("PING", undefined, PING_TIMEOUT_MS);

export const discoverTeams = () =>
  request<TeamDiscovery>("DISCOVER_TEAMS", undefined, DISCOVERY_TIMEOUT_MS);

export const discoverGames = (team: VeoTeam) =>
  request<GameDiscovery>("DISCOVER_GAMES", { team }, DISCOVERY_TIMEOUT_MS);

export const startImport = (slugs: string[]) =>
  request<{ ok: boolean; error?: string }>("START_IMPORT", { slugs }, 5_000);

export const cancelImport = () =>
  request<{ ok: boolean }>("CANCEL_IMPORT", undefined, 5_000);

export function subscribeToImportEvents(listener: (event: ImportEvent) => void) {
  const onMessage = (event: MessageEvent) => {
    if (isFromExtension(event) && event.data.event) listener(event.data.event);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
