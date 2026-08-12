'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Sparkles,
  Briefcase,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  scheduleFirstTherapySession,
  confirmTherapySessionCompleted,
  activateClientAfterFirstSession,
} from '@/app/actions/firstSessionActions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import ClientJobBoardPanel from '@/components/client-profile/tabs/ClientJobBoardPanel';
import StaffingReadinessChecklist from '@/components/portal-case-coord/StaffingReadinessChecklist';
import { getStaffingReadiness } from '@/lib/staffingReadiness';
import { CLINIC_TIME_ZONE, addClinicDays, clinicDateKey } from '@/lib/clinicTimezone';

type TherapySession = {
  id: string;
  status: string;
  cptCode: string | null;
  scheduledStart: string | Date;
  scheduledEnd: string | Date;
  location: string | null;
  rbt?: { firstName: string; lastName: string } | null;
  bcba?: { firstName: string; lastName: string } | null;
  note?: {
    id: string;
    rbtSigned: boolean;
    parentSigned: boolean;
    bcbaSigned: boolean;
    isConverted: boolean;
  } | null;
};

/** Default input value: clinic calendar date +2 days at the given ET wall time. */
function defaultClinicInputValue(hour: number, minute: number) {
  const dateKey = clinicDateKey(addClinicDays(new Date(), 2));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateKey}T${pad(hour)}:${pad(minute)}`;
}

export default function CaseCoordSchedulingTab({
  client,
  initialSubTab = 'job_board',
}: {
  client: any;
  initialSubTab?: 'job_board' | 'activation';
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subTab, setSubTab] = useState<'job_board' | 'activation'>(initialSubTab);

  const sessions: TherapySession[] = useMemo(() => {
    const raw = (client.sessions || []) as TherapySession[];
    return raw
      .filter((s) => (s.cptCode || '') !== '97151')
      .sort(
        (a, b) =>
          new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()
      );
  }, [client.sessions]);

  const firstSession = sessions[0] || null;
  const isRbtAssigned = !!client.rbtId;
  const isBcbaAssigned = !!client.bcbaId;
  const readiness = getStaffingReadiness(client);
  const staffingReady = readiness.canScheduleFirstSession;
  const isActive = client.status === 'ACTIVE';

  const defaultStart = useMemo(() => defaultClinicInputValue(15, 30), []);
  const defaultEnd = useMemo(() => defaultClinicInputValue(17, 30), []);

  const [startLocal, setStartLocal] = useState(defaultStart);
  const [endLocal, setEndLocal] = useState(defaultEnd);
  const [location, setLocation] = useState('12 - Home');

  const handleSchedule = () => {
    startTransition(async () => {
      // Raw datetime-local strings: the server action interprets them as
      // clinic wall-clock (America/New_York), never this machine's TZ.
      const res = await scheduleFirstTherapySession({
        clientId: client.id,
        scheduledStart: startLocal,
        scheduledEnd: endLocal,
        location,
        cptCode: '97153',
        expectedClientStatus: client.status,
        expectedRbtId: client.rbtId ?? null,
        expectedBcbaId: client.bcbaId ?? null,
        expectedRbtApproved: client.rbtApproved === true,
        reason: 'Case Coordination scheduled first approved therapy session',
      });
      if (res.success) {
        toast.success(
          res.isFirstTherapySession
            ? 'First therapy session scheduled. Next: Activate after first session (job-board accept does not set ACTIVE).'
            : 'Therapy session scheduled.'
        );
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to schedule session');
      }
    });
  };

  const handleConfirmSession = (sessionId: string) => {
    startTransition(async () => {
      const res = await confirmTherapySessionCompleted(sessionId);
      if (res.success) {
        toast.success('Session marked COMPLETED.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to confirm session');
      }
    });
  };

  const handleActivate = () => {
    startTransition(async () => {
      const res = await activateClientAfterFirstSession(client.id);
      if (res.success) {
        toast.success(
          res.alreadyActive
            ? 'Client is already ACTIVE.'
            : 'Client set to ACTIVE after durable first therapy session.'
        );
        router.refresh();
      } else {
        toast.error(res.error || 'Activation blocked');
      }
    });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex gap-4 border-b border-white/10 pb-3 font-mono text-xs">
        <button
          type="button"
          onClick={() => setSubTab('job_board')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            subTab === 'job_board'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shadow-lg'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Briefcase className="w-4 h-4" /> 1. Job Board &amp; Applicants
        </button>
        <button
          type="button"
          onClick={() => setSubTab('activation')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            subTab === 'activation'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold shadow-lg'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" /> 2. First Session &amp; Activate
        </button>
      </div>

      {subTab === 'job_board' && (
        <ClientJobBoardPanel
          client={client}
          onRequestActivationTab={() => setSubTab('activation')}
        />
      )}

      {subTab === 'activation' && (
        <div className="space-y-6">
          <StaffingReadinessChecklist
            client={client}
            ctaKinds={['publish_opening', 'review_applicants', 'await_parent', 'blocked']}
            onCtaClick={() => setSubTab('job_board')}
          />

          <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-1/4 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider block">
                  First session → Activate
                </span>
                <h3 className="text-lg font-bold text-white font-heading">
                  Schedule first therapy session, then activate
                </h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
                  Flow: <span className="text-zinc-200 font-semibold">1) Schedule Session</span> (97153) →{' '}
                  <span className="text-zinc-200 font-semibold">2) Activate after first session</span>.
                  Job-board / parent accept only assigns the RBT — it never sets ACTIVE.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10">
                  <span className="text-zinc-400 font-bold">Status:</span>
                  <span
                    className={`font-bold ${
                      isActive
                        ? 'text-emerald-400'
                        : client.status === 'STAFFING_PENDING'
                          ? 'text-amber-400'
                          : 'text-zinc-300'
                    }`}
                  >
                    {client.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10">
                  <span className="text-zinc-400 font-bold">BCBA:</span>
                  <span className={isBcbaAssigned ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {isBcbaAssigned ? 'ASSIGNED' : 'WAITING'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10">
                  <span className="text-zinc-400 font-bold">RBT:</span>
                  <span className={isRbtAssigned ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {isRbtAssigned
                      ? client.rbtApproved
                        ? 'APPROVED'
                        : 'PENDING PARENT'
                      : 'WAITING'}
                  </span>
                </div>
              </div>

              {!staffingReady && !isActive && (
                <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p>
                      {readiness.nextAction.label} Use{' '}
                      <span className="font-semibold text-amber-100">Job Board &amp; Applicants</span> until
                      RBT + BCBA are assigned.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSubTab('job_board')}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:border-amber-500/50"
                    >
                      Open Job Board
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {(staffingReady || isActive) && (
            <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white font-heading">
                  Step 1 · Schedule therapy session (97153)
                </h3>
              </div>
              <p className="text-xs text-zinc-500">
                Creates a durable therapy session on the calendar. Status stays{' '}
                <span className="font-mono text-zinc-300">STAFFING_PENDING</span> until you activate below.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1.5 text-xs font-mono">
                  <span className="text-zinc-400 font-bold uppercase tracking-wide">
                    Start <span className="text-cyan-400/80 normal-case">(ET)</span>
                  </span>
                  <input
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                  />
                </label>
                <label className="space-y-1.5 text-xs font-mono">
                  <span className="text-zinc-400 font-bold uppercase tracking-wide">
                    End <span className="text-cyan-400/80 normal-case">(ET)</span>
                  </span>
                  <input
                    type="datetime-local"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                  />
                </label>
                <label className="space-y-1.5 text-xs font-mono">
                  <span className="text-zinc-400 font-bold uppercase tracking-wide">Location</span>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-xl bg-zinc-900 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                  >
                    <option value="12 - Home">12 - Home</option>
                    <option value="03 - School">03 - School</option>
                    <option value="11 - Clinic">11 - Clinic</option>
                  </select>
                </label>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSchedule}
                  disabled={isPending || (!staffingReady && !isActive)}
                  className={`font-bold text-xs h-10 px-5 rounded-xl flex items-center gap-2 transition-all ${
                    staffingReady || isActive
                      ? 'bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 text-white shadow-lg shadow-cyan-500/20 cursor-pointer'
                      : 'bg-zinc-800 text-zinc-500 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  <CalendarPlus className="w-4 h-4" />
                  {sessions.length === 0 ? 'Schedule first session' : 'Schedule Session'}
                </Button>
              </div>
            </Card>
          )}

          <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-orange-400" />
                <h3 className="text-base font-bold text-white font-heading">Therapy sessions on file</h3>
              </div>
              <span className="font-mono text-[10px] text-zinc-400 border border-white/10 px-2 py-1 rounded-lg">
                {sessions.length} session(s)
              </span>
            </div>

            {sessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-900/40">
                No therapy sessions yet. Schedule the first 97153 session above.
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s, idx) => (
                  <div
                    key={s.id}
                    className="p-4 rounded-2xl bg-zinc-900/70 border border-white/10 hover:border-brand-orange-500/40 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {idx === 0 && (
                          <span className="text-[10px] font-mono font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 px-2 py-0.5 rounded-md">
                            First session
                          </span>
                        )}
                        <span className="text-sm font-bold text-white">
                          {new Date(s.scheduledStart).toLocaleString('en-US', {
                            timeZone: CLINIC_TIME_ZONE,
                          })}{' '}
                          <span className="text-[10px] font-mono text-zinc-500">ET</span>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          CPT {s.cptCode || '97153'}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                            s.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                              : s.status === 'SCHEDULED'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                                : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 font-mono">
                        {s.location || 'Location TBD'} · RBT{' '}
                        {s.rbt ? `${s.rbt.firstName} ${s.rbt.lastName}` : '—'} · BCBA{' '}
                        {s.bcba ? `${s.bcba.firstName} ${s.bcba.lastName}` : '—'}
                      </p>
                    </div>
                    {s.status === 'SCHEDULED' && (
                      <Button
                        type="button"
                        onClick={() => handleConfirmSession(s.id)}
                        disabled={isPending}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs h-9 px-4 rounded-xl cursor-pointer border border-white/10"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Confirm completed
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white font-heading">
                Step 2 · Activate after first session
              </h3>
            </div>
            <p className="text-xs text-zinc-400">
              Sets <span className="font-mono text-zinc-200">Client.status = ACTIVE</span> once a
              durable non-97151 therapy session is on file. Job-board accept alone never activates.
            </p>

            {isActive ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
                <span className="dot-live" />
                <span className="text-sm font-bold text-emerald-300 font-heading">
                  Client is ACTIVE
                </span>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-zinc-500 font-mono">
                  {firstSession
                    ? `First session on file · ${firstSession.status} · ${new Date(firstSession.scheduledStart).toLocaleDateString('en-US', { timeZone: CLINIC_TIME_ZONE })}`
                    : 'Blocked until a therapy Session is scheduled.'}
                </p>
                <Button
                  type="button"
                  onClick={handleActivate}
                  disabled={isPending || !firstSession}
                  className={`font-bold text-xs h-10 px-6 rounded-xl flex items-center gap-2 ${
                    firstSession
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 cursor-pointer'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Activate after first session
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
