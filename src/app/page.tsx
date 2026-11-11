import Link from "next/link";

const FLOW: { icon: string; title: string; text: string; tone?: "warn" | "fix" | "good"; note?: string }[] = [
  { icon: "🎥", title: "Veo camera", text: "Records the whole game" },
  { icon: "📄", title: "Match report", text: "Stats for every jersey it detects" },
  {
    icon: "🔢",
    title: "Jersey detection",
    text: "Usually right, sometimes misread",
    tone: "warn",
    note: "#7 read as #1",
  },
  { icon: "🛠️", title: "Veo Analytics", text: "You map wrong numbers to the right players", tone: "fix" },
  { icon: "📊", title: "Accurate stats", text: "Complete season numbers for every player", tone: "good" },
];

// Inline for the blue and green edges, as the app's card style would otherwise grey them out.
// The amber one is left to its classes, which that card style already steps aside for.
const EDGES = { fix: "#1f6feb", good: "#238636" } as const;

export default function Home() {
  return (
    <>
      <section className="flex flex-col items-start gap-6 py-16">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Your Veo match reports, turned into season-long team stats.
        </h1>
        <p className="max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Set up your roster, scrape each game with the Chrome extension, fix
          misdetected jerseys, and track every player across every game.
        </p>
        <Link
          href="/dashboard"
          className="rounded-md bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          Get Started
        </Link>
      </section>

      <section aria-labelledby="how-veo-tracks" className="flex flex-col gap-8 border-t border-neutral-800 py-16">
        <h2 id="how-veo-tracks" className="text-2xl font-bold tracking-tight sm:text-3xl">
          How Veo tracks your players
        </h2>

        <div
          role="list"
          aria-label="From Veo camera to accurate stats"
          className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]"
        >
          {FLOW.map((step, index) => (
            <div key={step.title} className="contents">
              {index > 0 && (
                <div aria-hidden="true" className="flex items-center justify-center text-xl text-neutral-500">
                  <span className="lg:hidden">↓</span>
                  <span className="hidden lg:inline">→</span>
                </div>
              )}
              <div
                role="listitem"
                className={`flex flex-col gap-1 rounded-lg border p-4 ${
                  step.tone === "warn" ? "border-amber-800 bg-amber-950" : "border-neutral-800 bg-neutral-900"
                }`}
                style={step.tone === "fix" || step.tone === "good" ? { borderColor: EDGES[step.tone] } : undefined}
              >
                <span aria-hidden="true" className="text-2xl">
                  {step.icon}
                </span>
                <span className="font-semibold text-neutral-100">{step.title}</span>
                <span className="text-sm text-neutral-400">{step.text}</span>
                {step.note && (
                  <span className="mt-1 w-fit rounded-full border border-amber-800 px-2 py-0.5 font-mono text-xs text-amber-400">
                    {step.note}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex max-w-3xl flex-col gap-4 text-neutral-300">
          <p>
            Veo&apos;s AI camera automatically records your games and generates match reports with individual
            player statistics. It identifies players by reading jersey numbers from the video using OCR (optical
            character recognition).
          </p>
          <p>
            This works great most of the time, but it&apos;s not perfect: hair covering jerseys, players turning
            away from the camera, similar-looking digits and poor lighting can cause misreads. Some players may show
            up under the wrong jersey number, or the same player may be detected as several different numbers in
            one game.
          </p>
          <p>
            <strong className="font-semibold text-neutral-100">That&apos;s where Veo Analytics comes in.</strong>{" "}
            We import all of Veo&apos;s match report data and give you the tools to correct these misdetections,
            mapping the wrong jersey numbers to the right players so your season stats are accurate and complete.
          </p>
        </div>
      </section>
    </>
  );
}
