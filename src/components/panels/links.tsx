"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

const PANELS = ["import", "map", "roster", "settings"] as const;
export type Panel = (typeof PANELS)[number];

export const panelHref = (panel: Panel | null) => (panel ? `/dashboard?panel=${panel}` : "/dashboard");

/**
 * Which tool is open over the dashboard. It lives in the URL so Back closes it and
 * a refresh keeps it. Changing it never reloads the dashboard. Read it inside a
 * <Suspense> boundary.
 */
export function useOpenPanel() {
  const params = useSearchParams();
  const value = params.get("panel");
  return {
    panel: PANELS.find((panel) => panel === value) ?? null,
    hidden: params.has("hidden"),
  };
}

/** Opens a tool, or with null closes whichever is open. */
export function showPanel(panel: Panel | null) {
  window.history.pushState(null, "", panelHref(panel));
}

/** Tucks the open tool aside without closing it. Replaces, so Back still leaves the tool. */
export function setPanelHidden(panel: Panel, hidden: boolean) {
  window.history.replaceState(null, "", hidden ? `${panelHref(panel)}&hidden=1` : panelHref(panel));
}

/** Opens a tool in place on the dashboard, and from anywhere else goes there first. */
export function PanelLink({
  panel,
  onClick,
  ...props
}: { panel: Panel | null } & Omit<ComponentProps<typeof Link>, "href">) {
  const pathname = usePathname();
  return (
    <Link
      {...props}
      href={panelHref(panel)}
      scroll={false}
      prefetch={false}
      onClick={(event) => {
        onClick?.(event);
        const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (pathname === "/dashboard" && !newTab) {
          event.preventDefault();
          showPanel(panel);
        }
      }}
    />
  );
}
