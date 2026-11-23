"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { friendlyAuthError } from "@/lib/auth/messages";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Password reset is off until Supabase is configured.");
      return;
    }
    setPending(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (authError) setError(friendlyAuthError(authError));
    else router.push("/home");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-serif text-4xl tracking-tight">Choose a new password</h1>
      <form className="mt-6 grid gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="New password">
          <TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" disabled={pending}>Save password</Button>
      </form>
      {error ? <div className="mt-4"><Banner tone="bad">{error}</Banner></div> : null}
    </main>
  );
}
