import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import RosterForm from "@/components/RosterForm";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roster setup | Veo Analytics" };

async function SignedInRosterForm() {
  if (!(await getCurrentUser())) redirect("/auth");
  return <RosterForm />;
}

export default function OnboardingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Set up your roster</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Step 1 of 2. Add your team and the jersey each player usually wears.
        </p>
      </div>
      <Suspense fallback={<div className="h-64" aria-busy="true" />}>
        <SignedInRosterForm />
      </Suspense>
    </div>
  );
}
