"use client";

import Link from "next/link";
import { LabelDocument } from "@/components/labels/LabelDocument";
import { readLabelJob } from "@/lib/labels/job";

export function PrintClient() {
  const job = readLabelJob();
  if (!job || job.labels.length === 0) {
    return (
      <main className="px-4 py-8">
        <p>Choose at least one asset before printing.</p>
        <Link href="/labels" className="mt-3 inline-flex underline">
          Back to labels
        </Link>
      </main>
    );
  }
  return <LabelDocument job={job} />;
}
