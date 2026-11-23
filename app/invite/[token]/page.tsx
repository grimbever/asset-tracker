"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { selectOrganization } from "@/app/actions";
import { Banner, Button } from "@/components/ui";
import { APP_NAME } from "@/lib/config";
import { acceptInvite, previewInvite } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Preview = {
  found: boolean;
  email?: string;
  org_name?: string;
  role_name?: string;
  expired?: boolean;
  accepted?: boolean;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = `/invite/${token}`;

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    void previewInvite(supabase, token)
      .then(setPreview)
      .catch((caught: unknown) => setError(messageFrom(caught)));
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [token]);

  async function accept() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPending(true);
    setError(null);
    let organizationId = "";
    try {
      organizationId = await acceptInvite(supabase, token);
    } catch (caught) {
      setError(messageFrom(caught));
      setPending(false);
      return;
    }
    const data = new FormData();
    data.set("organizationId", organizationId);
    await selectOrganization(data);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <p className="text-sm font-medium text-ember">{APP_NAME}</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight">Join an organization</h1>
      {!preview ? <p className="mt-4 text-sm">Checking the invite…</p> : null}
      {preview && !preview.found ? <p className="mt-4">This invite link is not valid.</p> : null}
      {preview?.found ? (
        <div className="mt-4 grid gap-3 text-sm leading-6">
          <p>
            {preview.org_name} invited <strong>{preview.email}</strong> as {preview.role_name}.
          </p>
          {preview.accepted ? <Banner tone="ok">This invite has already been used.</Banner> : null}
          {preview.expired ? <Banner tone="bad">This invite has expired. Ask an admin for a new one.</Banner> : null}
          {!email ? (
            <div className="flex flex-wrap gap-3">
              <Link className="underline" href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>
              <Link className="underline" href={`/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link>
            </div>
          ) : (
            <div className="grid gap-3">
              <p>Signed in as {email}.</p>
              <Button disabled={pending || preview.accepted || preview.expired} onClick={() => void accept()}>
                Accept invite
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {error ? <div className="mt-4"><Banner tone="bad">{error}</Banner></div> : null}
    </main>
  );
}
