"use client";

import { APP_UPDATED_MESSAGE, isStaleAppError } from "@/lib/app-update";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleAppError(error);
  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", margin: "2rem" }}>
        <h1>{stale ? "The app was updated" : "Something went wrong"}</h1>
        <p>{stale ? APP_UPDATED_MESSAGE : "Refresh the page and try again."}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </body>
    </html>
  );
}
