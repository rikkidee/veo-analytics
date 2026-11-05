"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AuthMode = "sign-in" | "sign-up";
export type AuthState = { mode: AuthMode; error?: string; notice?: string } | null;

async function callbackUrl() {
  const origin = (await headers()).get("origin");
  return origin ? `${origin}/auth/callback` : undefined;
}

export async function authenticate(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const mode: AuthMode = formData.get("mode") === "sign-up" ? "sign-up" : "sign-in";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!isSupabaseConfigured) {
    return { mode, error: "Supabase is not configured for this app yet." };
  }
  if (!email || !password) {
    return { mode, error: "Enter your email and password." };
  }

  const supabase = await createClient();

  if (mode === "sign-in") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { mode, error: error.message };
  } else {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: await callbackUrl() },
    });
    if (error) return { mode, error: error.message };

    if (!data.session) {
      // With email confirmation on, Supabase reports an existing email as a
      // success with no identities rather than as an error.
      if (data.user?.identities?.length === 0) {
        return { mode, error: "An account with that email already exists. Try signing in." };
      }
      return {
        mode,
        notice: `Almost there. Open the link we sent to ${email} to confirm your account.`,
      };
    }
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signInWithGoogle() {
  // Supabase answers with a raw JSON error page when a provider is off, so
  // check first and keep the user on the sign-in page.
  const settings = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: supabaseAnonKey },
    cache: "no-store",
  })
    .then((response) => response.json())
    .catch(() => null);
  if (settings?.external?.google === false) {
    redirect("/auth?error=google_not_configured");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl() },
  });
  if (error || !data.url) {
    redirect("/auth?error=google_failed");
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth");
}
