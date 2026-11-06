import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import NavLinks from "@/components/NavLinks";

/** Reads the session, so render it inside a <Suspense> boundary. */
export default async function AppNav() {
  const user = await getCurrentUser();
  if (user) return <NavLinks />;
  return (
    <>
      <Link href="/" className="font-semibold text-neutral-100">
        Veo Analytics
      </Link>
      <Link href="/auth" className="ml-auto font-medium hover:underline">
        Sign in
      </Link>
    </>
  );
}
