"use client";

import { useState } from "react";

export type RosterPlayer = {
  id: string;
  name: string;
  default_jersey: number;
};

const NOISE = "noise";

type JerseyMapperProps = {
  jerseys: number[];
  roster: RosterPlayer[];
};

export default function JerseyMapper({ jerseys, roster }: JerseyMapperProps) {
  const [choices, setChoices] = useState<Record<number, string>>({});

  // Suggest a player only when the jersey points to exactly one person.
  function suggestion(jersey: number) {
    const matches = roster.filter((player) => player.default_jersey === jersey);
    return matches.length === 1 ? matches[0].id : "";
  }

  if (jerseys.length === 0) {
    return <p className="text-sm text-neutral-500">No jersey numbers detected.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {roster.length === 0 && (
        <p className="text-sm text-neutral-500">
          No roster loaded. Sign in and add players to assign these jerseys.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {jerseys.map((jersey) => (
          <li key={jersey} className="flex items-center gap-3">
            <label htmlFor={`jersey-${jersey}`} className="w-14 font-mono text-sm">
              #{jersey}
            </label>
            <select
              id={`jersey-${jersey}`}
              value={choices[jersey] ?? suggestion(jersey)}
              onChange={(event) =>
                setChoices((current) => ({ ...current, [jersey]: event.target.value }))
              }
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent p-2 text-sm sm:max-w-xs dark:border-neutral-700"
            >
              <option value="">Unassigned</option>
              {roster.map((player) => (
                <option key={player.id} value={player.id}>
                  #{player.default_jersey} {player.name}
                </option>
              ))}
              <option value={NOISE}>Not a player (noise)</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
