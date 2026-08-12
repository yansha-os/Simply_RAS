/**
 * Streaming skeleton for the client profile — mirrors the real page's
 * identity header + tab bar + tab panel so the layout doesn't jump
 * when the (heavy) profile fetches resolve.
 */
export default function ClientProfileLoading() {
  return (
    <div role="status" aria-label="Loading client profile" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading client profile…</span>

      {/* Identity header */}
      <div className="flex items-center gap-5 rounded-2xl border border-white/5 bg-zinc-900/60 p-6 backdrop-blur-xl">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-zinc-800" />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-56 max-w-full animate-pulse rounded-lg bg-zinc-800" />
          <div className="flex flex-wrap gap-2">
            <div className="h-5 w-24 animate-pulse rounded-full bg-zinc-800/80" />
            <div className="h-5 w-32 animate-pulse rounded-full bg-zinc-800/80" style={{ animationDelay: '120ms' }} />
            <div className="h-5 w-20 animate-pulse rounded-full bg-zinc-800/80" style={{ animationDelay: '240ms' }} />
          </div>
        </div>
        <div className="hidden h-10 w-32 animate-pulse rounded-xl bg-zinc-800 md:block" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 overflow-hidden border-b border-white/5 pb-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-8 w-28 shrink-0 animate-pulse rounded-lg bg-zinc-900"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      {/* Tab panel */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-xl"
          >
            <div className="h-4 w-36 animate-pulse rounded bg-zinc-900" />
            <div className="h-24 animate-pulse rounded-xl bg-zinc-900/80" style={{ animationDelay: `${i * 100}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
