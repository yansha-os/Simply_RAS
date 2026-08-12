'use client';

import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Briefcase,
  Bus,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Edit3,
  Loader2,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  getMyRbtAvailability,
  saveMyRbtAvailability,
} from '@/app/(dashboard)/rbt/availability/actions';
import {
  AVAILABILITY_DAYS,
  AVAILABILITY_HOURS,
  AVAILABILITY_START_MINUTE,
  AVAILABILITY_TIME_ZONE,
  NYC_BOROUGHS,
  buildAvailabilityPayload,
  countAvailabilityHours,
  emptyAvailabilityGrid,
  type AvailabilityBorough,
  type AvailabilityGrid,
  type AvailabilityResult,
  type AvailabilitySnapshot,
  type AvailabilityTransport,
} from '@/app/(dashboard)/rbt/availability/availabilityModel';

const TRANSPORT_OPTIONS = [
  { id: 'CAR' as const, label: 'Personal car', shortLabel: 'Car', icon: Car },
  {
    id: 'PUBLIC_TRANSIT' as const,
    label: 'Public transit',
    shortLabel: 'Transit',
    icon: Bus,
  },
  {
    id: 'WALKING' as const,
    label: 'Walking or bicycle',
    shortLabel: 'Walk / Bike',
    icon: MapPin,
  },
] as const;

function cloneGrid(grid: AvailabilityGrid): AvailabilityGrid {
  return grid.map((day) => [...day]);
}

function transportLabel(transport: AvailabilityTransport): string {
  return (
    TRANSPORT_OPTIONS.find((option) => option.id === transport)?.label ?? 'Personal car'
  );
}

function formatMinute(minute: number): string {
  const hour24 = Math.floor(minute / 60);
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:00 ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

function formatSavedAt(value: string | null): string {
  if (!value) return 'Database timestamp unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: AVAILABILITY_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function StatePanel({
  icon,
  eyebrow,
  title,
  detail,
  busy,
  onRetry,
}: {
  icon: 'lock' | 'warning';
  eyebrow: string;
  title: string;
  detail: string;
  busy: boolean;
  onRetry: () => void;
}) {
  const Icon = icon === 'lock' ? LockKeyhole : AlertTriangle;

  return (
    <section className="relative mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-7 text-white shadow-2xl shadow-slate-950/30 sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.22),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.14),_transparent_45%)]" />
      <div className="relative flex flex-col items-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-300 shadow-xl shadow-orange-950/20">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </div>
        <span className="rounded-full border border-orange-400/20 bg-orange-500/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-orange-200">
          {eyebrow}
        </span>
        <h1 className="mt-4 font-heading text-2xl font-black tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-300">{detail}</p>
        <div className="mt-7 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-orange-950/30 transition-all duration-300 hover:scale-[1.01] hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {busy ? 'Checking profile…' : 'Try again'}
          </button>
          <Link
            href="/rbt"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-black text-slate-100 transition-all duration-300 hover:border-orange-400/40 hover:bg-white/10"
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            My Tasks
          </Link>
        </div>
      </div>
    </section>
  );
}

