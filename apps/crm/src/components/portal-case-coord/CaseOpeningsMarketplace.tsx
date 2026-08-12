'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Briefcase,
  MapPin,
  Clock,
  Video,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Plus,
  ExternalLink,
  Users,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  closeCaseOpening,
  createCaseOpening,
  listCaseOpeningsForCaseCoord,
  recordParentApplicationAcceptance,
  recordParentApplicationDecline,
  sendApplicationStaffMessage,
  sendParentCaseMessage,
  updateCaseApplicationStatus,
} from '@/app/actions/caseOpeningActions';
import StaffingReadinessChecklist from '@/components/portal-case-coord/StaffingReadinessChecklist';
import {
  ApplicationFlowBar,
  APPLICATION_STATUS_STYLES,
  countNewApplications,
  sortApplicationsByInboxPriority,
} from '@/components/portal-case-coord/ApplicationFlowBar';
import { getStaffingReadiness } from '@/lib/staffingReadiness';

type Opening = {
  id: string;
  caseCode: string;
  status: string;
  weeklyHours: number | null;
  borough: string | null;
  scheduleText: string | null;
  daysOfWeek?: string | null;
  clientInitials: string | null;
  ageBand: string | null;
  bcbaDisplayName: string | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    status: string;
    guardianName: string | null;
    bcbaId: string | null;
    rbtId: string | null;
    rbtApproved: boolean;
    caseCoordinatorId: string | null;
    treatmentPlan?: unknown;
    paRequests?: Array<{ type?: string | null; status?: string | null }>;
  };
  applications: Array<{
    id: string;
    status: string;
    message: string | null;
    meetAt: string | Date | null;
    meetLink: string | null;
    createdAt?: string | Date | null;
    rbt: { id: string; firstName: string; lastName: string; email: string };
  }>;
};

function serializeOpenings(rows: Opening[]): Opening[] {
  return rows.map((o) => ({
    ...o,
    applications: sortApplicationsByInboxPriority(
      (o.applications || []).map((a) => ({
        ...a,
        meetAt: a.meetAt
          ? typeof a.meetAt === 'string'
            ? a.meetAt
            : new Date(a.meetAt).toISOString()
          : null,
        createdAt: a.createdAt
          ? typeof a.createdAt === 'string'
            ? a.createdAt
            : new Date(a.createdAt).toISOString()
          : null,
      }))
    ),
  }));
}

type EligibleClient = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  childAge: number | null;
  bcbaId: string | null;
  caseCoordinatorId: string | null;
  treatmentPlan?: unknown;
  paRequests?: Array<{ type?: string | null; status?: string | null }>;
  bcba: { firstName: string; lastName: string } | null;
  caseOpenings: Array<{ id: string; caseCode: string; status?: string }>;
};

