"use client";

import { APP_UPDATED_MESSAGE, isStaleAppError } from "@/lib/app-update";

export default function AppError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleAppError(error);
  return (
    <main className="mx-auto grid max-w-lg gap-4 px-4 py-16">
      <h1 className="font-serif text-4xl tracking-tight">{stale ? "The app was updated" : "Something went wrong"}</h1>
      <p className="text-sm leading-6 text-muted">{stale ? APP_UPDATED_MESSAGE : "Refresh the page and try again."}</p>
      <button type="button" className="min-h-12 w-fit rounded-full bg-ink px-4 text-paper" onClick={() => window.location.reload()}>
        Reload
      </button>
    </main>
  );
}
