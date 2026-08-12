/** Streaming skeleton for the RBT manager roster view. */
export default function RbtManagerLoading() {
  return (
    <div role="status" aria-label="Loading RBT manager dashboard" className="space-y-6">
      <span className="sr-only">Loading RBT manager dashboard…</span>

      <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="h-3 w-56 max-w-full animate-pulse rounded bg-emerald-500/10" />
        <div className="mt-4 h-9 w-72 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="mt-3 h-4 w-[36rem] max-w-full animate-pulse rounded bg-zinc-900/70" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-lg backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="h-3 w-28 animate-pulse rounded bg-zinc-900" />
              <div className="h-10 w-10 animate-pulse rounded-xl bg-zinc-900" />
            </div>
            <div
              className="h-8 w-20 animate-pulse rounded-lg bg-zinc-900"
              style={{ animationDelay: `${i * 80}ms` }}
            />
            <div
              className="h-3 w-full animate-pulse rounded bg-zinc-900/70"
              style={{ animationDelay: `${i * 80 + 40}ms` }}
            />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 p-5">
          <div className="h-5 w-48 animate-pulse rounded bg-zinc-900" />
          <div className="h-10 w-64 max-w-full animate-pulse rounded-xl bg-zinc-900/70" />
        </div>
        <div className="space-y-px p-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-5 border-b border-white/5 px-4 py-4 last:border-0"
            >
              <div className="h-4 animate-pulse rounded bg-zinc-900" />
              <div className="h-4 animate-pulse rounded bg-zinc-900/70" />
              <div className="h-4 animate-pulse rounded bg-zinc-900/70" />
              <div className="h-4 animate-pulse rounded bg-zinc-900/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
