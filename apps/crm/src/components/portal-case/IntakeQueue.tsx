'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/Card';
import { UserPlus, Mail, FileCheck, ArrowRight, Loader2, UserCheck, Clock, Plus, X, type LucideIcon } from 'lucide-react';
import type { ClientStatus } from '@prisma/client';
import Link from 'next/link';
import { createInquiry } from '@/app/(dashboard)/portal-case/actions';
import { Button } from '@/components/ui/Button';

type IntakeQueueClient = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  status: ClientStatus;
  caseCoordinatorId: string | null;
  updatedAt: Date;
  messages: Array<{ isFromClient: boolean; readAt: Date | null }>;
};

type QueueCardProps = {
  client: IntakeQueueClient;
  icon: LucideIcon;
  desc: string;
  mounted: boolean;
};

const subscribeToMount = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const inProgressStatuses = new Set<ClientStatus>([
  'MAGIC_LINK_SENT',
  'DOCS_APPROVED_INTAKE',
  'CLINICAL_REVIEW_APPROVED',
  'VOB_COMPLETED',
  'PA_SUBMITTED',
  'PA_APPROVED',
  'ASSESSMENT_SCHEDULED',
  'REPORT_ASSEMBLED',
  'TX_PA_SUBMITTED',
  'TX_PA_APPROVED',
]);

function getClientProgress(status: ClientStatus): { percentage: number; label: string; color: string } {
  switch (status) {
    case 'INQUIRY':
      return { percentage: 10, label: 'Inquiry Lead', color: 'from-brand-orange-500 to-amber-500' };
    case 'MAGIC_LINK_SENT':
      return { percentage: 25, label: 'Parent Link Sent', color: 'from-amber-500 to-yellow-500' };
    case 'DOCS_SUBMITTED':
      return { percentage: 40, label: 'Doc Review', color: 'from-rose-500 to-orange-500' };
    case 'DOCS_APPROVED_INTAKE':
      return { percentage: 50, label: 'Intake Cleared', color: 'from-cyan-500 to-blue-500' };
    case 'CLINICAL_REVIEW_APPROVED':
      return { percentage: 60, label: 'Clinical Approved', color: 'from-blue-500 to-indigo-500' };
    case 'VOB_COMPLETED':
      return { percentage: 70, label: 'VOB Complete', color: 'from-indigo-500 to-violet-500' };
    case 'PA_SUBMITTED':
    case 'PA_APPROVED':
      return { percentage: 80, label: 'PA Processing', color: 'from-purple-500 to-pink-500' };
    case 'ASSESSMENT_SCHEDULED':
    case 'REPORT_ASSEMBLED':
    case 'TX_PA_SUBMITTED':
    case 'TX_PA_APPROVED':
      return { percentage: 90, label: 'Tx PA & Assessment', color: 'from-pink-500 to-emerald-500' };
    case 'STAFFING_PENDING':
      return { percentage: 95, label: 'Ready for Staffing', color: 'from-emerald-500 to-teal-400' };
    case 'ACTIVE':
      return { percentage: 100, label: 'Active Care', color: 'from-emerald-400 to-green-500' };
    case 'DISCHARGED':
      return { percentage: 100, label: 'Discharged', color: 'from-zinc-500 to-zinc-400' };
    default:
      return { percentage: 15, label: status, color: 'from-brand-orange-500 to-amber-500' };
  }
}

