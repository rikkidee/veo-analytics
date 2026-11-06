"use client";

import { signOut } from "@/app/auth/actions";
import { secondaryButton } from "@/components/import/buttons";

export default function SettingsPanel({ email }: { email: string | null }) {
  return (
    <section className="flex flex-col items-start gap-3">
      <h3 className="font-semibold">Account</h3>
      <p className="text-sm">
        <span className="text-neutral-400">Signed in as </span>
        <span className="break-all font-medium text-neutral-100">{email ?? "your account"}</span>
      </p>
      <form action={signOut}>
        <button type="submit" className={secondaryButton}>
          Sign out
        </button>
      </form>
    </section>
  );
}
