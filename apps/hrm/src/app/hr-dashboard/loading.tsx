/** Streaming skeleton for the HR dashboard. */
export default function HrDashboardLoading() {
  return (
    <div role="status" aria-label="Loading HR dashboard" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading HR dashboard…</span>

      <div className="space-y-3">
        <div className="h-8 w-72 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-lg bg-zinc-900/70" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-white/5 bg-zinc-900/60 p-5 backdrop-blur-xl"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="h-3 w-20 rounded bg-zinc-800" />
            <div className="mt-4 h-7 w-16 rounded-lg bg-zinc-800" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((panel) => (
          <div
            key={panel}
            className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-xl"
          >
            <div className="h-5 w-44 animate-pulse rounded-lg bg-zinc-900" />
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
