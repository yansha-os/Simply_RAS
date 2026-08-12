'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  getClientAssignmentSnapshot,
  updateClientCaseCoordinator,
  type AssignmentStaff,
  type ClientAssignmentSnapshot,
} from '@/app/actions/hr';

type StaffName = Pick<AssignmentStaff, 'id' | 'firstName' | 'lastName'> & {
  role?: string;
};

type ClientAssignmentsTabProps = {
  client: {
    id: string;
    updatedAt?: Date | string;
    status: string;
    bcbaId: string | null;
    rbtId: string | null;
    caseCoordinatorId: string | null;
    rbtApproved: boolean;
    bcba?: StaffName | null;
    rbt?: StaffName | null;
    intakePacket?: { formData?: unknown } | null;
  };
};

type Feedback = {
  tone: 'success' | 'error';
  message: string;
};

type AssignmentLoadState =
  | {
      clientId: string;
      status: 'loading';
      snapshot: null;
      error: null;
    }
  | {
      clientId: string;
      status: 'ready';
      snapshot: ClientAssignmentSnapshot;
      error: null;
    }
  | {
      clientId: string;
      status: 'error';
      snapshot: null;
      error: string;
    };

function getStaffName(staff: Pick<AssignmentStaff, 'firstName' | 'lastName'> | StaffName) {
  return `${staff.firstName} ${staff.lastName}`.trim();
}

