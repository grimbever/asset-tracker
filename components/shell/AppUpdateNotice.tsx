"use client";

import { useEffect, useState } from "react";
import { APP_UPDATED_MESSAGE, isStaleAppError } from "@/lib/app-update";

export function AppUpdateNotice() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    function remember(reason: unknown) {
      if (!isStaleAppError(reason)) return;
      setStale(true);
    }
    function onRejection(event: PromiseRejectionEvent) {
      if (!isStaleAppError(event.reason)) return;
      event.preventDefault();
      remember(event.reason);
    }
    function onError(event: ErrorEvent) {
      remember(event.error ?? event.message);
    }
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-paper shadow-lg" role="alert">
      <p>{APP_UPDATED_MESSAGE}</p>
      <button type="button" className="min-h-10 rounded-full bg-paper px-4 text-ink" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
