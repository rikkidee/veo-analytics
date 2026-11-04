import type { Metadata } from "next";
import RosterForm from "@/components/RosterForm";

export const metadata: Metadata = { title: "Roster setup | Veo Analytics" };

export default function OnboardingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Set up your roster</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Step 1 of 2. Add your team and the jersey each player usually wears.
        </p>
      </div>
      <RosterForm />
    </div>
  );
}
