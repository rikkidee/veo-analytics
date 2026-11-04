import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-col items-start gap-6 py-16">
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        Your Veo match reports, turned into season-long team stats.
      </h1>
      <p className="max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
        Set up your roster, scrape each game with the Chrome extension, fix
        misdetected jerseys, and track every player across every game.
      </p>
      <Link
        href="/onboarding"
        className="rounded-md bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
      >
        Get Started
      </Link>
    </section>
  );
}
