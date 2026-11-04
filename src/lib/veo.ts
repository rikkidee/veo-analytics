export type CellValue = string | number | null;

export type VeoPlayerRow = {
  jersey: number | null;
  cells: Record<string, CellValue>;
};

export type VeoPayload = {
  schemaVersion: 1;
  source: "veo";
  veoUrl: string;
  scrapedAt: string;
  pageTitle: string;
  columnCount: string | null;
  teamStats: Record<string, { text: string; values: number[] }>;
  players: { headers: string[]; rows: VeoPlayerRow[] };
  warnings: string[];
};

const IMPORT_PREFIX = "#import=";

export function parseVeoPayload(value: unknown): VeoPayload {
  const payload = value as Partial<VeoPayload> | null;
  if (
    payload?.source !== "veo" ||
    payload.schemaVersion !== 1 ||
    !Array.isArray(payload.players?.headers) ||
    !Array.isArray(payload.players?.rows) ||
    typeof payload.teamStats !== "object"
  ) {
    throw new Error("This is not data from the Veo Analytics extension.");
  }
  return payload as VeoPayload;
}

/**
 * Decodes the URL fragment set by the extension's "Send to Veo Analytics"
 * button. Returns null when the fragment holds no import.
 * chrome-extension/popup.js holds the matching encoder.
 */
export function decodeImportFragment(fragment: string): VeoPayload | null {
  if (!fragment.startsWith(IMPORT_PREFIX)) return null;
  const encoded = fragment.slice(IMPORT_PREFIX.length);
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return parseVeoPayload(JSON.parse(new TextDecoder().decode(bytes)));
}

export function detectedJerseys(payload: VeoPayload): number[] {
  const jerseys = payload.players.rows
    .map((row) => row.jersey)
    .filter((jersey): jersey is number => jersey !== null);
  return [...new Set(jerseys)].sort((a, b) => a - b);
}
