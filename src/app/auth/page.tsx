import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in | Veo Analytics" };

// Looked up by code so that the URL can't put arbitrary text on the page.
const ERROR_MESSAGES: Record<string, string> = {
  callback_failed:
    "We couldn't finish signing you in from that link. If you already confirmed your email, sign in below.",
  google_not_configured: "Google sign-in isn't set up yet. Use your email and password for now.",
  google_failed: "Google sign-in didn't work. Try again, or use your email and password.",
};

async function AuthContent({ searchParams }: { searchParams: PageProps<"/auth">["searchParams"] }) {
  if (await getCurrentUser()) redirect("/onboarding");

  const { error } = await searchParams;
  const initialError =
    typeof error === "string" && Object.hasOwn(ERROR_MESSAGES, error)
      ? ERROR_MESSAGES[error]
      : undefined;

  return <AuthForm initialError={initialError} configured={isSupabaseConfigured} />;
}

export default function AuthPage({ searchParams }: PageProps<"/auth">) {
  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <Suspense fallback={<div className="h-96" aria-busy="true" />}>
        <AuthContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
