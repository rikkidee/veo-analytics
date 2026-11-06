"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { authenticate, signInWithGoogle, type AuthMode } from "@/app/auth/actions";

const inputClass =
  "w-full min-w-0 rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700";
const labelClass = "text-sm font-medium text-neutral-700 dark:text-neutral-300";

const MODES: { value: AuthMode; label: string }[] = [
  { value: "sign-in", label: "Sign in" },
  { value: "sign-up", label: "Create account" },
];

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
    >
      {pending ? "Connecting…" : "Sign in with Google"}
    </button>
  );
}

export default function AuthForm({
  initialError,
  configured,
}: {
  initialError?: string;
  configured: boolean;
}) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(authenticate, null);

  // A result only applies to the tab that produced it. Once the form has been
  // submitted, the error from the URL is out of date.
  const result = state?.mode === mode ? state : null;
  const error = state ? result?.error : initialError;
  const isSignUp = mode === "sign-up";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          {isSignUp
            ? "Sign up to save your roster and game stats."
            : "Sign in to get to your roster and game stats."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md bg-neutral-100 p-1 dark:bg-neutral-900">
        {MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              mode === value
                ? "bg-white shadow-sm dark:bg-neutral-700"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="mode" value={mode} />
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Email</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Password</span>
          <input
            required
            type="password"
            name="password"
            minLength={isSignUp ? 6 : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "At least 6 characters" : "Your password"}
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        {result?.notice && (
          <p role="status" className="text-sm text-success">
            {result.notice}
          </p>
        )}
        {!configured && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Signing in is off until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are
            set in .env.local.
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !configured}
          className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        or
        <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      </div>

      <form action={signInWithGoogle}>
        <GoogleButton />
      </form>
    </div>
  );
}
