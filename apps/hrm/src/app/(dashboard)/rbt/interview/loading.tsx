export default function InterviewLoading() {
  return (
    <main
      className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-[#E2D5B7] bg-[#FFFDF8] px-4 py-8 text-slate-900 shadow-xl sm:px-7"
      aria-busy="true"
      aria-label="Loading secure interview workspace"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(249,115,22,0.08),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(56,189,248,0.06),transparent_28%)]" />
      <div className="relative animate-pulse space-y-7 motion-reduce:animate-none">
        <header className="space-y-4 border-b border-[#E2D5B7] pb-7">
          <div className="h-7 w-52 rounded-full bg-orange-100" />
          <div className="h-10 w-full max-w-xl rounded-2xl bg-[#F9F5EC]" />
          <div className="h-4 w-full max-w-2xl rounded-full bg-[#F9F5EC]" />
        </header>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
          <section className="min-h-96 rounded-3xl border border-[#E2D5B7] bg-[#F9F5EC]/60 p-7">
            <div className="h-5 w-44 rounded-full bg-[#E2D5B7]" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="h-24 rounded-2xl bg-[#FFFDF8] border border-[#E2D5B7]" />
              <div className="h-24 rounded-2xl bg-[#FFFDF8] border border-[#E2D5B7]" />
            </div>
            <div className="mt-5 h-16 rounded-2xl bg-orange-100 border border-orange-200" />
          </section>
          <section className="min-h-80 rounded-3xl border border-[#E2D5B7] bg-[#F9F5EC]/60 p-6">
            <div className="h-5 w-36 rounded-full bg-[#E2D5B7]" />
            <div className="mt-7 space-y-5">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-[#E2D5B7]" />
                  <div className="h-4 flex-1 rounded-full bg-[#FFFDF8] border border-[#E2D5B7]" />
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
