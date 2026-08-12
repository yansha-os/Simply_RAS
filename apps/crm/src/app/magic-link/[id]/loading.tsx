/**
 * Streaming skeleton for the parent magic-link portal — the highest-priority
 * external-user surface. Mirrors the portal's sticky header + tab bar +
 * action-item cards so parents on slow phones see structure immediately
 * instead of a blank screen while the packet/messages/schedule queries run.
 */
export default function MagicLinkLoading() {
  return (
    <div role="status" aria-label="Loading your secure portal" className="min-h-screen bg-[#0a0a0c]">
      <span className="sr-only">Loading your secure portal…</span>

      {/* Sticky header */}
      <div className="sticky top-0 z-50 border-b border-white/5 bg-[#0f1115]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-zinc-900" />
            <div className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-zinc-900" />
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-900/70" />
            </div>
          </div>
          <div className="h-8 w-28 animate-pulse rounded-full bg-zinc-900" />
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Tab bar */}
        <div className="flex gap-6 border-b border-white/5 pb-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-5 w-28 animate-pulse rounded bg-zinc-900"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>

        {/* Progress strip */}
        <div className="h-20 animate-pulse rounded-2xl border border-white/5 bg-zinc-900/50 backdrop-blur-xl" />

        {/* Action item cards */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="space-y-4 rounded-2xl border border-white/5 bg-zinc-900/40 p-6 backdrop-blur-xl"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-900" />
              <div className="h-5 w-52 max-w-full animate-pulse rounded bg-zinc-900" />
            </div>
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-zinc-900/70" />
            <div className="h-10 w-36 animate-pulse rounded-xl bg-zinc-900" />
          </div>
        ))}
      </div>
    </div>
  );
}
