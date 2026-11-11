"use client";

import { PanelLink, type Panel } from "@/components/panels/links";

const STEPS: { icon: string; title: string; text: string; panel: Panel; action: string }[] = [
  {
    icon: "📋",
    title: "Set up your roster",
    text: "Add your team name and players with their jersey numbers",
    panel: "roster",
    action: "Get Started",
  },
  {
    icon: "⬇️",
    title: "Import your games",
    text: "Install the Chrome extension and connect to Veo to import match reports",
    panel: "import",
    action: "Import games",
  },
  {
    icon: "👕",
    title: "Map jerseys",
    text: "Match any unrecognized jersey numbers to the right players for complete stats",
    panel: "map",
    action: "Map jerseys",
  },
];

const LEADS = [
  "Three quick steps to your team's season stats.",
  "Roster saved. Next, bring in your games.",
  "Your stats are in. One last step makes them complete.",
];

export type OnboardingStage = 1 | 2 | 3;

/**
 * Walks a new account through setup. In full it stands in for an empty dashboard;
 * compact, it sits above the stats for the last step.
 */
export default function OnboardingGuide({
  stage,
  title,
  compact = false,
  onHide,
}: {
  stage: OnboardingStage;
  title: string;
  compact?: boolean;
  onHide?: () => void;
}) {
  const next = STEPS[stage - 1];
  return (
    <section className={`onboarding ${compact ? "compact" : ""}`} aria-labelledby="onboarding-title">
      <div className="onboarding-intro">
        <h2 id="onboarding-title">{title}</h2>
        <p className="lead">{LEADS[stage - 1]}</p>
      </div>
      <ol>
        {STEPS.map((step, index) => {
          const number = index + 1;
          const state = number < stage ? "done" : number === stage ? "current" : "upcoming";
          return (
            <li key={step.title} className={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="step-icon" aria-hidden="true">
                {state === "done" ? "✓" : step.icon}
              </span>
              <span>
                <span className="step-label">
                  Step {number}
                  {state === "done" ? " · Done" : ""}
                </span>
                <span className="step-title">{step.title}</span>
                {(!compact || state === "current") && <span className="step-text">{step.text}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="onboarding-actions">
        <PanelLink panel={next.panel} className="onboarding-cta">
          {next.action} <span aria-hidden="true">→</span>
        </PanelLink>
        {onHide && (
          <button type="button" className="onboarding-hide" onClick={onHide}>
            Hide guide
          </button>
        )}
      </div>
    </section>
  );
}
