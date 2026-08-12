/** Streaming skeleton for the session EMR view. */
export default function SessionEmrLoading() {
  return (
    <div role="status" aria-label="Loading session EMR" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading session EMR…</span>

      <div className="space-y-3">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-zinc-900/70" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-xl lg:col-span-2">
          <div className="h-5 w-44 animate-pulse rounded-lg bg-zinc-900" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-white/5 bg-zinc-900/80"
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
