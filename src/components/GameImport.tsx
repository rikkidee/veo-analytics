"use client";

import { useEffect, useState } from "react";
import JerseyMapper, { type RosterPlayer } from "@/components/JerseyMapper";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  decodeImportFragment,
  detectedJerseys,
  parseVeoPayload,
  type VeoPayload,
} from "@/lib/veo";

type ImportState = { payload: VeoPayload | null; error: string | null };

function readFragment(): ImportState {
  try {
    return { payload: decodeImportFragment(window.location.hash), error: null };
  } catch {
    return {
      payload: null,
      error: "That import link is damaged. Scrape the game again, or paste the JSON below.",
    };
  }
}

export default function GameImport() {
  const [{ payload, error }, setImport] = useState<ImportState>(readFragment);
  const [pasted, setPasted] = useState("");
  const [roster, setRoster] = useState<RosterPlayer[]>([]);

  useEffect(() => {
    if (window.location.hash) {
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", pathname + search);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSupabase()
      .from("players")
      .select("id, name, default_jersey")
      .order("default_jersey")
      .then(({ data }) => setRoster(data ?? []));
  }, []);

  function importPasted() {
    try {
      setImport({ payload: parseVeoPayload(JSON.parse(pasted)), error: null });
    } catch (cause) {
      setImport({
        payload: null,
        error:
          cause instanceof SyntaxError
            ? "That is not valid JSON."
            : (cause as Error).message,
      });
    }
  }

  if (!payload) {
    return (
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <label htmlFor="pasted-json" className="text-sm font-medium">
          Or paste JSON copied from the extension
        </label>
        <textarea
          id="pasted-json"
          rows={8}
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-transparent p-3 font-mono text-xs dark:border-neutral-700"
        />
        <button
          type="button"
          onClick={importPasted}
          disabled={!pasted.trim()}
          className="self-start rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Import
        </button>
      </div>
    );
  }

  const unreadJerseys = payload.players.rows.filter((row) => row.jersey === null).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="font-semibold">{payload.pageTitle || "Scraped game"}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {payload.players.rows.length} players, {payload.players.headers.length} columns,{" "}
          {Object.keys(payload.teamStats).length} team stats
        </p>
        {payload.warnings.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">
            {payload.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Map jerseys</h2>
        {unreadJerseys > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {unreadJerseys} row(s) had no readable jersey number and are not listed.
          </p>
        )}
        <JerseyMapper jerseys={detectedJerseys(payload)} roster={roster} />
      </section>
    </div>
  );
}
