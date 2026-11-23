"use client";

import dynamic from "next/dynamic";

const PrintClient = dynamic(
  () => import("@/components/labels/PrintClient").then((mod) => mod.PrintClient),
  { ssr: false, loading: () => <main className="px-4 py-8">Preparing labels…</main> },
);

export default function PrintLabelsPage() {
  return <PrintClient />;
}
