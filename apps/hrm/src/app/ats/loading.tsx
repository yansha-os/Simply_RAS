/**
 * Streaming skeleton for the ATS routes (pipeline, applicant detail,
 * help tickets) — mirrors the kanban-style pipeline columns.
 */
export default function AtsLoading() {
  return (
    <div role="status" aria-label="Loading recruiting pipeline" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading recruiting pipeline…</span>

      {/* Header + filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-zinc-900" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-zinc-900/70" />
        </div>
        <div className="h-10 w-40 animate-pulse rounded-xl bg-zinc-900" />
      </div>

      {/* Pipeline columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((col) => (
          <div
            key={col}
            className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-4 backdrop-blur-xl"
          >
            <div className="h-4 w-28 animate-pulse rounded bg-zinc-900" />
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                className="h-24 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80"
                style={{ animationDelay: `${(col * 3 + card) * 80}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
