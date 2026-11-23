"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { friendlyAuthError } from "@/lib/auth/messages";
import { authRedirectOrigin, passwordResetRedirect } from "@/lib/auth/redirect";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Password reset is off until Supabase is configured.");
      return;
    }
    setPending(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirect(authRedirectOrigin(window.location.origin)),
    });
    setPending(false);
    if (authError) setError(friendlyAuthError(authError));
    else setMessage("Check your email for a link to choose a new password.");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-serif text-4xl tracking-tight">Reset password</h1>
      <form className="mt-6 grid gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="Email">
          <TextInput type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Button type="submit" disabled={pending}>
          Email me a reset link
        </Button>
      </form>
      {message ? <div className="mt-4"><Banner tone="ok">{message}</Banner></div> : null}
      {error ? <div className="mt-4"><Banner tone="bad">{error}</Banner></div> : null}
      <p className="mt-6 text-sm">
        <Link className="underline" href="/sign-in">Back to sign in</Link>
      </p>
    </main>
  );
}
