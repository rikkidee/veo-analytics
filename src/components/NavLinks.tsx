"use client";

import { usePathname } from "next/navigation";
import { PanelLink, useOpenPanel, type Panel } from "@/components/panels/links";

const ITEMS: [Panel | null, string][] = [
  [null, "Dashboard"],
  ["import", "Import Games"],
  ["map", "Map Jerseys"],
  ["roster", "Roster"],
];

export default function NavLinks() {
  const { panel: open } = useOpenPanel();
  const onDashboard = usePathname() === "/dashboard";

  const item = (panel: Panel | null, label: string, className = "") => {
    const current = onDashboard && open === panel;
    return (
      <PanelLink
        key={label}
        panel={panel}
        aria-current={current ? "page" : undefined}
        className={`shrink-0 rounded-md px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${
          current ? "bg-[#1f6feb] text-white" : "text-neutral-300 hover:bg-neutral-800"
        } ${className}`}
      >
        {label}
      </PanelLink>
    );
  };

  return (
    <>
      <PanelLink panel={null} className="mr-3 shrink-0 font-semibold whitespace-nowrap text-neutral-100">
        Veo Analytics
      </PanelLink>
      {ITEMS.map(([panel, label]) => item(panel, label))}
      {item("settings", "Settings", "ml-auto")}
    </>
  );
}
