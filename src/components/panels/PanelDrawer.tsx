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
 * Holds a tool at the side of the dashboard, which stays usable beside it. Nothing
 * here blocks the page. Hiding keeps the tool's state, so it's quick to look at the
 * stats and come straight back.
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
      <aside
        aria-label={panel ? PANEL_TITLES[panel] : undefined}
        inert={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape" && canClose) showPanel(null);
        }}
        className={`fixed top-14 right-0 bottom-0 z-30 flex w-full max-w-[620px] flex-col border-l border-neutral-800 bg-[#0d1117] shadow-2xl transition-[translate,visibility] duration-200 motion-reduce:transition-none ${
          open ? "translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 px-5 py-3">
          <h2 ref={heading} tabIndex={-1} className="mr-auto text-lg font-semibold outline-none">
            {panel && PANEL_TITLES[panel]}
          </h2>
          {panel && (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
              onClick={() => setPanelHidden(panel, true)}
            >
              Hide<span aria-hidden="true"> →</span>
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
          className="fixed top-20 right-0 z-30 rounded-l-md border border-r-0 border-[#1f6feb] bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 shadow-lg hover:bg-neutral-800"
        >
          <span aria-hidden="true">← </span>
          {PANEL_TITLES[panel]}
        </button>
      )}
    </>
  );
}
