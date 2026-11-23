import { Scanner } from "@/components/scan/Scanner";

export default function ScanPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 font-serif text-4xl tracking-tight">Scan</h1>
      <Scanner />
    </main>
  );
}
