import Link from "next/link";
import { redirect } from "next/navigation";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { APP_NAME } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseEnvProblem } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured()) return <SetupScreen problem={supabaseEnvProblem()} />;
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect("/home");

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-sm font-medium text-ember">{APP_NAME}</p>
      <h1 className="mt-3 max-w-xl font-serif text-5xl tracking-tight">Know what you own, where it is, and who has it.</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-muted">
        Equipment, tools, trailers, chemical dosing gear, and office IT. Scan a QR code, check an item out in a few taps,
        and print labels on the sheets or rolls you already have.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/sign-up" className="inline-flex min-h-12 items-center rounded-full bg-ember px-5 text-white">
          Create an organization
        </Link>
        <Link href="/sign-in" className="inline-flex min-h-12 items-center rounded-full border border-line bg-card px-5">
          Sign in
        </Link>
      </div>
    </main>
  );
}
