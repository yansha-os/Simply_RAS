/**
 * Streaming skeleton for the RBT portal routes (schedule, payroll, job board,
 * help desk, documents, session studio…) — external-user surface, so
 * structure must appear immediately on slow phones instead of a blank screen.
 */
export default function RbtPortalLoading() {
  return (
    <div role="status" aria-label="Loading page" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading…</span>

      {/* Page header */}
      <div className="space-y-3">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-zinc-900/70" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-white/5 bg-zinc-900/60 p-5 backdrop-blur-xl"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="h-3 w-24 rounded bg-zinc-800" />
            <div className="mt-3 h-6 w-14 rounded-lg bg-zinc-800" />
          </div>
        ))}
      </div>

      {/* Content list */}
      <div className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-xl">
        <div className="h-5 w-40 animate-pulse rounded-lg bg-zinc-900" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
