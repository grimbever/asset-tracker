export default function Loading() {
  return (
    <main className="mx-auto grid max-w-5xl gap-4 px-4 py-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading</p>
      <div className="h-10 w-48 animate-pulse rounded-2xl bg-paper-deep" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
      </div>
      <div className="h-40 animate-pulse rounded-3xl bg-card" />
    </main>
  );
}
