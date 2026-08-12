'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { UserPlus, Mail, FileCheck, ArrowRight, Loader2, UserCheck, Clock, Plus, Phone, Globe } from 'lucide-react';
import Link from 'next/link';
import { createInquiry, generateMagicLink } from '@/app/(dashboard)/portal-case/actions';
import { Button } from '@/components/ui/Button';

export default function IntakeQueue({ clients, coordinators }: { clients: any[], coordinators?: any[] }) {
  const [mounted, setMounted] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [childFirstName, setChildFirstName] = useState('');
  const [childLastName, setChildLastName] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('English');

  React.useEffect(() => setMounted(true), []);
  
  // 5 Operational Pipeline Stages
  const inquiryQueue = clients.filter(c => c.status === 'INQUIRY');
  const waitingQueue = clients.filter(c => c.status === 'MAGIC_LINK_SENT');
  const reviewQueue = clients.filter(c => c.status === 'DOCS_SUBMITTED');
  const inProgressQueue = clients.filter(c => [
    'DOCS_APPROVED_INTAKE', 
    'CLINICAL_REVIEW_APPROVED', 
    'VOB_COMPLETED', 
    'PA_SUBMITTED', 
    'PA_APPROVED', 
    'ASSESSMENT_SCHEDULED', 
    'REPORT_ASSEMBLED', 
    'TX_PA_SUBMITTED', 
    'TX_PA_APPROVED'
  ].includes(c.status));
  const readyToAssignQueue = clients.filter(c => c.status === 'STAFFING_PENDING' && !c.caseCoordinatorId);

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
      formData.append('preferredLanguage', preferredLanguage);

      await createInquiry({}, formData);
      setChildFirstName('');
      setChildLastName('');
      setParentFirstName('');
      setParentLastName('');
      setGuardianPhone('');
      setGuardianEmail('');
      setPreferredLanguage('English');
      setShowAddForm(false);
    });
  };

  const QueueCard = ({ client, title, icon: Icon, desc, action, badge }: { client: any, title: string, icon: any, desc: string, action?: React.ReactNode, badge?: string }) => {
    const unreadCount = client.messages?.filter((m: any) => m.isFromClient && !m.readAt).length || 0;
    
    return (
      <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 hover:border-brand-orange-500/50 transition-all duration-300 cursor-pointer group mb-3 shadow-xl rounded-2xl overflow-hidden hover:scale-[1.01]">
        <Link href={`/client/${client.id}`} className="block p-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h4 className="font-bold text-white group-hover:text-brand-orange-400 transition-colors flex items-center gap-2 text-sm">
                {client.firstName} {client.lastName}
                {unreadCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full text-center leading-none shadow-md animate-pulse">
                    {unreadCount} new
                  </span>
                )}
              </h4>
              <p className="text-xs text-zinc-400 font-sans">{desc}</p>
              {client.guardianName && (
                <p className="text-[11px] text-zinc-500 font-sans">Parent: {client.guardianName}</p>
              )}
              {badge && (
                <div className="mt-2 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20 inline-block uppercase tracking-wider">
                  {badge}
                </div>
              )}
            </div>
            <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-brand-orange-400 group-hover:border-brand-orange-500/30 transition-all shrink-0 ml-2 shadow-sm">
              <Icon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
            <div className="text-[10px] text-zinc-500 font-mono uppercase font-bold tracking-wider">
              Updated {mounted ? new Date(client.updatedAt).toLocaleDateString() : ''}
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-brand-orange-400 group-hover:translate-x-1 transition-all" />
          </div>
        </Link>
        {action && (
          <div className="p-3 bg-zinc-900/90 border-t border-white/5" onClick={e => e.stopPropagation()}>
            {action}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white font-heading">Intake Operational Queue</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Log inquiries, deliver magic links, review packets, track in-progress cases &amp; assign coordinators</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gradient-to-r from-brand-orange-500 to-orange-600 text-white font-bold text-xs px-4 h-9 rounded-xl shadow-[0_0_15px_rgba(255,107,0,0.3)] transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Log New Lead
          </Button>
        </div>
      </div>

      {/* Log New Lead Form Modal / Dropdown */}
      {showAddForm && (
        <Card className="bg-zinc-900/95 border border-brand-orange-500/40 backdrop-blur-2xl p-6 rounded-2xl shadow-2xl space-y-4 animate-fade-in-up">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <h4 className="text-base font-bold text-white font-heading flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-brand-orange-400" /> Log New Client Lead
            </h4>
            <span className="text-xs font-mono text-zinc-400">Intake Lead Capture</span>
          </div>

          <form onSubmit={handleCreateInquirySubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Child Info */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-brand-orange-400 uppercase tracking-wider block">Child Information</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Child's First Name *"
                    value={childFirstName}
                    onChange={e => setChildFirstName(e.target.value)}
                    required
                    className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-orange-500 font-sans"
                  />
                  <input
                    type="text"
                    placeholder="Child's Last Name *"
                    value={childLastName}
                    onChange={e => setChildLastName(e.target.value)}
                    required
                    className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-orange-500 font-sans"
                  />
                </div>
              </div>

              {/* Parent Info */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-brand-orange-400 uppercase tracking-wider block">Parent / Guardian Information</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Parent's First Name"
                    value={parentFirstName}
                    onChange={e => setParentFirstName(e.target.value)}
                    className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-orange-500 font-sans"
                  />
                  <input
                    type="text"
                    placeholder="Parent's Last Name"
                    value={parentLastName}
                    onChange={e => setParentLastName(e.target.value)}
                    className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-orange-500 font-sans"
                  />
                </div>
              </div>
            </div>

            {/* Contact Details & Language */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="tel"
                placeholder="Parent Phone Number"
                value={guardianPhone}
                onChange={e => setGuardianPhone(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-orange-500 font-sans"
              />
              <input
                type="email"
                placeholder="Parent Email"
                value={guardianEmail}
                onChange={e => setGuardianEmail(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-orange-500 font-sans"
              />
              <select
                value={preferredLanguage}
                onChange={e => setPreferredLanguage(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer focus:border-brand-orange-500 font-sans"
              >
                <option value="English">English (Default)</option>
                <option value="Spanish">Spanish</option>
                <option value="Arabic">Arabic</option>
                <option value="Creole">Creole</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <Button type="button" onClick={() => setShowAddForm(false)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-4 h-9 rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="bg-gradient-to-r from-brand-orange-500 to-orange-600 hover:from-brand-orange-600 text-white font-bold text-xs px-5 h-9 rounded-xl shadow-lg">
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log Client Lead'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 5 Pipeline Stage Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Stage 1: New Inquiries */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 font-heading">
              <UserPlus className="w-3.5 h-3.5 text-brand-orange-400" /> 1. Inquiries
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20">
              {inquiryQueue.length}
            </span>
          </div>

          <div>
            {inquiryQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="Send Onboarding Magic Link"
                icon={Mail}
                desc="New lead. Magic link required."
                badge="Inquiry Lead"
                action={
                  <Button 
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        await generateMagicLink(c.id);
                      });
                    }}
                    className="w-full bg-gradient-to-r from-brand-orange-500 to-orange-600 hover:from-brand-orange-600 hover:to-orange-700 text-white font-bold text-xs h-8 rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    <span>Send Parent Link</span>
                  </Button>
                }
              />
            ))}

            {inquiryQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                Zero inquiries pending.
              </div>
            )}
          </div>
        </div>

        {/* Stage 2: Parent Magic Links Sent */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 font-heading">
              <Mail className="w-3.5 h-3.5 text-amber-400" /> 2. Link Sent
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {waitingQueue.length}
            </span>
          </div>

          <div>
            {waitingQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="Awaiting Parent Completion"
                icon={Mail}
                desc="Magic link sent to parent email."
                badge="Portal Active"
              />
            ))}

            {waitingQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                Zero links awaiting parent.
              </div>
            )}
          </div>
        </div>

        {/* Stage 3: Documents Submitted for Review */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 font-heading">
              <FileCheck className="w-3.5 h-3.5 text-rose-400" /> 3. Doc Review
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {reviewQueue.length}
            </span>
          </div>

          <div>
            {reviewQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="Review Documents"
                icon={FileCheck}
                desc="Parent submitted packet."
                badge="Action Needed"
              />
            ))}

            {reviewQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                Zero packets awaiting review.
              </div>
            )}
          </div>
        </div>

        {/* Stage 4: In Progress (VOB / Assessment / PA) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 font-heading">
              <Clock className="w-3.5 h-3.5 text-cyan-400" /> 4. In Progress
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {inProgressQueue.length}
            </span>
          </div>

          <div>
            {inProgressQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="Active Processing"
                icon={Clock}
                desc={`Status: ${c.status}`}
                badge="Billing / Clinical"
              />
            ))}

            {inProgressQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                Zero cases in active processing.
              </div>
            )}
          </div>
        </div>

        {/* Stage 5: Ready to Assign Case Coordinator */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-white text-xs flex items-center gap-1.5 font-heading">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> 5. Ready to Assign
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {readyToAssignQueue.length}
            </span>
          </div>

          <div>
            {readyToAssignQueue.map(c => (
              <QueueCard
                key={c.id}
                client={c}
                title="Assign Coordinator"
                icon={UserCheck}
                desc="Intake complete. Ready for CC."
                badge="Ready to Assign"
              />
            ))}

            {readyToAssignQueue.length === 0 && (
              <div className="p-6 text-center text-[11px] text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                Zero clients awaiting CC assignment.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