function QueueCard({ client, icon: Icon, desc, mounted }: QueueCardProps) {
  const unreadCount = client.messages.length;
  const progress = getClientProgress(client.status);

  return (
    <Card className="bg-[#FFFDF8] dark:bg-zinc-950/75 backdrop-blur-xl border border-[#E2D5B7] dark:border-white/10 hover:border-brand-orange-500/50 transition-all duration-300 cursor-pointer group mb-3 shadow-md rounded-2xl overflow-hidden hover:scale-[1.01] hover:bg-white dark:hover:bg-zinc-900/60">
      <Link href={`/client/${client.id}`} className="block p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-brand-orange-500 dark:group-hover:text-brand-orange-400 transition-colors text-sm truncate font-heading">
              {client.firstName} {client.lastName}
            </h4>
            {unreadCount > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 shadow-sm animate-pulse">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="w-7 h-7 rounded-lg bg-[#F9F5EC] dark:bg-zinc-900 border border-[#E2D5B7] dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-zinc-400 group-hover:text-brand-orange-500 dark:group-hover:text-brand-orange-400 group-hover:border-brand-orange-500/40 transition-all shrink-0">
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="text-[11px] text-slate-600 dark:text-zinc-400 flex items-center justify-between gap-2 font-sans truncate">
          <span className="truncate">
            {client.guardianName ? `Parent: ${client.guardianName}` : desc}
          </span>
        </div>

        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-600 dark:text-zinc-400 font-semibold truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange-500 inline-block"></span>
              {progress.label}
            </span>
            <span className="text-slate-700 dark:text-zinc-300 font-bold shrink-0">{progress.percentage}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#F9F5EC] dark:bg-zinc-900 overflow-hidden border border-[#E2D5B7] dark:border-white/5">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${progress.color} transition-all duration-500`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-500 border-t border-[#E2D5B7]/60 dark:border-white/5 pt-2 font-mono">
          <span className="truncate">
            {mounted ? `Active ${client.updatedAt.toLocaleDateString()}` : ''}
          </span>
          <div className="flex items-center gap-1 text-slate-600 dark:text-zinc-400 group-hover:text-brand-orange-500 dark:group-hover:text-brand-orange-400 transition-colors font-sans text-[11px] font-medium shrink-0">
            <span>View Profile</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </Link>
    </Card>
  );
}

export default function IntakeQueue({ clients }: { clients: IntakeQueueClient[] }) {
  const mounted = useSyncExternalStore(subscribeToMount, getClientSnapshot, getServerSnapshot);
  const [isPending, startTransition] = React.useTransition();
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [childFirstName, setChildFirstName] = useState('');
  const [childLastName, setChildLastName] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAddForm) {
        setShowAddForm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddForm]);

  // 4 Operational Pipeline Stages
  const inquiryQueue: IntakeQueueClient[] = [];
  const reviewQueue: IntakeQueueClient[] = [];
  const inProgressQueue: IntakeQueueClient[] = [];
  const readyToAssignQueue: IntakeQueueClient[] = [];
  for (const client of clients) {
    if (client.status === 'INQUIRY') inquiryQueue.push(client);
    else if (client.status === 'DOCS_SUBMITTED') reviewQueue.push(client);
    else if (inProgressStatuses.has(client.status)) inProgressQueue.push(client);
    else if (client.status === 'STAFFING_PENDING' && !client.caseCoordinatorId) readyToAssignQueue.push(client);
  }

  const handleCreateInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childFirstName || !childLastName) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append('childFirstName', childFirstName);
      formData.append('childLastName', childLastName);
      formData.append('parentFirstName', parentFirstName);
      formData.append('parentLastName', parentLastName);
      formData.append('guardianPhone', guardianPhone);
      formData.append('guardianEmail', guardianEmail);

      await createInquiry({}, formData);
      setChildFirstName('');
      setChildLastName('');
      setParentFirstName('');
      setParentLastName('');
      setGuardianPhone('');
      setGuardianEmail('');
      setShowAddForm(false);
    });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-heading">Intake Operational Queue</h2>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">Review client profiles, deliver magic links, cross-check packets &amp; assign coordinators</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowAddForm(true)}
            className="bg-gradient-to-r from-brand-orange-500 to-orange-600 hover:from-brand-orange-600 hover:to-orange-700 text-white font-bold text-xs px-4 h-9 rounded-xl shadow-[0_0_15px_rgba(255,107,0,0.3)] transition-all hover:scale-105 cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Log New Lead
          </Button>
        </div>
      </div>

      {/* Log New Lead Popup Modal (Rendered via React Portal for true viewport centering) */}
      {showAddForm && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setShowAddForm(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-[#E2D5B7] dark:border-brand-orange-500/40 bg-[#FFFDF8] dark:bg-zinc-950 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl transition-all duration-300 animate-scale-up my-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Ambient Background Glows */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-orange-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

            <div className="relative z-10 space-y-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#E2D5B7] dark:border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-orange-500/30 bg-brand-orange-500/10 text-brand-orange-500 dark:text-brand-orange-400">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                      Log New Client Lead
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      Record a new intake inquiry and begin the parent onboarding journey
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC] dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 transition-colors hover:border-orange-300 hover:bg-white dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleCreateInquirySubmit} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Child Info */}
                  <div className="space-y-2.5 rounded-2xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/50 p-4">
                    <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-orange-600 dark:text-brand-orange-400 block">
                      Child Information
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Child's First Name *"
                        value={childFirstName}
                        onChange={e => setChildFirstName(e.target.value)}
                        required
                        className="w-full rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none transition focus:border-brand-orange-500 font-sans"
                      />
                      <input
                        type="text"
                        placeholder="Child's Last Name *"
                        value={childLastName}
                        onChange={e => setChildLastName(e.target.value)}
                        required
                        className="w-full rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none transition focus:border-brand-orange-500 font-sans"
                      />
                    </div>
                  </div>

                  {/* Parent Info */}
                  <div className="space-y-2.5 rounded-2xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/50 p-4">
                    <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-orange-600 dark:text-brand-orange-400 block">
                      Parent / Guardian Information
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Parent's First Name"
                        value={parentFirstName}
                        onChange={e => setParentFirstName(e.target.value)}
                        className="w-full rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none transition focus:border-brand-orange-500 font-sans"
                      />
                      <input
                        type="text"
                        placeholder="Parent's Last Name"
                        value={parentLastName}
                        onChange={e => setParentLastName(e.target.value)}
                        className="w-full rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none transition focus:border-brand-orange-500 font-sans"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="space-y-2.5 rounded-2xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/50 p-4">
                  <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-orange-600 dark:text-brand-orange-400 block">
                    Contact Information
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="tel"
                      placeholder="Phone (e.g. 555-123-4567)"
                      value={guardianPhone}
                      onChange={e => setGuardianPhone(e.target.value)}
                      className="w-full rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none transition focus:border-brand-orange-500 font-sans"
                    />
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={guardianEmail}
                      onChange={e => setGuardianEmail(e.target.value)}
                      className="w-full rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none transition focus:border-brand-orange-500 font-sans"
                    />
                  </div>
                </div>

                {/* Form Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-[#E2D5B7] dark:border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-xl border border-[#E2D5B7] dark:border-white/10 bg-[#F9F5EC] dark:bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition hover:bg-white dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-10 rounded-xl bg-gradient-to-r from-brand-orange-500 to-orange-600 px-5 text-xs font-bold text-white shadow-[0_0_20px_rgba(255,107,0,0.35)] transition-all hover:scale-[1.02] cursor-pointer flex items-center gap-2"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Logging Lead...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Save &amp; Log Lead</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 4 Pipeline Stage Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stage 1: New Inquiries */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 font-heading">
              <UserPlus className="w-3.5 h-3.5 text-brand-orange-500 dark:text-brand-orange-400" /> 1. Inquiries
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-brand-orange-500/10 text-brand-orange-600 dark:text-brand-orange-400 border border-brand-orange-500/20">
              {inquiryQueue.length}
            </span>
          </div>

          <div>
            {inquiryQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                icon={UserPlus}
                desc="New intake lead captured"
                mounted={mounted}
              />
            ))}

            {inquiryQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-slate-600 dark:text-zinc-500 border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                Zero inquiries pending.
              </div>
            )}
          </div>
        </div>

        {/* Stage 2: Documents Submitted for Review */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 font-heading">
              <FileCheck className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" /> 2. Doc Review
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {reviewQueue.length}
            </span>
          </div>

          <div>
            {reviewQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                icon={FileCheck}
                desc="Packet submitted by parent"
                mounted={mounted}
              />
            ))}

            {reviewQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-slate-600 dark:text-zinc-500 border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                Zero packets awaiting review.
              </div>
            )}
          </div>
        </div>

        {/* Stage 3: In Progress (Link Active / VOB / Assessment / PA) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 font-heading">
              <Clock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" /> 3. In Progress
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
              {inProgressQueue.length}
            </span>
          </div>

          <div>
            {inProgressQueue.map(c => {
              const isMagicLink = c.status === 'MAGIC_LINK_SENT';
              return (
                <QueueCard
                  key={c.id}
                  client={c}
                  icon={isMagicLink ? Mail : Clock}
                  desc={isMagicLink ? "Magic link sent to parent email" : `Status: ${c.status}`}
                  mounted={mounted}
                />
              );
            })}

            {inProgressQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-slate-600 dark:text-zinc-500 border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                Zero cases in active processing.
              </div>
            )}
          </div>
        </div>

        {/* Stage 4: Ready to Assign Case Coordinator */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 font-heading">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> 4. Ready to Assign
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              {readyToAssignQueue.length}
            </span>
          </div>

          <div>
            {readyToAssignQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                icon={UserCheck}
                desc="Intake complete. Ready for CC."
                mounted={mounted}
              />
            ))}

            {readyToAssignQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-slate-600 dark:text-zinc-500 border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                Zero clients awaiting CC assignment.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
