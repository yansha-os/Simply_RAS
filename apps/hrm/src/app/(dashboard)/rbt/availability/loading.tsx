import { Clock3, ShieldCheck } from 'lucide-react';

export default function RbtAvailabilityLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-[#E2D5B7] bg-[#FFFDF8] p-7 text-slate-900 shadow-xl sm:p-10"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.05),_transparent_48%)]" />
      <div className="relative flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-200 bg-orange-100 text-[#F97316]">
          <Clock3 className="h-7 w-7 animate-pulse" aria-hidden="true" />
        </div>
        <div>
          <p className="font-heading text-lg font-black text-slate-900">Loading weekly availability</p>
          <p className="mt-1 text-xs font-medium text-slate-600">
            Verifying your RBT identity and reading the database…
          </p>
        </div>
        <ShieldCheck
          className="ml-auto hidden h-7 w-7 text-emerald-600 sm:block"
          aria-hidden="true"
        />
      </div>
      <div className="relative mt-8 grid animate-pulse gap-3 sm:grid-cols-3">
        <div className="h-28 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC]" />
        <div className="h-28 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC]" />
        <div className="h-28 rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC]" />
      </div>
      <span className="sr-only">Loading availability from the database.</span>
    </div>
  );
}
