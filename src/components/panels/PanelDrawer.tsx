"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { setPanelHidden, showPanel, type Panel } from "@/components/panels/links";

export const PANEL_TITLES: Record<Panel, string> = {
  import: "Import Games",
  map: "Map Jerseys",
  roster: "Roster",
  settings: "Settings",
};

/**
 * Holds a tool at the left of the dashboard. The dim is only a cue that the tool is
 * on top: the dashboard stays usable, so numbers can be watched while mapping. Hiding
 * keeps the tool's state, so it's quick to look at the stats and come straight back.
 */
export default function PanelDrawer({
  panel,
  hidden,
  canClose,
  children,
}: {
  panel: Panel | null;
  hidden: boolean;
  /** False when this is the one thing left to do, as with a brand new account. */
  canClose: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const open = Boolean(panel) && !hidden;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, panel]);

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-14 bottom-0 z-20 bg-black/30 transition-opacity duration-300 motion-reduce:transition-none ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        aria-label={panel ? PANEL_TITLES[panel] : undefined}
        inert={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape" && canClose) showPanel(null);
        }}
        className={`fixed top-14 bottom-0 left-0 z-30 flex w-full max-w-[620px] flex-col border-r-2 border-[#1f6feb] bg-[#0d1117] shadow-[12px_0_40px_rgba(0,0,0,.7)] transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-5 py-3">
          <h2 ref={heading} tabIndex={-1} className="mr-auto text-lg font-semibold outline-none">
            {panel && PANEL_TITLES[panel]}
          </h2>
          {panel && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
              onClick={() => setPanelHidden(panel, true)}
            >
              <span aria-hidden="true">← </span>Hide
            </button>
          )}
          {canClose && (
            <button
              type="button"
              aria-label="Close"
              className="rounded-md px-2 py-1 text-lg leading-none text-neutral-300 hover:bg-neutral-800"
              onClick={() => showPanel(null)}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        <div data-panel-scroll className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-32">
          {children}
        </div>
      </aside>
      {panel && hidden && (
        <button
          type="button"
          onClick={() => setPanelHidden(panel, false)}
          className="fixed top-1/2 left-0 z-30 -translate-y-1/2 rotate-180 rounded-l-md border border-r-0 flex w-9 items-center justify-center border-[#1f6feb] bg-neutral-900 py-4 text-sm font-semibold text-neutral-100 shadow-lg [writing-mode:vertical-rl] hover:bg-neutral-800"
        >
          {PANEL_TITLES[panel]}
        </button>
      )}
    </>
  );
}
