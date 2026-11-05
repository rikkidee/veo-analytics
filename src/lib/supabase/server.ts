import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

/** Creates a request-scoped client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies. src/proxy.ts refreshes the
          // session before they render, so nothing is lost here.
        }
      },
    },
  });
}

/**
 * Returns the signed-in user, verified with Supabase. It reads the request, so
 * call it from inside a <Suspense> boundary (this app uses Cache Components).
 * cache() lets the header and the page share one lookup per request.
 */
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
});
