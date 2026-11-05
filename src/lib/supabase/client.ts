import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

export { isSupabaseConfigured };

let client: SupabaseClient | null = null;

/**
 * Returns the shared browser client, which shares its session cookies with the
 * server. It is created on first use because creating it throws on an empty
 * URL, which would otherwise break `next build` on any machine without the env
 * vars set.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
