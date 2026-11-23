import { APP_NAME } from "@/lib/config";

export function SetupScreen() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-sm font-medium text-ember">{APP_NAME}</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight">Connect Supabase to open the register</h1>
      <p className="mt-4 text-base leading-7 text-muted">
        This deployment does not have a Supabase URL and key yet, so it is showing this setup screen instead of crashing.
        The equipment register, sign-in, and photos stay off until those values are set.
      </p>
      <ol className="mt-8 grid gap-4 text-sm leading-6">
        <li className="rounded-2xl bg-card p-4">
          <strong className="block text-base">1. Create the database</strong>
          Create a Supabase project, open the SQL Editor, and paste the whole file <code>supabase/setup.sql</code>.
        </li>
        <li className="rounded-2xl bg-card p-4">
          <strong className="block text-base">2. Allow sign-in links</strong>
          In Authentication, set the Site URL and add redirect URLs that end in <code>/auth/callback</code>.
        </li>
        <li className="rounded-2xl bg-card p-4">
          <strong className="block text-base">3. Set these environment variables</strong>
          <ul className="mt-2 grid gap-1 font-mono text-xs">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            <li>NEXT_PUBLIC_SITE_URL</li>
          </ul>
          <p className="mt-2 text-muted">
            Use either the publishable key or the anon key. If both are set, the publishable key wins. Leave
            NEXT_PUBLIC_SITE_URL empty on preview deployments.
          </p>
        </li>
      </ol>
      <p className="mt-6 text-sm leading-6 text-muted">
        The full click-by-click version is in <code>docs/setup.md</code> in the repo. After the variables are saved,
        redeploy, then create your organization and load the sample trailer, impact driver, and PAA dosing skid.
      </p>
    </main>
  );
}