export default function CaseOpeningsMarketplace({
  openings: initialOpenings,
  eligibleClients,
}: {
  openings: Opening[];
  eligibleClients: EligibleClient[];
}) {
  const [openings, setOpenings] = useState(() => serializeOpenings(initialOpenings));
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    initialOpenings.find((o) => o.status === 'OPEN')?.id ?? initialOpenings[0]?.id ?? null
  );
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());

  const [showCreate, setShowCreate] = useState(false);
  const [createClientId, setCreateClientId] = useState('');
  const [hoursNeeded, setHoursNeeded] = useState('12');
  const [borough, setBorough] = useState('Brooklyn');
  const [languagePref, setLanguagePref] = useState('English');
  const [genderPref, setGenderPref] = useState('No preference');
  const [serviceSetting, setServiceSetting] = useState('In-home ABA (97153)');

  const [rbtMsg, setRbtMsg] = useState('');
  const [parentMsg, setParentMsg] = useState('');
  const [meetAt, setMeetAt] = useState('');

  const softRefresh = (opts?: { silent?: boolean }) => {
    startTransition(async () => {
      const res = await listCaseOpeningsForCaseCoord();
      if (!res.success) {
        if (!opts?.silent) toast.error(res.error || 'Failed to refresh applicants');
        return;
      }
      const next = serializeOpenings(res.openings as Opening[]);
      setOpenings(next);
      setLastSyncedAt(new Date());
      if (!opts?.silent) toast.success('Applicants refreshed');
    });
  };

  useEffect(() => {
    // Router refreshes replace the server snapshot; local transition updates
    // continue to use component state between those snapshots.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenings(serializeOpenings(initialOpenings));
  }, [initialOpenings]);

  // HRM apply cannot revalidate CRM — poll + refresh on focus so APPLIED apps appear.
  useEffect(() => {
    const onFocus = () => softRefresh({ silent: true });
    const onVis = () => {
      if (document.visibilityState === 'visible') softRefresh({ silent: true });
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    const timer = window.setInterval(() => softRefresh({ silent: true }), 25000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(timer);
    };
  }, []);

  const selected = useMemo(
    () => openings.find((o) => o.id === selectedOpeningId) ?? null,
    [openings, selectedOpeningId]
  );

  const selectedApp = useMemo(() => {
    if (!selected) return null;
    if (selectedAppId) return selected.applications.find((a) => a.id === selectedAppId) ?? null;
    return selected.applications[0] ?? null;
  }, [selected, selectedAppId]);

  const creatableClients = eligibleClients.filter(
    (c) =>
      c.caseOpenings.length === 0 &&
      (c.status === 'STAFFING_PENDING' || c.status === 'ACTIVE') &&
      (c.status === 'ACTIVE' || getStaffingReadiness(c).ready)
  );

  const selectedCreateClient = creatableClients.find((c) => c.id === createClientId) ?? null;
  const inboxNewCount = useMemo(
    () => openings.reduce((n, o) => n + countNewApplications(o.applications), 0),
    [openings]
  );

  const refreshFromServer = () => softRefresh({ silent: false });

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-6">
        <div className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-brand-orange-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-brand-orange-400" />
              Case Job Openings
              {inboxNewCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
                  <span className="dot-live" />
                  {inboxNewCount} new
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
              Post Indeed-style openings for families needing an RBT. HRM Job Board applications land here as{' '}
              <span className="text-sky-300">APPLIED</span> — message, meet, then parent decide. Parent accept assigns
              the RBT; ACTIVE still needs a first Session.
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              Synced {lastSyncedAt.toLocaleTimeString()} · auto-refresh while this page is open
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => softRefresh({ silent: false })}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-all hover:border-brand-orange-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              Refresh inbox
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-orange-500/40 bg-brand-orange-500/10 px-4 py-2.5 text-sm font-semibold text-brand-orange-300 transition-all hover:border-brand-orange-500/70 hover:bg-brand-orange-500/20"
            >
              <Plus className="h-4 w-4" />
              Post opening
            </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/90 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-orange-400" />
            New job opening
          </h2>
          {creatableClients.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No eligible clients. Need <span className="text-zinc-200">STAFFING_PENDING</span> with full readiness
              (signed TP, Treatment PA, BCBA, schedule prefs) and no open listing yet. Prefer posting from the
              client Scheduling &amp; Job Board tab for the full checklist.
            </p>
          ) : (
            <>
            <p className="text-xs text-zinc-500">
              For the full weekly schedule grid (from client preferred times), post from the client&apos;s Scheduling &amp;
              Job Board tab. This quick post covers hours and prefs only.
            </p>
            {selectedCreateClient && (
              <StaffingReadinessChecklist client={selectedCreateClient} compact />
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-zinc-400 space-y-1.5 block">
                Client (CRM only — board stays de-identified)
                <select
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500"
                  value={createClientId}
                  onChange={(e) => setCreateClientId(e.target.value)}
                >
                  <option value="">Select client…</option>
                  {creatableClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} · {c.status}
                      {c.bcba ? ` · BCBA ${c.bcba.firstName}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-zinc-400 space-y-1.5 block">
                Hours needed
                <input
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500"
                  value={hoursNeeded}
                  onChange={(e) => setHoursNeeded(e.target.value)}
                />
              </label>
              <label className="text-xs text-zinc-400 space-y-1.5 block">
                Borough
                <select
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500"
                  value={borough}
                  onChange={(e) => setBorough(e.target.value)}
                >
                  {['Brooklyn', 'Queens', 'Manhattan', 'Bronx', 'Staten Island'].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-zinc-400 space-y-1.5 block">
                Service setting
                <select
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500"
                  value={serviceSetting}
                  onChange={(e) => setServiceSetting(e.target.value)}
                >
                  {[
                    'In-home ABA (97153)',
                    'Community-based ABA',
                    'Clinic / center-based',
                    'Hybrid (home + community)',
                  ].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-zinc-400 space-y-1.5 block">
                Language preference
                <select
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500"
                  value={languagePref}
                  onChange={(e) => setLanguagePref(e.target.value)}
                >
                  {['English', 'Spanish', 'Mandarin', 'Cantonese', 'Russian', 'Arabic', 'Bengali', 'Haitian Creole', 'Other'].map(
                    (opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label className="text-xs text-zinc-400 space-y-1.5 block">
                RBT gender preference
                <select
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500"
                  value={genderPref}
                  onChange={(e) => setGenderPref(e.target.value)}
                >
                  {['No preference', 'Female', 'Male'].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || !createClientId}
              className="cursor-pointer rounded-lg bg-brand-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                startTransition(async () => {
                  const res = await createCaseOpening({
                    clientId: createClientId,
                    expectedCaseCoordinatorId:
                      selectedCreateClient?.caseCoordinatorId ?? null,
                    weeklyHours: Number(hoursNeeded) || null,
                    borough,
                    languagePref,
                    genderPref,
                    serviceSetting,
                  });
                  if (res.success) {
                    toast.success(`Posted ${res.data?.caseCode}`);
                    setShowCreate(false);
                    refreshFromServer();
                  } else {
                    toast.error(res.error || 'Failed');
                  }
                });
              }}
            >
              Publish to HRM Job Board
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-3">
          {openings.length === 0 && (
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 p-8 text-center backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,107,0,0.05),transparent_60%)]" />
              <div className="relative mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-orange-500/20 bg-brand-orange-500/10">
                <Briefcase className="h-5 w-5 text-brand-orange-400" />
              </div>
              <p className="relative font-heading text-sm font-semibold text-white">No openings posted</p>
              <p className="relative mt-1 text-xs text-zinc-500">
                Nothing is live on the HRM Job Board. Use{' '}
                <span className="font-semibold text-brand-orange-300">Post opening</span> above for a
                staffing-pending client.
              </p>
            </div>
          )}
          {openings.map((o) => {
            const newApps = countNewApplications(o.applications);
            return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setSelectedOpeningId(o.id);
                setSelectedAppId(o.applications[0]?.id ?? null);
              }}
              className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 ${
                selectedOpeningId === o.id
                  ? 'border-brand-orange-500/50 bg-zinc-900/90'
                  : 'border-white/10 bg-zinc-950/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-brand-orange-300">{o.caseCode}</p>
                  <p className="mt-1 font-heading text-sm text-white">
                    {o.client.firstName} {o.client.lastName}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {o.borough || 'Borough TBD'} · {o.applications.length} applicant
                    {o.applications.length === 1 ? '' : 's'}
                    {newApps > 0 ? (
                      <span className="ml-1.5 text-sky-300">· {newApps} new</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                      o.status === 'OPEN'
                        ? 'border-green-500/20 bg-green-500/10 text-green-400'
                        : o.status === 'FILLED'
                          ? 'border-sky-500/20 bg-sky-500/10 text-sky-300'
                          : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'
                    }`}
                  >
                    {o.status}
                  </span>
                  {newApps > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300">
                      <span className="dot-live" /> Applied
                    </span>
                  )}
                </div>
              </div>
            </button>
            );
          })}
        </div>

        <div className="lg:col-span-8 space-y-4">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-950/60 p-10 text-center backdrop-blur-xl">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/80">
                <Users className="h-5 w-5 text-zinc-500" />
              </div>
              <p className="font-heading text-sm font-semibold text-white">
                {openings.length === 0 ? 'No opening selected' : 'Select an opening'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {openings.length === 0
                  ? 'Applicant management appears here once an opening is posted.'
                  : 'Pick a listing on the left to message, meet, and decide on applicants.'}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">{selected.caseCode}</p>
                    <h2 className="font-heading text-xl text-white">
                      {selected.client.firstName} {selected.client.lastName}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400 flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {selected.borough || 'Location TBD'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {selected.weeklyHours ?? '—'} hrs/wk
                      </span>
                      <span>{selected.scheduleText || 'Schedule TBD'}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/client/${selected.client.id}?mode=case-coord`}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-orange-500/40"
                    >
                      Profile <ExternalLink className="h-3 w-3" />
                    </Link>
                    {selected.status === 'OPEN' && (
                      <button
                        type="button"
                        disabled={isPending}
                        className="cursor-pointer rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await closeCaseOpening(selected.id);
                            if (res.success) {
                              toast.success('Opening closed');
                              refreshFromServer();
                            } else toast.error(res.error || 'Failed');
                          });
                        }}
                      >
                        Close listing
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-5">
                <div className="md:col-span-2 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Applicants
                  </h3>
                  {selected.applications.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-zinc-950/40 p-5 text-center">
                      <Users className="mx-auto mb-2 h-4 w-4 text-zinc-600" />
                      <p className="text-xs text-zinc-500">
                        No applicants yet — waiting for RBTs on the HRM Job Board. This inbox
                        auto-refreshes when they apply.
                      </p>
                    </div>
                  )}
                  {selected.applications.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedAppId(app.id)}
                      className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-all duration-300 hover:scale-[1.01] ${
                        selectedApp?.id === app.id
                          ? 'border-brand-orange-500/40 bg-zinc-900 shadow-xl'
                          : 'border-white/10 bg-zinc-950/60 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white">
                          {app.rbt.firstName} {app.rbt.lastName}
                        </p>
                        {app.status === 'APPLIED' && (
                          <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300">
                            <span className="dot-live" /> New
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 font-mono truncate">{app.rbt.email}</p>
                      <span
                        className={`mt-2 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                          APPLICATION_STATUS_STYLES[app.status] || APPLICATION_STATUS_STYLES.APPLIED
                        }`}
                      >
                        {app.status.replace(/_/g, ' ')}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="md:col-span-3 space-y-4">
                  {!selectedApp ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-zinc-950/40 p-6 text-center">
                      <MessageSquare className="mx-auto mb-2 h-4 w-4 text-zinc-600" />
                      <p className="text-xs text-zinc-500">
                        {selected.applications.length === 0
                          ? 'Applicant actions unlock once the first RBT applies.'
                          : 'Select an applicant to message, meet, and decide.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <ApplicationFlowBar status={selectedApp.status} />

                      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isPending || selectedApp.status === 'APPROVED'}
                            className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await updateCaseApplicationStatus(
                                  selectedApp.id,
                                  'MESSAGING',
                                  selectedApp.status
                                );
                                if (res.success) {
                                  toast.success('Marked messaging');
                                  softRefresh({ silent: true });
                                } else toast.error(res.error || 'Failed to mark messaging');
                              });
                            }}
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> Messaging
                          </button>
                          <button
                            type="button"
                            disabled={isPending || !meetAt || selectedApp.status === 'APPROVED'}
                            className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await updateCaseApplicationStatus(
                                  selectedApp.id,
                                  'MEET_SCHEDULED',
                                  selectedApp.status,
                                  { meetAt }
                                );
                                if (res.success) {
                                  toast.success('Meet scheduled');
                                  softRefresh({ silent: true });
                                } else toast.error(res.error || 'Failed');
                              });
                            }}
                          >
                            <Video className="h-3.5 w-3.5" /> Schedule video
                          </button>
                          <button
                            type="button"
                            disabled={isPending || selectedApp.status === 'APPROVED'}
                            className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-brand-orange-500/30 bg-brand-orange-500/10 px-3 py-1.5 text-xs text-brand-orange-200 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await updateCaseApplicationStatus(
                                  selectedApp.id,
                                  'PARENT_PENDING',
                                  selectedApp.status
                                );
                                if (res.success) {
                                  toast.success('Awaiting parent decision');
                                  softRefresh({ silent: true });
                                } else toast.error(res.error || 'Failed to update status');
                              });
                            }}
                          >
                            Parent deciding
                          </button>
                          <button
                            type="button"
                            disabled={
                              isPending ||
                              selected.status !== 'OPEN' ||
                              selectedApp.status === 'APPROVED' ||
                              selectedApp.status === 'REJECTED' ||
                              selectedApp.status === 'WITHDRAWN'
                            }
                            className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await recordParentApplicationAcceptance({
                                  applicationId: selectedApp.id,
                                  expectedApplicationStatus: selectedApp.status,
                                  expectedOpeningStatus: selected.status,
                                  expectedClientRbtId: selected.client.rbtId,
                                  expectedRbtApproved: selected.client.rbtApproved,
                                  decisionEvidence: 'VERBAL_CONFIRMATION_RECORDED',
                                });
                                if (res.success) {
                                  toast.success(
                                    'Parent liked — RBT assigned. ACTIVE still requires first Session.'
                                  );
                                  softRefresh({ silent: true });
                                } else toast.error(res.error || 'Failed');
                              });
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Parent likes → assign
                          </button>
                          <button
                            type="button"
                            disabled={
                              isPending ||
                              selectedApp.status === 'APPROVED' ||
                              selectedApp.status === 'REJECTED'
                            }
                            className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await recordParentApplicationDecline({
                                  applicationId: selectedApp.id,
                                  expectedApplicationStatus: selectedApp.status,
                                  expectedOpeningStatus: selected.status,
                                  expectedClientRbtId: selected.client.rbtId,
                                  expectedRbtApproved: selected.client.rbtApproved,
                                  decisionEvidence: 'VERBAL_CONFIRMATION_RECORDED',
                                });
                                if (res.success) {
                                  toast.success('Declined — opening stays open for next applicant');
                                  softRefresh({ silent: true });
                                } else toast.error(res.error || 'Failed');
                              });
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5" /> Parent declines
                          </button>
                        </div>

                        <label className="block text-xs text-zinc-400 space-y-1">
                          Meet date/time
                          <input
                            type="datetime-local"
                            className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                            value={meetAt}
                            onChange={(e) => setMeetAt(e.target.value)}
                          />
                        </label>

                        {selectedApp.meetLink && (
                          <a
                            href={selectedApp.meetLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex cursor-pointer items-center gap-1 text-xs text-sky-300 hover:underline"
                          >
                            <Video className="h-3.5 w-3.5" /> Open meet link
                          </a>
                        )}
                        {selectedApp.message && (
                          <p className="rounded-lg border border-white/5 bg-zinc-950 p-3 text-xs text-zinc-300">
                            <span className="text-zinc-500">RBT note: </span>
                            {selectedApp.message}
                          </p>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-zinc-950/80 p-4 space-y-2">
                        <h4 className="text-xs font-bold uppercase text-zinc-500">Message RBT</h4>
                        <textarea
                          className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500 min-h-[72px]"
                          placeholder="Coordinate availability, meet details…"
                          value={rbtMsg}
                          onChange={(e) => setRbtMsg(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={isPending || !rbtMsg.trim()}
                          className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            startTransition(async () => {
                              const res = await sendApplicationStaffMessage(selectedApp.id, rbtMsg);
                              if (res.success) {
                                toast.success('Sent to RBT');
                                setRbtMsg('');
                                softRefresh({ silent: true });
                              } else toast.error(res.error || 'Failed');
                            });
                          }}
                        >
                          Send to RBT
                        </button>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-zinc-950/80 p-4 space-y-2">
                        <h4 className="text-xs font-bold uppercase text-zinc-500">Message parent</h4>
                        <textarea
                          className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-orange-500 min-h-[72px]"
                          placeholder="Share meet time, introduce candidate (portal messages)…"
                          value={parentMsg}
                          onChange={(e) => setParentMsg(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={isPending || !parentMsg.trim()}
                          className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            startTransition(async () => {
                              const res = await sendParentCaseMessage(selected.client.id, parentMsg);
                              if (res.success) {
                                toast.success('Sent to parent thread');
                                setParentMsg('');
                              } else toast.error(res.error || 'Failed');
                            });
                          }}
                        >
                          Send to parent
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
