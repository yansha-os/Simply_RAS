/** Streaming skeleton for the staffing clients list. */
export default function ClientsLoading() {
  return (
    <div role="status" aria-label="Loading clients" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading clients…</span>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="h-8 w-56 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="h-10 w-64 max-w-full animate-pulse rounded-xl bg-zinc-900/70" />
      </div>

      <div className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-4 backdrop-blur-xl">
        <div className="h-10 animate-pulse rounded-xl bg-zinc-900" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
