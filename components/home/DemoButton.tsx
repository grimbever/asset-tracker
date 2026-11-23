"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button } from "@/components/ui";
import { seedDemoData } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function DemoButton({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid gap-3">
      <Button
        disabled={pending}
        onClick={() => {
          const supabase = getBrowserSupabase();
          if (!supabase) return;
          setPending(true);
          setError(null);
          void seedDemoData(supabase, organizationId)
            .then(() => router.refresh())
            .catch((caught: unknown) => {
              setError(messageFrom(caught));
              setPending(false);
            });
        }}
      >
        Load sample equipment
      </Button>
      <p className="text-sm text-muted">Adds a trailer, an impact driver, a PAA dosing skid, and the skid’s feed pump. Locations Shop, Yard, and Storeroom, plus Pat (demo).</p>
      {error ? <Banner tone="bad">{error}</Banner> : null}
    </div>
  );
}
