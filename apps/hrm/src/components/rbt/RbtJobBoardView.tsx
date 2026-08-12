'use client';

import React, { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Briefcase,
  MapPin,
  Clock,
  Search,
  CheckCircle2,
  Video,
  Send,
  X,
  UserRound,
  Sparkles,
  Filter,
  Shield,
  RefreshCw,
  Navigation,
  Timer,
  Languages,
  Star,
  Settings2,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import {
  applyToCaseOpening,
  saveRbtTravelProfile,
  withdrawCaseApplication,
} from '@/app/actions/caseOpeningActions';
import {
  filterJobBoardListings,
  getApplicationPresentation,
  getJobBoardEmptyKind,
  getMatchPresentation,
  getRadiusSummary,
  validateTravelPreferences,
  type JobBoardListing,
  type JobBoardTravelProfile,
  type JobBoardViewFilter,
} from '@/app/(dashboard)/rbt/job-board/jobBoardUi';

const meetTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/New_York',
});

function boroughInitial(borough: string | null) {
  if (!borough) return 'NY';
  return borough.slice(0, 2).toUpperCase();
}

function scoreTone(score: number) {
  if (score >= 85) return 'text-emerald-700 border-emerald-500/25 bg-emerald-500/10';
  if (score >= 70) return 'text-[#C2410C] border-orange-500/30 bg-orange-500/10';
  return 'text-slate-700 border-slate-300/60 bg-slate-100/80';
}

function zipBadgeTone(kind: string) {
  if (kind === 'exact') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800';
  if (kind === 'centroid') return 'border-sky-500/30 bg-sky-500/10 text-sky-800';
  if (kind === 'prefix') return 'border-amber-500/30 bg-amber-500/10 text-amber-900';
  if (kind === 'borough') return 'border-orange-500/30 bg-orange-500/10 text-orange-900';
  return 'border-slate-300/60 bg-slate-100/80 text-slate-600';
}

type RbtJobBoardViewProps = {
  openings: JobBoardListing[];
  travelProfile: JobBoardTravelProfile;
  loadError: string | null;
};