function parsePacketFormData(value: unknown): Record<string, unknown> {
  let parsed = value;

  try {
    for (let pass = 0; pass < 2 && typeof parsed === 'string'; pass += 1) {
      parsed = JSON.parse(parsed);
    }
  } catch {
    return {};
  }

  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function displayRequirement(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return 'Not specified';
}

export default function ClientAssignmentsTab({ client }: ClientAssignmentsTabProps) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<AssignmentLoadState>({
    clientId: client.id,
    status: 'loading',
    snapshot: null,
    error: null,
  });
  const [selectedCoordinator, setSelectedCoordinator] = useState<string>(client.caseCoordinatorId || '');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, startTransition] = useTransition();
  const clientVersion =
    client.updatedAt instanceof Date
      ? client.updatedAt.toISOString()
      : String(client.updatedAt ?? '');

  useEffect(() => {
    let cancelled = false;

    void getClientAssignmentSnapshot(client.id)
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) {
          setLoadState({
            clientId: client.id,
            status: 'error',
            snapshot: null,
            error: result.error || 'Unable to load current assignments.',
          });
          return;
        }

        setLoadState({
          clientId: client.id,
          status: 'ready',
          snapshot: result.data,
          error: null,
        });
        setSelectedCoordinator(result.data.caseCoordinatorId || '');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState({
            clientId: client.id,
            status: 'error',
            snapshot: null,
            error: 'Unable to load current assignments. Please try again.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client.id, clientVersion]);

  const currentLoadState =
    loadState.clientId === client.id
      ? loadState
      : ({
          clientId: client.id,
          status: 'loading',
          snapshot: null,
          error: null,
        } satisfies AssignmentLoadState);
  const snapshot = currentLoadState.snapshot;
  const isLoading = currentLoadState.status === 'loading';
  const loadError = currentLoadState.error;

  const packet = client.intakePacket;
  const parsedFormData = parsePacketFormData(packet?.formData);
  const requestedHours = displayRequirement(parsedFormData.requestedHours);
  const schoolSchedule = displayRequirement(parsedFormData.schoolSchedule);

  const bcbaId = snapshot ? snapshot.bcbaId : client.bcbaId;
  const rbtId = snapshot ? snapshot.rbtId : client.rbtId;
  const caseCoordinatorId = snapshot
    ? snapshot.caseCoordinatorId
    : client.caseCoordinatorId;
  const rbtApproved = snapshot ? snapshot.rbtApproved : client.rbtApproved;
  const bcba = snapshot ? snapshot.bcba : client.bcba || null;
  const rbt = snapshot ? snapshot.rbt : client.rbt || null;
  const caseCoordinator = snapshot?.caseCoordinator || null;
  const canAssignCaseCoordinator = Boolean(snapshot?.canAssignCaseCoordinator);
  const selectedCoordinatorId = selectedCoordinator || null;
  const hasAssignmentChange =
    selectedCoordinatorId !== caseCoordinatorId;
  const formDisabled =
    isLoading || Boolean(loadError) || !canAssignCaseCoordinator || isPending;
  const saveDisabled = formDisabled || !hasAssignmentChange;

  const bcbaLabel = bcba
    ? getStaffName(bcba)
    : bcbaId
      ? 'Assigned staff record unavailable'
      : 'Unassigned — Clinical Director action required';
  const rbtLabel = rbt
    ? getStaffName(rbt)
    : rbtId
      ? 'Assigned staff record unavailable'
      : 'Unassigned — use the Case Coord job board';
  const coordinatorLabel = caseCoordinator
    ? `${getStaffName(caseCoordinator)}${caseCoordinator.isActive ? '' : ' · Inactive'}`
    : caseCoordinatorId
      ? isLoading
        ? 'Loading current coordinator…'
        : 'Assigned staff record unavailable'
      : 'Unassigned';
  const currentCoordinatorMissingFromOptions =
    Boolean(caseCoordinator) &&
    !snapshot?.caseCoordinatorOptions.some((option) => option.id === caseCoordinator?.id);

  const handleAssign = () => {
    if (saveDisabled || !snapshot) return;

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await updateClientCaseCoordinator({
          clientId: client.id,
          caseCoordinatorId: selectedCoordinatorId,
          expectedCaseCoordinatorId: snapshot.caseCoordinatorId,
        });
        if (!result.success) {
          setFeedback({
            tone: 'error',
            message: result.error || 'Unable to update the Case Coordinator.',
          });
          if (result.error?.includes('changed in another session')) {
            const refreshed = await getClientAssignmentSnapshot(client.id);
            if (refreshed.success && refreshed.data) {
              setLoadState({
                clientId: client.id,
                status: 'ready',
                snapshot: refreshed.data,
                error: null,
              });
              setSelectedCoordinator(refreshed.data.caseCoordinatorId || '');
            }
          }
          return;
        }

        setLoadState((current) => {
          if (current.clientId !== client.id || current.status !== 'ready') {
            return current;
          }
          return {
            ...current,
            snapshot: {
              ...current.snapshot,
              caseCoordinatorId: result.data.caseCoordinatorId,
              caseCoordinator: result.data.caseCoordinator,
            },
          };
        });
        setFeedback({
          tone: 'success',
          message: result.data.caseCoordinator
            ? `${getStaffName(result.data.caseCoordinator)} is now the Case Coordinator.`
            : 'The client is now unassigned from Case Coordination.',
        });
        router.refresh();
      } catch {
        setFeedback({
          tone: 'error',
          message: 'Unable to update the Case Coordinator. Please try again.',
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card className="relative w-full overflow-hidden border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.09),transparent_38%)]" />
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-lg text-white flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-cyan-500" />
            Team Assignments
          </CardTitle>
          <p className="mt-1 text-sm text-zinc-400">
            Current staff comes from the canonical Client assignment fields. BCBA and RBT
            changes stay in their Clinical and Case Coord workflows.
          </p>
        </CardHeader>

        <CardContent className="relative grid grid-cols-1 gap-8 pt-6 lg:grid-cols-2">
          {/* Availability Info & HR Context */}
          <div className="space-y-6">
            <div className="space-y-4 rounded-xl border border-white/5 bg-zinc-900/50 p-6">
              <h3 className="font-semibold text-white flex items-center border-b border-white/5 pb-3">
                <Calendar className="w-4 h-4 mr-2 text-brand-gold-500" />
                Client Schedule Requirements
              </h3>

              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Requested Hours for ABA</label>
                <div className="bg-zinc-800/50 p-3 rounded-lg text-zinc-300 text-sm flex items-start">
                  <Clock className="w-4 h-4 mr-2 mt-0.5 text-zinc-400 shrink-0" />
                  <span>{requestedHours}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">School Schedule</label>
                <div className="bg-zinc-800/50 p-3 rounded-lg text-zinc-300 text-sm">
                  {schoolSchedule}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-white/5 bg-zinc-900/50 p-6">
              <h3 className="flex items-center border-b border-white/5 pb-3 font-semibold text-white">
                <ShieldCheck className="mr-2 h-4 w-4 text-cyan-500" />
                Current Canonical Assignments
              </h3>

              {isLoading && (
                <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 font-mono text-xs text-cyan-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Refreshing assignment records…
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className={`rounded-xl border p-4 transition-all duration-300 ${
                  bcbaId
                    ? 'border-cyan-500/20 bg-cyan-500/10'
                    : 'border-white/5 bg-zinc-950/60'
                }`}>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                    BCBA
                  </span>
                  <div className={`mt-2 text-sm font-semibold ${bcbaId ? 'text-cyan-300' : 'text-zinc-400'}`}>
                    {bcbaLabel}
                  </div>
                </div>

                <div className={`rounded-xl border p-4 transition-all duration-300 ${
                  rbtId
                    ? rbtApproved
                      ? 'border-green-500/20 bg-green-500/10'
                      : 'border-brand-orange-500/20 bg-brand-orange-500/10'
                    : 'border-white/5 bg-zinc-950/60'
                }`}>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                    RBT
                  </span>
                  <div className={`mt-2 text-sm font-semibold ${
                    rbtId ? (rbtApproved ? 'text-green-300' : 'text-brand-orange-300') : 'text-zinc-400'
                  }`}>
                    {rbtLabel}
                  </div>
                  {rbtId && (
                    <span className="mt-2 block font-mono text-[10px] text-zinc-500">
                      {rbtApproved ? 'APPROVED' : 'MEET & GREET PENDING'}
                    </span>
                  )}
                </div>

                <div className={`rounded-xl border p-4 transition-all duration-300 ${
                  caseCoordinatorId
                    ? 'border-violet-500/20 bg-violet-500/10'
                    : 'border-white/5 bg-zinc-950/60'
                }`}>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                    Case Coordinator
                  </span>
                  <div className={`mt-2 text-sm font-semibold ${
                    caseCoordinatorId ? 'text-violet-300' : 'text-zinc-400'
                  }`}>
                    {coordinatorLabel}
                  </div>
                </div>
              </div>

              {!rbtId && rbtApproved && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  The approval flag is set without an assigned RBT. The client remains
                  honestly shown as unassigned.
                </div>
              )}
            </div>
          </div>

          {/* Assignment Form */}
          <div className="space-y-6 rounded-2xl border border-white/5 bg-zinc-950/40 p-6">
            <div className="space-y-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Staffing ownership
              </span>
              <h3 className="font-heading text-xl font-semibold text-white">
                Case Coordinator
              </h3>
              <p className="text-sm leading-relaxed text-zinc-400">
                Coordinator assignment never activates a client. ACTIVE requires a
                durable first therapy Session.
              </p>
            </div>

            {loadError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {loadError}
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Current owner
              </span>
              <span className="mt-1 block text-sm font-semibold text-white">
                {coordinatorLabel}
              </span>
            </div>

            {canAssignCaseCoordinator ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-white" htmlFor="case-coordinator-select">
                  Change Case Coordinator
                </label>
                <select
                  id="case-coordinator-select"
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-zinc-900 p-3 text-sm text-white outline-none transition-colors focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  value={selectedCoordinator}
                  onChange={(event) => {
                    setSelectedCoordinator(event.target.value);
                    setFeedback(null);
                  }}
                  disabled={formDisabled}
                >
                  <option value="">Unassigned</option>
                  {currentCoordinatorMissingFromOptions && caseCoordinator && (
                    <option value={caseCoordinator.id}>
                      {getStaffName(caseCoordinator)} · Current{caseCoordinator.isActive ? '' : ' (inactive)'}
                    </option>
                  )}
                  {snapshot?.caseCoordinatorOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getStaffName(user)}
                    </option>
                  ))}
                </select>
                {!isLoading && snapshot?.caseCoordinatorOptions.length === 0 && (
                  <p className="mt-2 text-xs text-amber-300">
                    No active Case Coordinators are available.
                  </p>
                )}
              </div>
            ) : (
              !isLoading &&
              !loadError && (
                <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-300">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  You can view this staffing record, but your role cannot change its
                  Case Coordinator.
                </div>
              )
            )}

            <Button
              className={`mt-4 h-12 w-full cursor-pointer font-bold text-white transition-all duration-300 disabled:cursor-not-allowed ${
                caseCoordinatorId
                  ? 'bg-violet-600 hover:bg-violet-500'
                  : 'bg-cyan-600 hover:bg-cyan-500'
              }`}
              onClick={handleAssign}
              disabled={saveDisabled}
              aria-busy={isPending}
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving assignment…
                </span>
              ) : selectedCoordinatorId === null && caseCoordinatorId ? (
                'Unassign Case Coordinator'
              ) : caseCoordinatorId ? (
                'Update Case Coordinator'
              ) : (
                'Assign Case Coordinator'
              )}
            </Button>

            {feedback && (
              <div
                aria-live="polite"
                className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${
                  feedback.tone === 'success'
                    ? 'border-green-500/20 bg-green-500/10 text-green-300'
                    : 'border-red-500/20 bg-red-500/10 text-red-300'
                }`}
              >
                {feedback.tone === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                {feedback.message}
              </div>
            )}

            {client.status === 'STAFFING_PENDING' && (
              <div className="mt-4 flex flex-col gap-2 text-xs text-zinc-400 bg-zinc-900 p-4 rounded-lg border border-white/5">
                <p className="font-bold text-white uppercase text-[10px] tracking-wider mb-1">Activation Checklist</p>
                <div className="flex items-center gap-2">
                  <span className={bcbaId ? 'text-green-500 font-bold' : 'text-zinc-500'}>
                    {bcbaId ? '✓' : '○'}
                  </span>
                  <span>BCBA Assigned: {bcbaId ? bcbaLabel : 'No'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={rbtId ? 'text-green-500 font-bold' : 'text-zinc-500'}>
                    {rbtId ? '✓' : '○'}
                  </span>
                  <span>RBT Candidate Assigned: {rbtId ? rbtLabel : 'No'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={rbtId && rbtApproved ? 'text-green-500 font-bold' : 'text-zinc-500'}>
                    {rbtId && rbtApproved ? '✓' : '○'}
                  </span>
                  <span>
                    RBT Meet & Greet: {rbtId ? (rbtApproved ? 'Approved' : 'Pending Approval') : 'No RBT assigned'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={caseCoordinatorId ? 'text-green-500 font-bold' : 'text-zinc-500'}>
                    {caseCoordinatorId ? '✓' : '○'}
                  </span>
                  <span>Case Coordinator Assigned: {coordinatorLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">○</span>
                  <span>First therapy Session on record → ACTIVE (Bridge E — not granted by staffing alone)</span>
                </div>
              </div>
            )}
            
            {client.status === 'ACTIVE' && (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-500 bg-green-500/10 p-4 rounded-lg border border-green-500/20 font-bold">
                <CheckCircle2 className="w-5 h-5" />
                <span>Client is Fully Active</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
