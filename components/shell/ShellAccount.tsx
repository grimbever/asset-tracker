"use client";

import { useRouter } from "next/navigation";
import { accountDetail, accountLabel } from "@/lib/shell/account";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function ShellAccount({
  displayName,
  email,
  organization,
}: {
  displayName: string;
  email: string;
  organization: string | null;
}) {
  const router = useRouter();
  const name = accountLabel(displayName, email);
  const detail = accountDetail(displayName, email);

  async function signOut() {
    const supabase = getBrowserSupabase();
    await supabase?.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="grid gap-1 border-t border-line px-4 py-3">
      <p className="truncate text-sm font-medium">{name}</p>
      {detail ? <p className="truncate text-xs text-muted">{detail}</p> : null}
      {organization ? <p className="truncate text-xs text-muted">{organization}</p> : null}
      <button type="button" className="mt-1 w-fit text-left text-sm underline" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}