export function RbtAvailabilityView({
  initialResult,
}: {
  initialResult: AvailabilityResult;
}) {
  const initialSnapshot = initialResult.success ? initialResult.data : null;
  const [snapshot, setSnapshot] = useState<AvailabilitySnapshot | null>(initialSnapshot);
  const [loadError, setLoadError] = useState<string | null>(
    initialResult.success ? null : initialResult.error
  );
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [showGridEditor, setShowGridEditor] = useState(
    Boolean(
      initialSnapshot?.canPersist &&
        initialSnapshot.canEdit &&
        !initialSnapshot.saved
    )
  );

  const [grid, setGrid] = useState<AvailabilityGrid>(() =>
    cloneGrid(initialSnapshot?.grid ?? emptyAvailabilityGrid())
  );
  const [transportation, setTransportation] = useState<AvailabilityTransport>(
    initialSnapshot?.transportation ?? 'CAR'
  );
  const [selectedBoroughs, setSelectedBoroughs] = useState<AvailabilityBorough[]>(
    initialSnapshot?.preferredBoroughs ?? []
  );
  const [maxDistance, setMaxDistance] = useState(
    initialSnapshot?.maxTravelMiles ?? 10
  );

  const dragState = useRef<{ active: boolean; value: boolean }>({
    active: false,
    value: true,
  });
  const refreshSequence = useRef(0);
  const selectedHours = useMemo(() => countAvailabilityHours(grid), [grid]);

  const applySnapshot = useCallback((next: AvailabilitySnapshot, closeEditor = false) => {
    setSnapshot(next);
    setGrid(cloneGrid(next.grid));
    setTransportation(next.transportation);
    setSelectedBoroughs(next.preferredBoroughs);
    setMaxDistance(next.maxTravelMiles);
    setFormError(null);
    setShowGridEditor(closeEditor ? false : next.canPersist && next.canEdit && !next.saved);
  }, []);

  const reloadAvailability = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setRefreshing(true);
    setLoadError(null);

    try {
      const result = await getMyRbtAvailability();
      if (sequence !== refreshSequence.current) return;
      if (!result.success) {
        setSnapshot(null);
        setLoadError(result.error);
        return;
      }
      applySnapshot(result.data);
      setAnnouncement('Availability refreshed from the database.');
    } catch {
      if (sequence !== refreshSequence.current) return;
      setSnapshot(null);
      setLoadError('Availability could not be loaded. Please try again.');
    } finally {
      if (sequence === refreshSequence.current) setRefreshing(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const stopDragging = () => {
      dragState.current.active = false;
    };
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

  useEffect(() => {
    const reloadOwnedProfile = () => {
      setSnapshot(null);
      void reloadAvailability();
    };
    window.addEventListener('ras_applicant_session_changed', reloadOwnedProfile);
    window.addEventListener('rbt_clearance_changed', reloadOwnedProfile);
    window.addEventListener('rbt_progress_synced', reloadOwnedProfile);
    return () => {
      window.removeEventListener('ras_applicant_session_changed', reloadOwnedProfile);
      window.removeEventListener('rbt_clearance_changed', reloadOwnedProfile);
      window.removeEventListener('rbt_progress_synced', reloadOwnedProfile);
    };
  }, [reloadAvailability]);

  const setCell = useCallback((dayIndex: number, hourIndex: number, value: boolean) => {
    setGrid((current) => {
      const next = cloneGrid(current);
      next[dayIndex][hourIndex] = value;
      return next;
    });
    setFormError(null);
  }, []);

  const handleCellPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    dayIndex: number,
    hourIndex: number
  ) => {
    if (event.button !== 0) return;
    const value = !grid[dayIndex][hourIndex];
    dragState.current = { active: true, value };
    setCell(dayIndex, hourIndex, value);
  };

  const handleCellPointerEnter = (dayIndex: number, hourIndex: number) => {
    if (!dragState.current.active) return;
    setCell(dayIndex, hourIndex, dragState.current.value);
  };

  const presetAfternoons = () => {
    setGrid(
      Array.from({ length: AVAILABILITY_DAYS.length }, (_, dayIndex) =>
        Array.from(
          { length: AVAILABILITY_HOURS.length },
          (_, hourIndex) => dayIndex < 5 && hourIndex >= 4 && hourIndex <= 10
        )
      )
    );
    setFormError(null);
    setAnnouncement('Selected Monday through Friday, 12 PM to 7 PM Eastern Time.');
    toast.success('Selected Mon–Fri, 12 PM–7 PM ET');
  };

  const clearGrid = () => {
    setGrid(emptyAvailabilityGrid());
    setFormError(null);
    setAnnouncement('Availability grid cleared.');
    toast.info('Availability grid cleared');
  };

  const toggleBorough = (borough: AvailabilityBorough) => {
    setSelectedBoroughs((current) =>
      current.includes(borough)
        ? current.filter((item) => item !== borough)
        : [...current, borough]
    );
    setFormError(null);
  };

  const cancelEditing = () => {
    if (!snapshot) return;
    applySnapshot(snapshot, true);
    setAnnouncement('Unsaved changes discarded. Showing the database version.');
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !snapshot?.canPersist || !snapshot.canEdit) return;

    if (selectedHours === 0) {
      const error = 'Select at least one open hour before saving.';
      setFormError(error);
      toast.error(error);
      return;
    }
    if (selectedBoroughs.length === 0) {
      const error = 'Select at least one preferred borough.';
      setFormError(error);
      toast.error(error);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const result = await saveMyRbtAvailability({
        availability: buildAvailabilityPayload(grid),
        preferredBoroughs: selectedBoroughs,
        transportation,
        maxTravelMiles: maxDistance,
      });
      if (!result.success) {
        setFormError(result.error);
        toast.error(result.error);
        return;
      }

      applySnapshot(result.data, true);
      setAnnouncement('Availability saved and confirmed in the database.');
      window.dispatchEvent(new Event('rbt_availability_changed'));
      toast.success(
        result.data.isHired
          ? 'Availability saved to your active RBT profile.'
          : 'Availability saved. The Job Board remains locked until HR marks you hired.'
      );
    } catch {
      const error =
        'Save status could not be confirmed. Reload this profile before making another change.';
      setFormError(error);
      toast.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!snapshot) {
    return (
      <StatePanel
        icon="lock"
        eyebrow="Secure RBT profile"
        title="Availability profile not connected"
        detail={
          loadError ??
          'Open your applicant magic link on this device or sign in with your linked RBT account.'
        }
        busy={refreshing}
        onRetry={() => void reloadAvailability()}
      />
    );
  }

  if (!snapshot.canPersist) {
    return (
      <StatePanel
        icon="warning"
        eyebrow="Database profile required"
        title="Onboarding packet unavailable"
        detail="Your RBT identity is verified, but there is no CandidateOnboardingPacket to hold availability. Ask HR to restore the packet; this screen will not pretend a local draft was saved."
        busy={refreshing}
        onRetry={() => void reloadAvailability()}
      />
    );
  }

  if (!snapshot.canEdit) {
    return (
      <StatePanel
        icon="lock"
        eyebrow={`ATS stage · ${snapshot.stage}`}
        title="Availability is locked"
        detail="This application is closed. Existing availability remains in the database, but changes require HR assistance."
        busy={refreshing}
        onRetry={() => void reloadAvailability()}
      />
    );
  }

  if (snapshot.saved && !showGridEditor) {
    return (
      <main className="relative mx-auto max-w-4xl space-y-5 text-white">
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_48%)]" />
        <section className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-slate-950 p-6 shadow-2xl shadow-emerald-950/20 sm:p-9">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-orange-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-7">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-300 shadow-lg shadow-emerald-950/30">
                  <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                      <span className="dot-live h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Persisted in DB
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
                      {snapshot.isHired ? 'Active RBT' : `ATS · ${snapshot.stage}`}
                    </span>
                  </div>
                  <h1 className="mt-3 font-heading text-2xl font-black tracking-tight sm:text-3xl">
                    Weekly availability on file
                  </h1>
                  <p className="mt-2 text-sm font-medium text-slate-300">
                    {selectedHours} open hour{selectedHours === 1 ? '' : 's'} ·{' '}
                    {selectedBoroughs.join(', ')} · {transportLabel(transportation)} · max{' '}
                    {maxDistance} mi
                  </p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Recurring wall-clock schedule · America/New_York · updated{' '}
                    {formatSavedAt(snapshot.updatedAt)}
                  </p>
                </div>
              </div>
              <ShieldCheck
                className="hidden h-8 w-8 shrink-0 text-emerald-300/70 sm:block"
                aria-hidden="true"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035] p-2">
              <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center">
                <caption className="sr-only">
                  Persisted weekly availability. Green cells are open one-hour windows in
                  Eastern Time.
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500"
                    >
                      ET
                    </th>
                    {AVAILABILITY_DAYS.map((day) => (
                      <th
                        key={day}
                        scope="col"
                        className="px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-slate-400"
                      >
                        {day.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AVAILABILITY_HOURS.map((hour, hourIndex) => (
                    <tr key={hour}>
                      <th
                        scope="row"
                        className="whitespace-nowrap px-2 py-1 text-right font-mono text-[9px] font-bold text-slate-500"
                      >
                        {hour}
                      </th>
                      {AVAILABILITY_DAYS.map((day, dayIndex) => {
                        const open = grid[dayIndex][hourIndex];
                        return (
                          <td key={`${day}-${hour}`} className="p-0.5">
                            <span
                              aria-label={`${day} ${hour}: ${open ? 'open' : 'unavailable'}`}
                              className={`mx-auto block h-2.5 w-full max-w-8 rounded-sm ${
                                open
                                  ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]'
                                  : 'bg-white/10'
                              }`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowGridEditor(true)}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3.5 text-sm font-black text-white shadow-xl shadow-orange-950/30 transition-all duration-300 hover:scale-[1.01] hover:bg-orange-400"
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                Edit availability
              </button>
              <Link
                href="/rbt"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-black text-slate-100 transition-all duration-300 hover:border-orange-400/40 hover:bg-white/10"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                My Tasks
              </Link>
              {snapshot.isHired ? (
                <Link
                  href="/rbt/job-board"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-3.5 text-sm font-black text-emerald-100 transition-all duration-300 hover:scale-[1.01] hover:border-emerald-300/40 hover:bg-emerald-400/15"
                >
                  <Briefcase className="h-4 w-4" aria-hidden="true" />
                  Job Board
                </Link>
              ) : (
                <div
                  role="status"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-5 py-3.5 text-sm font-black text-amber-100"
                >
                  <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                  Job Board unlocks at HIRED
                </div>
              )}
            </div>
          </div>
        </section>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </main>
    );
  }

  return (
    <main className="relative mx-auto max-w-6xl space-y-6 pb-12 text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.18),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.12),_transparent_48%)]" />

      <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-xl shadow-orange-950/40">
              <Clock3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-orange-200">
                  America/New_York
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
                  {snapshot.isHired ? 'Active RBT' : `ATS · ${snapshot.stage}`}
                </span>
              </div>
              <h1 className="mt-3 font-heading text-2xl font-black tracking-tight sm:text-3xl">
                Weekly availability
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-300">
                Set recurring Eastern Time windows for staffing and case matching. Changes
                count as saved only after the server confirms the database write.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              Open time
            </p>
            <p className="mt-1 font-heading text-xl font-black text-orange-300">
              {selectedHours} hr
            </p>
          </div>
        </div>
      </header>

      {snapshot.needsRepair && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3.5 text-sm font-semibold text-amber-100 shadow-lg shadow-amber-950/10"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            The database says this step was complete, but its schedule or travel profile is
            incomplete. Review and save to repair the persisted record.
          </span>
        </div>
      )}

      <form
        onSubmit={handleSave}
        aria-busy={saving}
        className="space-y-6"
        noValidate
      >
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-2xl shadow-slate-950/20 transition-all duration-300 hover:border-orange-400/25">
          <div className="flex flex-col justify-between gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:p-7">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-lg font-black">
                <Sparkles className="h-5 w-5 text-orange-300" aria-hidden="true" />
                Recurring hourly windows
              </h2>
              <p id="availability-grid-help" className="mt-1 text-xs font-medium text-slate-400">
                Each cell is a half-open one-hour window in ET; for example, 8 PM means
                8:00–9:00 PM. New York daylight-saving changes apply automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={presetAfternoons}
                className="cursor-pointer rounded-xl border border-orange-300/25 bg-orange-400/10 px-3.5 py-2 text-xs font-black text-orange-200 transition-all duration-300 hover:border-orange-300/50 hover:bg-orange-400/15"
              >
                Mon–Fri · 12–7 PM
              </button>
              <button
                type="button"
                onClick={clearGrid}
                className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-black text-slate-300 transition-all duration-300 hover:border-white/20 hover:bg-white/10"
              >
                Clear grid
              </button>
            </div>
          </div>

          <div className="overflow-x-auto p-3 sm:p-5">
            <table
              className="w-full min-w-[720px] border-separate border-spacing-1"
              aria-describedby="availability-grid-help"
            >
              <caption className="sr-only">
                Select the one-hour windows when you are available each week in Eastern Time.
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-24 rounded-xl bg-white/5 p-2 font-mono text-[10px] font-black uppercase tracking-wider text-slate-500"
                  >
                    Time · ET
                  </th>
                  {AVAILABILITY_DAYS.map((day) => (
                    <th
                      key={day}
                      scope="col"
                      className="rounded-xl bg-sky-400/[0.07] p-2.5 font-heading text-xs font-black text-slate-200"
                    >
                      {day.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AVAILABILITY_HOURS.map((hour, hourIndex) => (
                  <tr key={hour}>
                    <th
                      scope="row"
                      className="rounded-xl bg-white/[0.035] p-2 text-right font-mono text-[10px] font-bold text-slate-400"
                    >
                      {hour}
                    </th>
                    {AVAILABILITY_DAYS.map((day, dayIndex) => {
                      const selected = grid[dayIndex][hourIndex];
                      const endMinute = AVAILABILITY_START_MINUTE + (hourIndex + 1) * 60;
                      return (
                        <td key={`${day}-${hour}`} className="p-0">
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${day}, ${hour} to ${formatMinute(endMinute)} Eastern Time: ${
                              selected ? 'open' : 'unavailable'
                            }`}
                            onPointerDown={(event) =>
                              handleCellPointerDown(event, dayIndex, hourIndex)
                            }
                            onPointerEnter={() =>
                              handleCellPointerEnter(dayIndex, hourIndex)
                            }
                            onClick={(event) => {
                              if (event.detail === 0) {
                                setCell(dayIndex, hourIndex, !selected);
                              }
                            }}
                            onDragStart={(event) => event.preventDefault()}
                            className={`min-h-10 w-full cursor-pointer rounded-xl border px-1 py-2 font-mono text-[9px] font-black transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                              selected
                                ? 'border-emerald-300/45 bg-emerald-400 text-emerald-950 shadow-[0_0_16px_rgba(52,211,153,0.24)] hover:bg-emerald-300'
                                : 'border-white/[0.07] bg-white/[0.035] text-transparent hover:border-orange-300/30 hover:bg-orange-400/10'
                            }`}
                          >
                            {selected ? 'OPEN' : '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <fieldset className="rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:border-orange-400/25 hover:shadow-2xl">
            <legend className="px-2 font-heading text-base font-black text-white">
              Transportation &amp; radius
            </legend>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Used only for travel-aware case matching.
            </p>

            <div
              role="radiogroup"
              aria-label="Primary transportation mode"
              className="mt-5 grid grid-cols-3 gap-2"
            >
              {TRANSPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = transportation === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={option.label}
                    onClick={() => {
                      setTransportation(option.id);
                      setFormError(null);
                    }}
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-3 text-xs font-black transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      active
                        ? 'border-orange-300/60 bg-orange-500 text-white shadow-xl shadow-orange-950/30'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-orange-300/30 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{option.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="availability-travel-radius" className="text-xs font-bold text-slate-300">
                  Maximum travel distance
                </label>
                <output
                  htmlFor="availability-travel-radius"
                  className="rounded-lg border border-orange-300/20 bg-orange-400/10 px-2.5 py-1 font-mono text-xs font-black text-orange-200"
                >
                  {maxDistance} mi
                </output>
              </div>
              <input
                id="availability-travel-radius"
                type="range"
                min={3}
                max={25}
                step={1}
                value={maxDistance}
                onChange={(event) => {
                  setMaxDistance(Number(event.target.value));
                  setFormError(null);
                }}
                className="w-full cursor-pointer accent-orange-500"
              />
              <div
                aria-hidden="true"
                className="mt-1 flex justify-between font-mono text-[9px] text-slate-600"
              >
                <span>3 mi</span>
                <span>25 mi</span>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:border-orange-400/25 hover:shadow-2xl">
            <legend className="px-2 font-heading text-base font-black text-white">
              Preferred NYC boroughs
            </legend>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Select every borough where you are willing to accept a case.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {NYC_BOROUGHS.map((borough) => {
                const active = selectedBoroughs.includes(borough);
                return (
                  <button
                    key={borough}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleBorough(borough)}
                    className={`cursor-pointer rounded-2xl border px-4 py-3 text-xs font-black transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      active
                        ? 'border-orange-300/60 bg-orange-500 text-white shadow-lg shadow-orange-950/30'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-orange-300/30 hover:bg-white/10'
                    }`}
                  >
                    {active ? `✓ ${borough}` : `+ ${borough}`}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3.5 text-sm font-semibold text-rose-100"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex flex-col justify-end gap-3 sm:flex-row">
          {snapshot.saved && (
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/15 bg-slate-950 px-6 py-4 text-sm font-black text-slate-200 transition-all duration-300 hover:border-white/25 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Discard changes
            </button>
          )}
          <button
            type="submit"
            disabled={saving || refreshing}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-500 px-8 py-4 text-sm font-black text-white shadow-2xl shadow-orange-950/35 transition-all duration-300 hover:scale-[1.01] hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-5 w-5" aria-hidden="true" />
            )}
            {saving ? 'Saving to database…' : 'Save availability'}
          </button>
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}
