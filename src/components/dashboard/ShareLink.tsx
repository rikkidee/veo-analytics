"use client";

import { useRef, useState } from "react";
import type { DashboardTeam } from "@/lib/stats";
import { getSupabase } from "@/lib/supabase/client";

/** 32 random bytes, base64url encoded: 43 characters, as loadSharedTeam expects. */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Creates, copies, replaces and turns off the team's public link. Anyone with it can
 * view the dashboard without an account, so replacing or turning it off is how a coach
 * takes it back from people it was sent to.
 */
export default function ShareLink({ team, onSaved }: { team: DashboardTeam; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  // What was last saved here, shown ahead of fresh data arriving. Undefined until then.
  const [savedToken, setSavedToken] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const supported = "share_token" in team;
  const token = savedToken === undefined ? (team.share_token ?? null) : savedToken;
  const url = token ? `${window.location.origin}/share/${token}` : null;

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    setCopied(false);
    const { error: failure } = await getSupabase().from("teams").update({ share_token: next }).eq("id", team.id);
    setSaving(false);
    if (failure) {
      setError("That couldn't be saved. Try again.");
      return;
    }
    setSavedToken(next);
    onSaved();
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked: leave it selected so it can be copied by hand.
      input.current?.select();
    }
  }

  function replace() {
    if (window.confirm("Make a new link? The current one stops working, so anyone you sent it to will need the new one.")) {
      void save(newToken());
    }
  }

  function turnOff() {
    if (window.confirm("Turn off this link? Anyone you sent it to won't be able to open it anymore.")) {
      void save(null);
    }
  }

  return (
    <div className="share-wrap">
      <button type="button" className="toggle-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {token ? "Shared ✓" : "Share"}
      </button>
      {open && (
        <div className="share-box" role="dialog" aria-label="Share this team">
          {!supported ? (
            <p>
              Sharing needs a database update. Run <code>supabase/add-share-links.sql</code> in the Supabase SQL Editor,
              then reload.
            </p>
          ) : url ? (
            <>
              <p>
                Anyone with this link can view {team.name}&apos;s stats and player reports without signing in. It stays
                current as you add games. Coach notes stay private.
              </p>
              <div className="share-row">
                <input ref={input} readOnly value={url} aria-label="Public link" onFocus={(event) => event.target.select()} />
                <button type="button" className="generate-btn" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="share-row">
                <button type="button" className="share-secondary" disabled={saving} onClick={replace}>
                  New link
                </button>
                <button type="button" className="share-secondary" disabled={saving} onClick={turnOff}>
                  Turn off
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Make a link other coaches can open to view {team.name}&apos;s stats and player reports, with no account
                needed. Coach notes stay private, and you can turn the link off at any time.
              </p>
              <button type="button" className="generate-btn" disabled={saving} onClick={() => void save(newToken())}>
                {saving ? "Creating…" : "Create public link"}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="chart-error" style={{ margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
