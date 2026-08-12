/** Streaming skeleton for the payroll table view. */
export default function PayrollLoading() {
  return (
    <div role="status" aria-label="Loading payroll" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading payroll…</span>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="h-8 w-56 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="h-10 w-36 animate-pulse rounded-xl bg-zinc-900/70" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-white/5 bg-zinc-900/60 backdrop-blur-xl"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-4 backdrop-blur-xl">
        <div className="h-10 animate-pulse rounded-xl bg-zinc-900" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
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
