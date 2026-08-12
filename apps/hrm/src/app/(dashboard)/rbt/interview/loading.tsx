export default function InterviewLoading() {
  return (
    <main
      className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 px-4 py-8 text-white shadow-[0_30px_120px_rgba(9,9,11,0.38)] sm:px-7"
      aria-busy="true"
      aria-label="Loading secure interview workspace"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(249,115,22,0.18),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(56,189,248,0.12),transparent_28%)]" />
      <div className="relative animate-pulse space-y-7 motion-reduce:animate-none">
        <header className="space-y-4 border-b border-white/10 pb-7">
          <div className="h-7 w-52 rounded-full bg-orange-400/10" />
          <div className="h-10 w-full max-w-xl rounded-2xl bg-white/10" />
          <div className="h-4 w-full max-w-2xl rounded-full bg-white/5" />
        </header>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
          <section className="min-h-96 rounded-3xl border border-white/10 bg-white/[0.035] p-7">
            <div className="h-5 w-44 rounded-full bg-white/10" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="h-24 rounded-2xl bg-white/5" />
              <div className="h-24 rounded-2xl bg-white/5" />
            </div>
            <div className="mt-5 h-16 rounded-2xl bg-orange-400/10" />
          </section>
          <section className="min-h-80 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div className="h-5 w-36 rounded-full bg-white/10" />
            <div className="mt-7 space-y-5">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-white/10" />
                  <div className="h-4 flex-1 rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <span className="sr-only">Verifying device access and loading interview details…</span>
    </main>
  );
}
