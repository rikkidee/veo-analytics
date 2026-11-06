import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import DashboardLoader from "@/components/DashboardLoader";
import { loadDashboardData, loadMappingCoverage } from "@/lib/dashboard-data";
import type { DashboardData } from "@/lib/stats";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard | Veo Analytics" };

async function SignedInDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  let data: DashboardData;
  try {
    const supabase = await createClient();
    const [loaded, coverage] = await Promise.all([loadDashboardData(supabase), loadMappingCoverage(supabase)]);
    data = { ...loaded, coverage };
  } catch (cause) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        Could not load the dashboard: {(cause as Error).message}
      </p>
    );
  }

  return <DashboardLoader data={data} email={user.email} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-64" aria-busy="true" />}>
      <SignedInDashboard />
    </Suspense>
  );
}
