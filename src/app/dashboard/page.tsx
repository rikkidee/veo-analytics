import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import DashboardLoader from "@/components/DashboardLoader";
import { loadDashboardData } from "@/lib/dashboard-data";
import type { DashboardData } from "@/lib/stats";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard | Veo Analytics" };

async function SignedInDashboard() {
  if (!(await getCurrentUser())) redirect("/auth");

  let data: DashboardData;
  try {
    data = await loadDashboardData(await createClient());
  } catch (cause) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        Could not load the dashboard: {(cause as Error).message}
      </p>
    );
  }

  if (data.teams.length === 0) {
    return (
      <p>
        Add your team first.{" "}
        <Link href="/onboarding" className="font-medium text-emerald-700 underline dark:text-emerald-400">
          Set up your roster
        </Link>
      </p>
    );
  }
  return <DashboardLoader data={data} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-64" aria-busy="true" />}>
      <SignedInDashboard />
    </Suspense>
  );
}
