/** Streaming skeleton for the RBT onboarding checklist board. */
export default function OnboardingLoading() {
  return (
    <div role="status" aria-label="Loading onboarding" className="p-6 md:p-8 space-y-6">
      <span className="sr-only">Loading onboarding…</span>

      <div className="space-y-3">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-zinc-900" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-zinc-900/70" />
      </div>

      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-white/5 bg-zinc-900/40 p-5 backdrop-blur-xl"
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-zinc-900" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 max-w-full animate-pulse rounded bg-zinc-900" style={{ animationDelay: `${i * 100}ms` }} />
              <div className="h-3 w-72 max-w-full animate-pulse rounded bg-zinc-900/70" style={{ animationDelay: `${i * 100 + 50}ms` }} />
            </div>
            <div className="h-6 w-24 animate-pulse rounded-full bg-zinc-900" />
          </div>
        ))}
      </div>
    </div>
  );
}