export function RbtJobBoardView({
  openings,
  travelProfile,
  loadError,
}: RbtJobBoardViewProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const searchId = useId();
  const boroughFilterId = useId();
  const applyNoteId = useId();
  const closeDialogButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [boroughFilter, setBoroughFilter] = useState('ALL');
  const [viewFilter, setViewFilter] = useState<JobBoardViewFilter>('ALL');
  const [applyTarget, setApplyTarget] = useState<JobBoardListing | null>(null);
  const [applyNote, setApplyNote] = useState('');
  const [showTravelSettings, setShowTravelSettings] = useState(false);
  const [homeZipDraft, setHomeZipDraft] = useState(travelProfile.homeZipCode || '');
  const [maxMilesDraft, setMaxMilesDraft] = useState(
    String(travelProfile.maxTravelMiles)
  );
  const [transportDraft, setTransportDraft] = useState(
    travelProfile.transportation || 'CAR'
  );
  const [travelError, setTravelError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applicationErrors, setApplicationErrors] = useState<
    Record<string, string>
  >({});
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    pendingRef.current = isPending;
  }, [isPending]);

  useEffect(() => {
    if (!applyTarget) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        setApplyTarget(null);
        setApplyError(null);
      }

      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    closeDialogButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [applyTarget]);

  const boroughs = useMemo(() => {
    const set = new Set(openings.map((o) => o.borough).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [openings]);

  const recommendedCount = openings.filter((o) => o.recommended).length;
  const appliedCount = openings.filter((o) => o.myApplication != null).length;
  const listingsMissingZip = openings.filter((o) => !o.hasListingZip).length;
  const radiusSummary = getRadiusSummary(openings, travelProfile);
  const applyMatch = applyTarget ? getMatchPresentation(applyTarget) : null;

  const filtered = useMemo(
    () =>
      filterJobBoardListings(openings, {
        searchQuery,
        boroughFilter,
        viewFilter,
      }),
    [boroughFilter, openings, searchQuery, viewFilter]
  );

  const emptyKind = getJobBoardEmptyKind({
    openingsCount: openings.length,
    filteredCount: filtered.length,
    searchQuery,
    boroughFilter,
    viewFilter,
  });

  const refreshBoard = () => {
    setActiveOperation('refresh');
    startTransition(() => router.refresh());
  };

  const closeApplyDialog = () => {
    if (isPending) return;
    setApplyTarget(null);
    setApplyError(null);
  };

  const saveTravelPreferences = () => {
    const validation = validateTravelPreferences(homeZipDraft, maxMilesDraft);
    if (!validation.success) {
      setTravelError(validation.error);
      return;
    }

    setTravelError(null);
    setActiveOperation('travel');
    startTransition(async () => {
      try {
        const res = await saveRbtTravelProfile({
          ...validation.value,
          transportation: transportDraft,
        });
        if (!res.success) {
          setTravelError(res.error || 'Travel preferences could not be saved.');
          return;
        }

        toast.success(
          'warning' in res && res.warning
            ? `Home ZIP saved with limited commute support`
            : 'Travel preferences saved'
        );
        setShowTravelSettings(false);
        router.refresh();
      } catch {
        setTravelError('Travel preferences could not be saved. Check your connection and retry.');
      }
    });
  };

  const withdrawApplication = (job: JobBoardListing) => {
    if (!job.myApplication) return;

    const applicationId = job.myApplication.id;
    setApplicationErrors((errors) => {
      const next = { ...errors };
      delete next[applicationId];
      return next;
    });
    setActiveOperation(`withdraw:${applicationId}`);
    startTransition(async () => {
      try {
        const res = await withdrawCaseApplication(applicationId);
        if (!res.success) {
          setApplicationErrors((errors) => ({
            ...errors,
            [applicationId]: res.error || 'The application could not be withdrawn.',
          }));
          return;
        }

        toast.success('Application withdrawn');
        router.refresh();
      } catch {
        setApplicationErrors((errors) => ({
          ...errors,
          [applicationId]:
            'The application could not be withdrawn. Check your connection and retry.',
        }));
      }
    });
  };

  const submitApplication = () => {
    if (!applyTarget) return;

    setApplyError(null);
    setActiveOperation(`apply:${applyTarget.id}`);
    startTransition(async () => {
      try {
        const res = await applyToCaseOpening(applyTarget.id, applyNote);
        if (!res.success) {
          setApplyError(res.error || 'The application could not be submitted.');
          return;
        }

        toast.success('Application submitted');
        setApplyTarget(null);
        setApplyNote('');
        router.refresh();
      } catch {
        setApplyError('The application could not be submitted. Check your connection and retry.');
      }
    });
  };

  return (
    <div
      className="relative mx-auto max-w-5xl animate-fade-in space-y-6 pb-12 text-slate-900"
      aria-busy={isPending}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.18),transparent_70%)]"
      />

      <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2.5">
            <Briefcase aria-hidden className="h-7 w-7 text-[#F97316]" />
            <h1 className="font-heading text-3xl font-black tracking-tight text-slate-900">
              Job Board — Find a Family
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-600">
            OPEN listings ranked by recommendation, the 99-point fit score, and estimated commute.
            Case Coordination manages the application and meet-and-greet steps.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide backdrop-blur-xl ${
            travelProfile.homeZipCode
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-900'
          }`}
        >
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              travelProfile.homeZipCode ? 'dot-live bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          {travelProfile.homeZipCode
            ? 'Fit score · commute estimated'
            : 'Fit score · commute unavailable'}
        </span>
      </div>

      {/* Stats */}
      <dl className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Open roles', value: openings.length, tone: 'orange' as const },
          { label: 'Recommended', value: recommendedCount, tone: 'amber' as const },
          {
            label: 'Estimated in radius',
            value: radiusSummary.statValue,
            tone: 'sky' as const,
          },
          {
            label: 'Home ZIP',
            value: travelProfile.homeZipCode || 'Set ZIP',
            tone: 'emerald' as const,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-white/40 bg-white/80 p-4 shadow-xl shadow-orange-500/5 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:border-[#F97316]/40 hover:shadow-2xl"
          >
            <dt className="font-mono text-[10px] font-black uppercase tracking-wider text-slate-500">
              {card.label}
            </dt>
            <dd
              className={`mt-1 font-heading text-2xl font-black ${
                card.tone === 'emerald'
                  ? 'text-emerald-700'
                  : card.tone === 'sky'
                    ? 'text-sky-700'
                    : card.tone === 'amber'
                      ? 'text-amber-700'
                      : 'text-[#F97316]'
              }`}
            >
              {card.value}
            </dd>
          </div>
        ))}
      </dl>

      {loadError && (
        <section
          role="alert"
          className="relative overflow-hidden rounded-3xl border border-rose-500/30 bg-gradient-to-br from-rose-50/95 via-white/90 to-orange-50/90 p-5 shadow-xl shadow-rose-500/10 backdrop-blur-xl"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-rose-400/15 blur-2xl"
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-700">
                <AlertCircle aria-hidden className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-heading text-base font-black text-slate-950">
                  The job board could not load
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-600">{loadError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={refreshBoard}
              disabled={isPending}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-white/90 px-4 py-2.5 text-xs font-black text-rose-800 shadow-sm transition hover:border-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden
                className={`h-3.5 w-3.5 ${
                  activeOperation === 'refresh' && isPending ? 'animate-spin' : ''
                }`}
              />
              Retry loading
            </button>
          </div>
        </section>
      )}

      {!travelProfile.homeZipCode && (
        <div className="relative flex items-start gap-3 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-amber-950">Home ZIP needed for honest commute ranking</p>
            <p className="mt-0.5 text-[11px] font-semibold text-amber-900/80">
              Fit scores can still use borough preference and hours, but distance, ETA, radius
              results, and recommendations remain unavailable until you add a home ZIP.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTravelSettings(true)}
            className="cursor-pointer rounded-xl border border-amber-500/30 bg-white/80 px-3 py-1.5 text-[11px] font-black text-amber-900 transition hover:border-[#F97316]/50"
          >
            Set ZIP
          </button>
        </div>
      )}

      {/* Travel prefs */}
      <div className="relative overflow-hidden rounded-3xl border border-orange-200/80 bg-white/85 shadow-xl shadow-orange-500/10 backdrop-blur-xl">
        <div className="flex flex-col gap-3 border-b border-orange-100/80 bg-[#FFF7ED]/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Settings2 aria-hidden className="h-4 w-4 text-[#F97316]" />
            <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[#F97316]">
              Travel preferences
            </span>
            {travelProfile.homeZipCode ? (
              <span className="font-mono text-[10px] font-bold text-slate-600">
                Estimating from {travelProfile.homeZipCode} · max {travelProfile.maxTravelMiles} mi
              </span>
            ) : (
              <span className="text-[10px] font-bold text-amber-700">
                Add ZIP to enable distance &amp; ETA estimates
              </span>
            )}
            {listingsMissingZip > 0 && (
              <span className="rounded-full border border-slate-300/60 bg-slate-100/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">
                {listingsMissingZip} listing{listingsMissingZip === 1 ? '' : 's'} missing ZIP
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowTravelSettings((v) => !v);
              setTravelError(null);
            }}
            aria-expanded={showTravelSettings}
            aria-controls="job-board-travel-settings"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-orange-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-black text-slate-800 transition hover:border-[#F97316]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
          >
            {showTravelSettings ? 'Hide' : 'Edit'} preferences
          </button>
        </div>
        {showTravelSettings && (
          <form
            id="job-board-travel-settings"
            className="grid gap-3 p-4 sm:grid-cols-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              saveTravelPreferences();
            }}
          >
            <label className="block space-y-1.5 text-xs font-bold text-slate-800">
              Home ZIP
              <input
                className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-xs font-bold text-slate-900 outline-none transition focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-orange-500/20"
                value={homeZipDraft}
                onChange={(e) => {
                  setHomeZipDraft(e.target.value.replace(/\D/g, '').slice(0, 5));
                  setTravelError(null);
                }}
                placeholder="11201"
                maxLength={5}
                inputMode="numeric"
                autoComplete="postal-code"
                aria-invalid={travelError != null}
                aria-describedby={travelError ? 'job-board-travel-error' : undefined}
                required
              />
            </label>
            <label className="block space-y-1.5 text-xs font-bold text-slate-800">
              Max miles
              <input
                className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-xs font-bold text-slate-900 outline-none transition focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-orange-500/20"
                value={maxMilesDraft}
                onChange={(e) => {
                  setMaxMilesDraft(e.target.value);
                  setTravelError(null);
                }}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                aria-invalid={travelError != null}
                aria-describedby={travelError ? 'job-board-travel-error' : undefined}
                required
              />
            </label>
            <label className="block space-y-1.5 text-xs font-bold text-slate-800">
              Transport
              <div className="relative">
                <select
                  className="w-full cursor-pointer appearance-none rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 pr-9 text-xs font-bold text-slate-900 outline-none transition focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-orange-500/20"
                  value={transportDraft}
                  onChange={(e) => setTransportDraft(e.target.value)}
                >
                  <option value="CAR">Car</option>
                  <option value="PUBLIC_TRANSIT">Public transit</option>
                  <option value="WALKING">Walking</option>
                </select>
                <ChevronDown
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                />
              </div>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isPending}
                className="w-full cursor-pointer rounded-2xl bg-[#F97316] px-3 py-2.5 text-xs font-black text-white shadow-lg transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeOperation === 'travel' && isPending
                  ? 'Saving…'
                  : 'Save & re-rank'}
              </button>
            </div>
            {travelError && (
              <p
                id="job-board-travel-error"
                role="alert"
                className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-800 sm:col-span-4"
              >
                {travelError}
              </p>
            )}
          </form>
        )}
      </div>

      {/* Filters */}
      <div className="relative space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <label htmlFor={searchId} className="sr-only">
              Search job-board listings
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              id={searchId}
              type="search"
              className="w-full rounded-2xl border border-white/50 bg-white/80 py-2.5 pl-11 pr-4 text-xs font-bold text-slate-900 shadow-sm outline-none backdrop-blur-xl transition focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-orange-500/20"
              placeholder="Search case code, borough, schedule, or BCBA…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative inline-flex items-center gap-1.5 rounded-2xl border border-white/50 bg-white/80 px-3 py-2 text-xs font-bold text-slate-700 backdrop-blur-xl">
              <Filter aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#F97316]" />
              <label htmlFor={boroughFilterId} className="hidden sm:inline">
                Borough:
              </label>
              <label htmlFor={boroughFilterId} className="sr-only sm:hidden">
                Filter by borough
              </label>
              <select
                id={boroughFilterId}
                className="cursor-pointer appearance-none bg-transparent pr-5 font-black text-[#C2410C] outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"
                value={boroughFilter}
                onChange={(e) => setBoroughFilter(e.target.value)}
              >
                <option value="ALL">All boroughs</option>
                {boroughs.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              />
            </div>
            <button
              type="button"
              onClick={refreshBoard}
              disabled={isPending}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-white/50 bg-white/80 px-3 py-2.5 text-xs font-black text-slate-700 backdrop-blur-xl transition hover:border-[#F97316]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden
                className={`h-3.5 w-3.5 ${
                  activeOperation === 'refresh' && isPending ? 'animate-spin' : ''
                }`}
              />
              {activeOperation === 'refresh' && isPending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Listing view">
          {(
            [
              { id: 'ALL', label: 'Recommended · then fit score' },
              { id: 'RECOMMENDED', label: 'Recommended only' },
              { id: 'RADIUS', label: radiusSummary.filterLabel },
              { id: 'MINE', label: `My applications (${appliedCount})` },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setViewFilter(chip.id)}
              aria-pressed={viewFilter === chip.id}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[11px] font-black transition-all backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${
                viewFilter === chip.id
                  ? 'border-[#F97316] bg-orange-500/15 text-[#C2410C]'
                  : 'border-orange-100/80 bg-white/70 text-slate-500 hover:border-[#F97316]/40'
              }`}
            >
              {chip.label}
            </button>
          ))}
          {(searchQuery || boroughFilter !== 'ALL' || viewFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setBoroughFilter('ALL');
                setViewFilter('ALL');
              }}
              className="cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-black text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="sr-only" aria-live="polite" role="status">
          {filtered.length} of {openings.length} openings shown
        </p>
      </div>

      {loadError && openings.length === 0 ? null : emptyKind ? (
        <section className="relative overflow-hidden rounded-[2rem] border border-dashed border-orange-300/80 bg-gradient-to-br from-orange-50/95 via-white/90 to-amber-50/90 p-8 text-center shadow-xl shadow-orange-500/10 backdrop-blur-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-36 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-400/20 blur-3xl"
          />
          <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-orange-200/80 bg-white/90 text-[#F97316] shadow-lg shadow-orange-500/10">
            <Briefcase aria-hidden className="h-7 w-7" />
          </div>
          <div className="relative">
            <p className="mb-2 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#C2410C]">
              RBT marketplace
            </p>
            {emptyKind === 'NO_OPEN' && (
              <>
                <h2 className="font-heading text-xl font-black text-slate-900">
                  No OPEN case openings right now
                </h2>
                <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-600">
                  Case Coordination posts minimized, role-relevant listings when a family is ready
                  to staff. There is nothing available to apply to yet.
                </p>
                <button
                  type="button"
                  onClick={refreshBoard}
                  disabled={isPending}
                  className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-orange-200 bg-white/90 px-4 py-2 text-xs font-black text-[#C2410C] shadow-sm transition hover:border-[#F97316]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                  Check for openings
                </button>
              </>
            )}
            {emptyKind === 'NO_RECOMMENDED' && (
              <>
                <h2 className="font-heading text-xl font-black text-slate-900">
                  No strong matches yet
                </h2>
                <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-600">
                  {!travelProfile.homeZipCode
                    ? 'Recommendations require a home ZIP. The fit score still reflects safe listing factors, but commute and radius gates remain unavailable.'
                    : 'A recommendation needs a fit score of at least 80 and no known commute beyond your travel max.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!travelProfile.homeZipCode) setShowTravelSettings(true);
                    setViewFilter('ALL');
                  }}
                  className="mt-4 cursor-pointer rounded-2xl border border-orange-200 bg-white px-4 py-2 text-xs font-black text-[#C2410C] transition hover:border-[#F97316]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                >
                  {travelProfile.homeZipCode ? 'Show all OPEN listings' : 'Set home ZIP'}
                </button>
              </>
            )}
            {emptyKind === 'NO_RADIUS' && (
              <>
                <h2 className="font-heading text-xl font-black text-slate-900">
                  {radiusSummary.emptyTitle}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-600">
                  {radiusSummary.emptyBody}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!travelProfile.homeZipCode) setShowTravelSettings(true);
                    setViewFilter('ALL');
                  }}
                  className="mt-4 cursor-pointer rounded-2xl border border-orange-200 bg-white px-4 py-2 text-xs font-black text-[#C2410C] transition hover:border-[#F97316]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                >
                  {travelProfile.homeZipCode ? 'Review all listings' : 'Set home ZIP'}
                </button>
              </>
            )}
            {emptyKind === 'NO_APPS' && (
              <>
                <h2 className="font-heading text-xl font-black text-slate-900">
                  You haven&apos;t applied yet
                </h2>
                <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-600">
                  Browse OPEN listings and apply when the schedule and estimated commute fit.
                  Active, rejected, and withdrawn applications will all remain visible here.
                </p>
                <button
                  type="button"
                  onClick={() => setViewFilter('ALL')}
                  className="mt-4 cursor-pointer rounded-2xl border border-orange-200 bg-white px-4 py-2 text-xs font-black text-[#C2410C] transition hover:border-[#F97316]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                >
                  Browse openings
                </button>
              </>
            )}
            {emptyKind === 'FILTERED_OUT' && (
              <>
                <h2 className="font-heading text-xl font-black text-slate-900">
                  No openings match these filters
                </h2>
                <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-600">
                  {openings.length} OPEN listing{openings.length === 1 ? '' : 's'} exist — clear
                  search or borough filter to see them.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setBoroughFilter('ALL');
                    setViewFilter('ALL');
                  }}
                  className="mt-4 cursor-pointer rounded-2xl border border-orange-200 bg-white px-4 py-2 text-xs font-black text-[#C2410C] transition hover:border-[#F97316]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((job) => {
            const status = getApplicationPresentation(job.myApplication?.status ?? null);
            const match = getMatchPresentation(job);
            const location = job.borough || 'NYC area';
            const applicationError = job.myApplication
              ? applicationErrors[job.myApplication.id]
              : null;
            const isWithdrawing =
              job.myApplication != null &&
              activeOperation === `withdraw:${job.myApplication.id}` &&
              isPending;
            const showMeetDetails =
              job.myApplication != null &&
              ['MEET_SCHEDULED', 'PARENT_PENDING'].includes(job.myApplication.status);

            return (
              <article
                key={job.id}
                aria-label={`Opening ${job.caseCode}`}
                className={`flex flex-col overflow-hidden rounded-3xl border bg-white/85 p-5 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl ${
                  job.recommended
                    ? 'border-[#F97316]/50 hover:border-[#F97316]'
                    : 'border-white/50 hover:border-[#F97316]/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-200/80 bg-orange-500/10 font-heading text-sm font-black text-[#F97316] shadow-sm"
                  >
                    {boroughInitial(job.borough)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-[11px] font-black text-[#F97316]">{job.caseCode}</p>
                      {job.recommended && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#C2410C]">
                          <Star aria-hidden className="h-2.5 w-2.5" />{' '}
                          {match.recommendationLabel}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${zipBadgeTone(job.zipMatchKind)}`}
                      >
                        <Navigation aria-hidden className="h-2.5 w-2.5" />
                        {job.zipMatchLabel}
                      </span>
                    </div>
                    <h2 className="mt-0.5 font-heading text-lg font-black text-slate-900">
                      Family support opening
                    </h2>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                      {job.ageBand || 'Age band not listed'} · {location}
                    </p>
                  </div>
                  <div
                    className={`shrink-0 rounded-2xl border px-2.5 py-1.5 text-center ${scoreTone(job.matchScore)}`}
                  >
                    <p className="font-heading text-base font-black leading-none">{match.scoreText}</p>
                    <p className="mt-0.5 text-[9px] font-black uppercase tracking-wide opacity-80">
                      {match.scoreLabel}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs font-medium leading-relaxed text-slate-600">
                  {job.matchReason}
                </p>

                {travelProfile.homeZipCode && job.distanceMiles != null && (
                  <span
                    className={`mt-2 inline-flex rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                      job.withinRadius
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800'
                        : 'border-rose-500/25 bg-rose-500/10 text-rose-800'
                    }`}
                  >
                    {job.withinRadius ? 'Estimated in radius' : 'Estimated over max'}
                  </span>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
                    <p className="flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <Navigation aria-hidden className="h-3 w-3 text-[#F97316]" /> Estimated distance
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {job.distanceMiles != null
                        ? job.distanceMiles === 0
                          ? 'Local estimate'
                          : `~${job.distanceMiles} mi`
                        : travelProfile.homeZipCode
                          ? job.hasListingZip
                            ? 'Estimate unavailable'
                            : 'Location incomplete'
                          : 'Set home ZIP'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
                    <p className="flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <Timer aria-hidden className="h-3 w-3 text-[#F97316]" /> Estimated ETA
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {job.etaMinutes != null
                        ? `~${job.etaMinutes} min`
                        : travelProfile.homeZipCode
                          ? 'Unavailable'
                          : 'Set home ZIP'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs font-semibold text-slate-700">
                  <p className="flex items-start gap-2">
                    <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
                    <span>
                      {location}
                      {job.hasListingZip ? (
                        <span className="text-slate-500"> · listing ZIP on file</span>
                      ) : (
                        <span className="text-amber-700"> · ZIP not on listing</span>
                      )}
                    </span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Clock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                    <span>
                      <span className="font-black text-slate-900">
                        {job.weeklyHours != null
                          ? `${job.weeklyHours} hrs needed`
                          : 'Hours not listed'}
                      </span>
                      {job.daysOfWeek ? ` · ${job.daysOfWeek}` : ''}
                      {job.scheduleText ? ` · ${job.scheduleText}` : ''}
                      {job.sessionLengthMinutes ? ` · ${job.sessionLengthMinutes} min` : ''}
                    </span>
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.serviceSetting && (
                    <span className="rounded-full border border-orange-100/80 bg-orange-50/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {job.serviceSetting}
                    </span>
                  )}
                  {job.languagePref && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-orange-100/80 bg-orange-50/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      <Languages aria-hidden className="h-2.5 w-2.5" /> {job.languagePref}
                    </span>
                  )}
                  {job.genderPref && (
                    <span className="rounded-full border border-orange-100/80 bg-orange-50/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      Pref: {job.genderPref}
                    </span>
                  )}
                  {job.bcbaDisplayName && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-orange-100/80 bg-orange-50/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      <UserRound aria-hidden className="h-2.5 w-2.5" /> {job.bcbaDisplayName}
                    </span>
                  )}
                </div>

                {job.myApplication && (
                  <div className={`mt-4 rounded-2xl border px-3 py-3 ${status.tone}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-black leading-snug">{status.label}</p>
                      {status.step > 0 && (
                        <span className="font-mono text-[10px] font-black opacity-70">
                          Step {status.step}/5
                        </span>
                      )}
                    </div>
                    {showMeetDetails && job.myApplication.meetAt && (
                      <p className="mt-1.5 font-mono text-[10px] font-bold opacity-80">
                        {meetTimeFormatter.format(new Date(job.myApplication.meetAt))} ET
                      </p>
                    )}
                    {showMeetDetails && job.myApplication.meetLink && (
                      <a
                        href={job.myApplication.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-black text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                      >
                        <Video aria-hidden className="h-3.5 w-3.5" /> Join video meet
                      </a>
                    )}
                    {job.myApplication.status === 'WITHDRAWN' && (
                      <p className="mt-1.5 text-[10px] font-bold opacity-80">
                        Reapplying is not available for this record. Contact Case Coordination if
                        the withdrawal was a mistake.
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-auto flex gap-2 pt-4">
                  {status.canApply ? (
                    <button
                      type="button"
                      disabled={isPending}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#F97316] py-3 text-xs font-black text-white shadow-lg transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={(event) => {
                        returnFocusRef.current = event.currentTarget;
                        setApplyTarget(job);
                        setApplyNote('');
                        setApplyError(null);
                      }}
                    >
                      <Sparkles aria-hidden className="h-3.5 w-3.5" />
                      {status.actionLabel} →
                    </button>
                  ) : status.canWithdraw && job.myApplication ? (
                    <button
                      type="button"
                      disabled={isPending}
                      aria-describedby={
                        applicationError
                          ? `application-error-${job.myApplication.id}`
                          : undefined
                      }
                      className="flex-1 cursor-pointer rounded-2xl border border-slate-200/80 bg-slate-50/90 py-3 text-xs font-black text-slate-700 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => withdrawApplication(job)}
                    >
                      {isWithdrawing ? 'Withdrawing…' : status.actionLabel}
                    </button>
                  ) : (
                    <div
                      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3 text-center text-xs font-black ${
                        job.myApplication?.status === 'APPROVED'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
                          : 'border-slate-200/80 bg-slate-50/90 text-slate-600'
                      }`}
                    >
                      {job.myApplication?.status === 'APPROVED' ? (
                        <CheckCircle2 aria-hidden className="h-4 w-4" />
                      ) : (
                        <Shield aria-hidden className="h-4 w-4" />
                      )}
                      {status.actionLabel}
                    </div>
                  )}
                </div>
                {applicationError && job.myApplication && (
                  <p
                    id={`application-error-${job.myApplication.id}`}
                    role="alert"
                    className="mt-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-800"
                  >
                    {applicationError}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {applyTarget && applyMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeApplyDialog();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-orange-200/80 bg-white/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="border-b border-orange-100/80 bg-[#FFF7ED]/95 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                    <Shield aria-hidden className="h-3 w-3" />
                    Privacy-minimized · {applyMatch.scoreText} fit score
                  </div>
                  <p className="font-mono text-xs font-black text-[#F97316]">{applyTarget.caseCode}</p>
                  <h3
                    id={dialogTitleId}
                    className="mt-1 font-heading text-2xl font-black text-slate-900"
                  >
                    Apply to this case
                  </h3>
                  <p
                    id={dialogDescriptionId}
                    className="mt-1 text-xs font-semibold text-slate-600"
                  >
                    {applyTarget.ageBand || 'Age band not listed'} ·{' '}
                    {applyTarget.borough || 'NYC area'} ·{' '}
                    {applyTarget.hasListingZip ? 'listing ZIP on file' : 'listing ZIP unavailable'}
                  </p>
                  <p className="mt-1 font-mono text-[10px] font-bold text-slate-500">
                    {applyTarget.zipMatchLabel} · commute values are estimates
                  </p>
                </div>
                <button
                  ref={closeDialogButtonRef}
                  type="button"
                  aria-label="Close application dialog"
                  disabled={isPending}
                  className="cursor-pointer rounded-xl border border-orange-100/80 p-2 text-slate-500 transition hover:border-[#F97316]/40 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={closeApplyDialog}
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
                  <p className="font-mono text-[10px] font-black uppercase text-slate-500">
                    Est. distance
                  </p>
                  <p className="mt-0.5 font-black text-slate-900">
                    {applyTarget.distanceMiles != null
                      ? applyTarget.distanceMiles === 0
                        ? 'Local estimate'
                        : `~${applyTarget.distanceMiles} mi`
                      : travelProfile.homeZipCode
                        ? 'Unavailable'
                        : 'Set home ZIP'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
                  <p className="font-mono text-[10px] font-black uppercase text-slate-500">
                    Est. ETA
                  </p>
                  <p className="mt-0.5 font-black text-slate-900">
                    {applyTarget.etaMinutes != null
                      ? `~${applyTarget.etaMinutes} min`
                      : 'Unavailable'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2.5">
                  <p className="font-mono text-[10px] font-black uppercase text-slate-500">Hours</p>
                  <p className="mt-0.5 font-black text-slate-900">
                    {applyTarget.weeklyHours != null
                      ? `${applyTarget.weeklyHours} / wk`
                      : 'Not listed'}
                  </p>
                </div>
              </div>

              <label
                htmlFor={applyNoteId}
                className="block text-xs font-black text-slate-800"
              >
                Note to Case Coordination{' '}
                <span className="font-semibold text-slate-500">(optional)</span>
              </label>
              <textarea
                id={applyNoteId}
                className="min-h-[110px] w-full rounded-2xl border border-orange-100/80 bg-slate-50/90 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#F97316] focus-visible:ring-2 focus-visible:ring-orange-500/20"
                placeholder="Share relevant availability or fit details…"
                value={applyNote}
                onChange={(e) => {
                  setApplyNote(e.target.value);
                  setApplyError(null);
                }}
                maxLength={1000}
                aria-describedby={applyError ? 'job-board-apply-error' : undefined}
              />

              {applyError && (
                <p
                  id="job-board-apply-error"
                  role="alert"
                  className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-800"
                >
                  {applyError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={isPending}
                  className="cursor-pointer rounded-2xl border border-orange-100/80 px-4 py-3 text-xs font-black text-slate-600 transition hover:border-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[100px]"
                  onClick={closeApplyDialog}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#F97316] py-3 text-xs font-black text-white shadow-lg transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={submitApplication}
                >
                  <Send aria-hidden className="h-4 w-4" />{' '}
                  {activeOperation === `apply:${applyTarget.id}` && isPending
                    ? 'Submitting…'
                    : 'Submit application'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

