'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Users, ArrowRight, ShieldCheck, Clock } from 'lucide-react';

const STALLED_DAYS = 14;

type StaffingClient = {
  id: string;
  firstName: string;
  lastName: string;
  updatedAt: string | Date;
  rbtId: string | null;
  bcbaId: string | null;
};

type PendingOnboard = {
  id: string;
  bacbVerified: boolean;
  backgroundCleared: boolean;
  clinicalEmrProvisioned: boolean;
  payrollComplete: boolean;
  payerCredentialed: boolean;
  rbt: { firstName: string; lastName: string };
  client: { firstName: string };
};

type MissingSignature = {
  id: string;
  parentSigned: boolean;
  bcbaSigned: boolean;
  session: {
    scheduledStart: string | Date;
    client: { firstName: string; lastName: string };
  };
};

type CasePipelineClientProps = {
  staffingQueue: StaffingClient[];
  missingSigs: MissingSignature[];
  pendingOnboards: PendingOnboard[];
};

function daysInStage(updatedAt: string | Date | undefined): number | null {
  if (!updatedAt) return null;
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export default function CasePipelineClient({
  staffingQueue,
  missingSigs,
  pendingOnboards,
}: CasePipelineClientProps) {
  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-7xl">
      
      {/* COLUMN 1: STAFFING QUEUE */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">6. Staffing & Scheduling</h2>
          <Badge variant="secondary">{staffingQueue?.length || 0}</Badge>
        </div>

        <div className="grid gap-4">
          {staffingQueue?.map((client) => {
            const stageDays = daysInStage(client.updatedAt);
            const isStalled = stageDays !== null && stageDays > STALLED_DAYS;
            return (
            <Card key={client.id} className={`shadow-sm ${isStalled ? 'border-amber-300 dark:border-amber-800' : 'border-teal-200 dark:border-teal-900'}`}>
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-lg">{client.firstName} {client.lastName}</p>
                    <p className="text-xs text-slate-500">Tx Auth Approved</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="bg-teal-50 text-teal-700">Staffing</Badge>
                    {isStalled && (
                      <Badge variant="warning" className="bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono text-[10px]">
                        <Clock className="w-3 h-3 mr-1" />
                        {stageDays}d in stage
                      </Badge>
                    )}
                  </div>
                </div>

                {(!client.rbtId || !client.bcbaId) ? (
                  <div className="space-y-2 border-t border-teal-100 pt-3">
                    <p className="text-xs leading-relaxed text-slate-500">
                      BCBA assignment is managed in Clinical. RBT assignment is created only
                      after the selected Job Board application reaches parent acceptance.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/client/${client.id}?mode=bcba&tab=overview`}
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-2 text-xs font-bold text-cyan-700 transition-colors hover:bg-cyan-500/15"
                      >
                        Clinical
                      </Link>
                      <Link
                        href={`/client/${client.id}?mode=case_coord&tab=case_coord_schedule&subtab=job_board`}
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-2 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-500/15"
                      >
                        <Users className="mr-1 h-3 w-3" />
                        Job Board
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 border-t pt-3 border-teal-100">
                    <div className="text-xs bg-teal-50 text-teal-800 p-2 rounded-md border border-teal-200">
                      <p><strong>RBT Assigned:</strong> Yes</p>
                      <p><strong>BCBA Assigned:</strong> Yes</p>
                    </div>
                    <Link
                      href={`/client/${client.id}?mode=case_coord&tab=case_coord_schedule&subtab=activation`}
                      className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-brand-blue-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-blue-600"
                    >
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Open first-session workflow
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}

          {(!staffingQueue || staffingQueue.length === 0) && (
            <div className="text-center p-8 text-slate-500 border rounded-xl border-dashed">
              No clients pending staffing.
            </div>
          )}
        </div>
      </div>

      {/* COLUMN 2: RBT ONBOARDING */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">RBT Readiness</h2>
          <Badge variant="warning" className="bg-amber-100 text-amber-800">{pendingOnboards?.length || 0}</Badge>
        </div>

        <div className="grid gap-4">
          {pendingOnboards?.map((onboard) => (
            <Card key={onboard.id} className="border-amber-200 dark:border-amber-900 shadow-sm bg-amber-50/10">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{onboard.rbt.firstName} {onboard.rbt.lastName}</p>
                    <p className="text-xs text-slate-500">Assigned to: {onboard.client.firstName}</p>
                  </div>
                  <Badge variant="warning" className="bg-amber-100 text-amber-700">Onboarding</Badge>
                </div>
                
                <div className="space-y-1 text-xs border-t pt-3 border-amber-100">
                  <div className="flex items-center justify-between">
                    <span>BACB Verified:</span>
                    <span className={onboard.bacbVerified ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.bacbVerified ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Background Check:</span>
                    <span className={onboard.backgroundCleared ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.backgroundCleared ? 'Cleared' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Clinical EMR provisioned:</span>
                    <span className={onboard.clinicalEmrProvisioned ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.clinicalEmrProvisioned ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Payroll Setup:</span>
                    <span className={onboard.payrollComplete ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.payrollComplete ? 'Confirmed' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Payer Credentialed:</span>
                    <span className={onboard.payerCredentialed ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.payerCredentialed ? 'Confirmed' : 'Pending'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!pendingOnboards || pendingOnboards.length === 0) && (
            <div className="text-center p-8 text-slate-500 border rounded-xl border-dashed">
              All assigned RBTs are fully onboarded.
            </div>
          )}
        </div>
      </div>

      {/* COLUMN 3: MISSING SIGNATURES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">8a. Missing Signatures</h2>
          <Badge variant="danger">{missingSigs?.length || 0}</Badge>
        </div>

        <div className="grid gap-4">
          {missingSigs?.map((sig) => (
            <Card key={sig.id} className="border-red-200 dark:border-red-900 shadow-sm bg-red-50/20 dark:bg-red-900/10">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{sig.session.client.firstName} {sig.session.client.lastName}</p>
                    <p className="text-xs text-slate-500">Session on {new Date(sig.session.scheduledStart).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="danger">Incomplete Note</Badge>
                </div>
                
                <div className="space-y-2 border-t pt-3 border-red-100 dark:border-red-900/50">
                  {!sig.parentSigned && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Parent attestation must be completed by the caregiver in the authorized
                      session workflow.
                    </div>
                  )}
                  {!sig.bcbaSigned && (
                    <div className="flex items-start gap-2 rounded-lg border border-slate-500/20 bg-slate-500/10 p-2 text-xs text-slate-700 dark:text-slate-300">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      BCBA attestation remains pending in the assigned clinician&apos;s canonical
                      e-sign queue.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!missingSigs || missingSigs.length === 0) && (
            <div className="text-center p-8 text-slate-500 border rounded-xl border-dashed">
              All active session notes are signed!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
