"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { ACCOUNT_CONFIRM_MESSAGE, friendlyAuthError } from "@/lib/auth/messages";
import { authRedirectOrigin, safeNextPath } from "@/lib/auth/redirect";
import { APP_NAME, DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/config";
import { newId } from "@/lib/ids";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const invited = next.startsWith("/invite/");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [organizationId] = useState(() => newId());

  function redirectTo() {
    return `${authRedirectOrigin(window.location.origin)}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Sign-in is off until the Supabase URL and key are set.");
      return;
    }
    setPending(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo() },
    });
    setPending(false);
    if (authError) setError(friendlyAuthError(authError));
    else setMessage("Check your email for a sign-in link.");
  }

  async function withPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Sign-in is off until the Supabase URL and key are set.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password of at least 8 characters, or send a magic link instead.");
      return;
    }
    if (mode === "sign-up" && !invited && organizationName.trim().length < 2) {
      setError("Name the organization. You can change it later.");
      return;
    }
    setPending(true);
    if (mode === "sign-in") {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setPending(false);
      if (authError) setError(friendlyAuthError(authError));
      else router.push(next);
      return;
    }
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo(),
        data: invited
          ? { display_name: displayName.trim() }
          : {
              display_name: displayName.trim(),
              organization_name: organizationName.trim(),
              organization_id: organizationId,
              timezone,
            },
      },
    });
    setPending(false);
    if (authError) {
      setError(friendlyAuthError(authError));
      return;
    }
    if (data.session) router.push(next);
    else setMessage(ACCOUNT_CONFIRM_MESSAGE);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <p className="text-sm font-medium text-ember">{APP_NAME}</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight">{mode === "sign-in" ? "Sign in" : "Create an organization"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        {mode === "sign-in"
          ? "Use the email and password for your organization, or send yourself a sign-in link."
          : invited
            ? "Create the account for the invited email. You will join the existing organization."
            : "This creates your login and an organization. You will be the admin."}
      </p>
      <form className="mt-6 grid gap-4" onSubmit={mode === "sign-in" ? sendLink : withPassword}>
        {mode === "sign-up" ? (
          <Field label="Your name">
            <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
          </Field>
        ) : null}
        {mode === "sign-up" && !invited ? (
          <>
            <Field label="Organization name">
              <TextInput
                required
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                autoComplete="organization"
              />
            </Field>
            <Field label="Timezone" hint="Dates and reminders use this clock. Central time is the default.">
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="min-h-12 w-full rounded-2xl border border-line bg-card px-3 text-base"
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        <Field label="Email">
          <TextInput
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password" hint={mode === "sign-in" ? "Leave this blank to email a sign-in link instead." : "At least 8 characters."}>
          <TextInput
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required={mode === "sign-up"}
          />
        </Field>
        {mode === "sign-in" ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Email me a sign-in link
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={(event) => void withPassword(event)}>
              Sign in with password
            </Button>
          </div>
        ) : (
          <Button type="submit" disabled={pending}>
            {invited ? "Create account" : "Create organization"}
          </Button>
        )}
      </form>
      {message ? (
        <div className="mt-4">
          <Banner tone="ok">{message}</Banner>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Banner tone="bad">{error}</Banner>
        </div>
      ) : null}
      <p className="mt-6 text-sm">
        {mode === "sign-in" ? (
          <>
            <Link className="underline" href={`/sign-up?next=${encodeURIComponent(next)}`}>
              Create an organization
            </Link>
            {" · "}
            <Link className="underline" href="/forgot-password">
              Forgot password
            </Link>
          </>
        ) : (
          <Link className="underline" href={`/sign-in?next=${encodeURIComponent(next)}`}>
            Already have an account? Sign in
          </Link>
        )}
      </p>
    </main>
  );
}
