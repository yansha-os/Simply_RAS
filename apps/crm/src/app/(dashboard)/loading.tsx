/**
 * Streaming skeleton for all (dashboard) routes (portals, notes, case, ops…).
 * Renders inside the dashboard layout so the sidebar stays interactive
 * while the page's server fetches stream in.
 */
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading page" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading…</span>

      {/* Page header */}
      <div className="space-y-3">
        <div className="h-8 w-72 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-lg bg-zinc-900/70" />
      </div>

      {/* Stat cards */}
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

      {/* Main content panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-xl lg:col-span-2">
          <div className="h-5 w-44 animate-pulse rounded-lg bg-zinc-900" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-xl">
          <div className="h-5 w-32 animate-pulse rounded-lg bg-zinc-900" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
