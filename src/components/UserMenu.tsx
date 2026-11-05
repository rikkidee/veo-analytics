import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/supabase/server";

/** Reads the session, so render it inside a <Suspense> boundary. */
export default async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/auth" className="font-medium hover:underline">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        title={user.email ?? undefined}
        className="max-w-48 truncate text-neutral-600 dark:text-neutral-400"
      >
        {user.email ?? "Signed in"}
      </span>
      <form action={signOut}>
        <button type="submit" className="font-medium hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
