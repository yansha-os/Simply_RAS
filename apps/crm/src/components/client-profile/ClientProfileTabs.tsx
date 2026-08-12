'use client';

import { useState, useTransition } from 'react';
import type { Prisma } from '@repo/db';
import { Button } from '@/components/ui/Button';
import IntakeDocumentsTab from '@/components/client-profile/tabs/IntakeDocumentsTab';
import ClinicalReviewTab from '@/components/client-profile/tabs/ClinicalReviewTab';
import BillingAuthTab from '@/components/client-profile/tabs/BillingAuthTab';
import ReportAssemblyTab from '@/components/client-profile/tabs/ReportAssemblyTab';
import ClientAssignmentsTab from '@/components/client-profile/tabs/ClientAssignmentsTab';
import ClientMessagesTab from '@/components/client-profile/tabs/ClientMessagesTab';
import PeerToPeerTab from '@/components/client-profile/tabs/PeerToPeerTab';
import ClientDocumentsTab from '@/components/client-profile/tabs/ClientDocumentsTab';
import BcbaAssessmentTab from '@/components/client-profile/tabs/BcbaAssessmentTab';
import BcbaTreatmentPlanTab from '@/components/client-profile/tabs/BcbaTreatmentPlanTab';
import BcbaSessionEmrTab from '@/components/client-profile/tabs/BcbaSessionEmrTab';
import ClinicalGoalsTab from '@/components/client-profile/tabs/ClinicalGoalsTab';
import ClinicalChartProgressTab from '@/components/client-profile/tabs/ClinicalChartProgressTab';
import StaffingIntegrityTab from '@/components/client-profile/tabs/HrStaffingTab';
import CaseCoordSchedulingTab from '@/components/client-profile/tabs/CaseCoordSchedulingTab';
import { UserPlus, CheckCircle2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { markClientMessagesAsRead } from '@/app/(dashboard)/portal-case/actions';
import { getStatusGuidance, statusIndex } from '@/lib/clientStatusGates';
import {
  resolveActiveClientProfileTab,
  resolveRequestedClientProfileTab,
  shouldShowStaffingIntegrityTab,
  type ClientProfileTab,
  type ClientProfileTabSelection,
} from '@/lib/clientProfileTabs';

type ClientProfileData = Prisma.ClientGetPayload<{
  include: {
    intakePacket: true;
    paRequests: true;
    authorizations: {
      include: { cptCodes: true };
    };
    bcba: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
        role: true;
      };
    };
    rbt: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
        role: true;
      };
    };
    messages: true;
    sessions: {
      include: {
        rbt: {
          select: { id: true; firstName: true; lastName: true };
        };
        bcba: {
          select: { id: true; firstName: true; lastName: true };
        };
        note: {
          select: {
            id: true;
            sessionId: true;
            rbtSigned: true;
            parentSigned: true;
            bcbaSigned: true;
            clinicalContent: true;
            billableUnits: true;
            rbtSignedAt: true;
            parentSignedAt: true;
            bcbaSignedAt: true;
            rbtSignerName: true;
            parentSignerName: true;
            bcbaSignerName: true;
            plutusClaimRef: true;
            convertedAt: true;
            isConverted: true;
            createdAt: true;
            updatedAt: true;
          };
        };
      };
    };
    caseOpenings: {
      include: {
        applications: {
          include: {
            rbt: {
              select: {
                id: true;
                firstName: true;
                lastName: true;
                email: true;
              };
            };
          };
        };
      };
    };
  };
}>;

type BcbaOption = Prisma.UserGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    _count: {
      select: { supervisedClients: true };
    };
  };
}>;

type ClientProfileTabsProps = {
  client: ClientProfileData;
  mode?: string;
  tab?: string;
  bcbas?: BcbaOption[];
};

export default function ClientProfileTabs({
  client,
  mode,
  tab,
  bcbas,
}: ClientProfileTabsProps) {
  const isCaseCoordMode = mode === 'case-coord';
  const isClinicalReviewMode = mode === 'clinical';
  const isBcbaMode =
    mode === 'bcba' ||
    mode === 'clinical_director' ||
    mode === 'treatment_plan' ||
    mode === 'assessment_prep' ||
    mode === 'p2p';
  const isBillingMode = mode === 'billing';
  const showClinicalGoalsTab = isBcbaMode || isClinicalReviewMode || isCaseCoordMode;
  // Canonical pipeline order (clientStatusGates) — DISCHARGED is past ACTIVE, so
  // discharged clients keep read-only chart history instead of losing the tab.
  const hasReachedActive = statusIndex(client.status) >= statusIndex('ACTIVE');
  const showChartProgressTab =
    hasReachedActive && (isBcbaMode || isClinicalReviewMode || isCaseCoordMode);
  const showStaffingIntegrityTab = shouldShowStaffingIntegrityTab(mode, client.status);

  /** Deep-links: billing/auth · staffing/activation · staffing_integrity · goals · chart_progress */
  const wantsBilling =
    isBillingMode ||
    tab === 'billing' ||
    tab === 'auth' ||
    tab === 'auth_units' ||
    tab === 'auth-units' ||
    tab === 'pa';
  const wantsFirstSession =
    tab === 'first_session' ||
    tab === 'activation' ||
    tab === 'first-session' ||
    tab === 'staffing';
  const hasP2PAlert = client.paRequests.some(
    (pa) => pa.status === 'DENIED_CLINICAL' && !pa.p2pResolved
  );
  const requestedTab = resolveRequestedClientProfileTab({
    mode,
    queryTab: tab,
    hasP2PAlert,
    showChartProgressTab,
    showStaffingIntegrityTab,
  });
  const tabContextKey = [
    client.id,
    mode ?? '',
    tab ?? '',
    requestedTab,
  ].join('|');
  const [tabSelection, setTabSelection] = useState<ClientProfileTabSelection>(() => ({
    contextKey: tabContextKey,
    tab: requestedTab,
  }));
  const activeTab = resolveActiveClientProfileTab(
    tabSelection,
    tabContextKey,
    requestedTab
  );
  const setActiveTab = (nextTab: ClientProfileTab) => {
    setTabSelection({ contextKey: tabContextKey, tab: nextTab });
  };
  const [unreadCount, setUnreadCount] = useState(
    client.messages.filter((message) => message.isFromClient && !message.readAt).length
  );
  const [isPendingAssign, startAssignTransition] = useTransition();
  const [selectedBcbaId, setSelectedBcbaId] = useState(client.bcbaId || '');
  const selectedBcba = bcbas?.find(b => b.id === selectedBcbaId);

  const hasIntakeDocs = !!client.intakePacket;
  // Derived from the canonical pipeline order instead of a hardcoded status list
  // (the old list drifted: it omitted DISCHARGED, hiding Report Assembly post-discharge).
  const isPastAssessment = statusIndex(client.status) >= statusIndex('ASSESSMENT_SCHEDULED');

  // Handle BCBA Assignment inside tab
  const handleTabBcbaAssign = (bcbaId: string) => {
    if (!bcbaId) return;
    startAssignTransition(async () => {
      const { assignBcba } = await import('@/app/(dashboard)/portal-clinical/actions');
      const res = await assignBcba({
        clientId: client.id,
        bcbaId,
        expectedBcbaId: client.bcbaId ?? null,
        reason: 'BCBA assigned from client profile',
      });
      if (res.success) {
        toast.success('BCBA Supervisor successfully assigned!');
      } else {
        toast.error(res.error || 'Failed to assign BCBA');
      }
    });
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-[26px] border-b border-[var(--line)] mb-[22px]">
        {/* Tabs for Case Coordinator Mode */}
        {isCaseCoordMode ? (
          <>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'overview' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'documents' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('documents')}
            >
              Documents
            </button>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors flex items-center ${activeTab === 'messages' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => {
                setActiveTab('messages');
                if (unreadCount > 0) {
                  setUnreadCount(0);
                  markClientMessagesAsRead(client.id);
                }
              }}
            >
              Messages
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 leading-none shadow-sm">{unreadCount}</span>
              )}
            </button>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'case_coord_scheduling' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('case_coord_scheduling')}
            >
              Staffing · First Session
            </button>
            {showStaffingIntegrityTab && (
              <button
                suppressHydrationWarning
                className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'staffing_integrity' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
                onClick={() => setActiveTab('staffing_integrity')}
              >
                Staffing Integrity
              </button>
            )}
            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'clinical_goals' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('clinical_goals')}
            >
              Clinical Goals
            </button>
            {showChartProgressTab && (
              <button
                suppressHydrationWarning
                className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'chart_progress' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
                onClick={() => setActiveTab('chart_progress')}
              >
                Chart Progress
              </button>
            )}
          </>
        ) : isBillingMode ? (
          /* Billing Mode — PA tracker + Auth Units */
          <>
            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'billing' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('billing')}
            >
              PA &amp; Auth Units
            </button>
            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'overview' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'documents' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('documents')}
            >
              Documents
            </button>
            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors flex items-center ${activeTab === 'messages' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => {
                setActiveTab('messages');
                if (unreadCount > 0) {
                  setUnreadCount(0);
                  markClientMessagesAsRead(client.id);
                }
              }}
            >
              Messages
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 leading-none shadow-sm">{unreadCount}</span>
              )}
            </button>
          </>
        ) : isBcbaMode ? (
          /* BCBA / Clinical Director Mode Tabs */
          <>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'overview' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>

            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'bcba_documents' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('bcba_documents')}
            >
              Clinical Documents
            </button>

            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'clinical_goals' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('clinical_goals')}
            >
              Clinical Goals
            </button>

            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'treatment_plan' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('treatment_plan')}
            >
              Treatment Plan
            </button>

            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'assign_bcba' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('assign_bcba')}
            >
              Assign BCBA Supervisor
            </button>

            <button
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'session_emr' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('session_emr')}
            >
              Session EMR
            </button>

            {showChartProgressTab && (
              <button
                suppressHydrationWarning
                className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'chart_progress' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
                onClick={() => setActiveTab('chart_progress')}
              >
                Chart Progress
              </button>
            )}
          </>
        ) : (
          /* Standard Default Profile Tabs (+ clinical mode Goals) */
          <>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'overview' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'documents' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('documents')}
            >
              Documents
            </button>
            <button 
              suppressHydrationWarning
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors flex items-center ${activeTab === 'messages' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => {
                setActiveTab('messages');
                if (unreadCount > 0) {
                  setUnreadCount(0);
                  markClientMessagesAsRead(client.id);
                }
              }}
            >
              Messages
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 leading-none shadow-sm">{unreadCount}</span>
              )}
            </button>
            {isClinicalReviewMode && (
              <button
                suppressHydrationWarning
                className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'clinical_goals' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
                onClick={() => setActiveTab('clinical_goals')}
              >
                Clinical Goals
              </button>
            )}
            {showChartProgressTab && (
              <button
                suppressHydrationWarning
                className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'chart_progress' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
                onClick={() => setActiveTab('chart_progress')}
              >
                Chart Progress
              </button>
            )}
          </>
        )}
      </div>

      {/* Tab Content */}
      <div className="animate-slide-up">
        {activeTab === 'overview' && (
          <div className="glass-panel px-[28px] py-[26px]">
            {(() => {
              const gate = getStatusGuidance(client.status);
              const staffingHold =
                client.status === 'STAFFING_PENDING' || client.status === 'TX_PA_APPROVED';
              return (
                <div
                  className={`mb-[22px] rounded-[12px] border px-4 py-3 ${
                    staffingHold
                      ? 'border-amber-500/25 bg-amber-500/[0.06]'
                      : 'border-white/10 bg-zinc-950/50'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-mono text-[10px] font-semibold tracking-[0.8px] text-zinc-500 uppercase">
                      Pipeline next action
                    </span>
                    <span className="font-mono text-[10px] text-zinc-600">·</span>
                    <span className="font-mono text-[10px] text-zinc-400">{gate.owner}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dawn-hot)]" />
                    <p className="text-[13px] text-zinc-200 leading-snug">{gate.nextAction}</p>
                  </div>
                  {staffingHold && (
                    <p className="mt-2 font-mono text-[10px] text-amber-400/90">
                      Bridge E — ACTIVE only after first durable therapy Session; not by staffing accept.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center gap-[10px] mb-[22px]">
              <div className="w-[26px] h-[26px] rounded-[7px] bg-[rgba(79,232,206,0.1)] border border-[rgba(79,232,206,0.25)] flex items-center justify-center text-[12px] text-[var(--teal)]">
                ◍
              </div>
              <div className="font-heading text-[18px] font-semibold">Client Demographics</div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-[40px] gap-y-[22px]">
              <div className="pb-[14px] border-b border-[var(--line)]">
                <div className="font-mono text-[10px] text-[var(--dawn)] tracking-[.6px] uppercase mb-[6px]">Child Name</div>
                <div className="text-[14.5px] text-[var(--ink-100)] font-medium">{client.firstName} {client.lastName}</div>
              </div>
              <div className="pb-[14px] border-b border-[var(--line)]">
                <div className="font-mono text-[10px] text-[var(--dawn)] tracking-[.6px] uppercase mb-[6px]">Child Age</div>
                <div className="text-[14.5px] text-[var(--ink-500)] italic">{client.childAge || 'Not provided'}</div>
              </div>
              <div className="pb-[14px] border-b border-[var(--line)]">
                <div className="font-mono text-[10px] text-[var(--dawn)] tracking-[.6px] uppercase mb-[6px]">Parent Name</div>
                <div className="text-[14.5px] text-[var(--ink-100)] font-medium">{client.guardianName}</div>
              </div>
              <div className="pb-[14px] border-b border-[var(--line)]">
                <div className="font-mono text-[10px] text-[var(--dawn)] tracking-[.6px] uppercase mb-[6px]">Parent Phone</div>
                <div className="font-mono text-[13.5px] text-[var(--teal)]">{client.guardianPhone}</div>
              </div>
              <div className="pb-[14px] border-b border-[var(--line)]">
                <div className="font-mono text-[10px] text-[var(--dawn)] tracking-[.6px] uppercase mb-[6px]">Parent Address</div>
                <div className="font-mono text-[13.5px] text-[var(--teal)]">{client.parentAddress}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          hasIntakeDocs ? <IntakeDocumentsTab client={client} isCaseCoordMode={isCaseCoordMode} /> : <div className="text-[var(--ink-500)] text-[14px]">No intake packet generated yet.</div>
        )}
        
        {activeTab === 'messages' && (
          <ClientMessagesTab clientId={client.id} initialMessages={client.messages || []} />
        )}

        {activeTab === 'p2p' && (
          <PeerToPeerTab client={client} />
        )}

        {activeTab === 'bcba_documents' && (
          <ClientDocumentsTab client={client} />
        )}

        {activeTab === 'assign_bcba' && (
          <div className="glass-panel px-[28px] py-[26px] space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <div>
                <h3 className="font-heading text-[18px] font-semibold text-[var(--ink-100)] flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[var(--teal)]" /> Assign BCBA Supervisor
                </h3>
                <p className="text-[13px] text-[var(--ink-400)] mt-0.5">Select a staff BCBA to view live performance stats before confirming assignment.</p>
              </div>

              <div className="text-right">
                <span className="font-mono text-[10px] text-[var(--dawn)] uppercase tracking-wider block font-bold">Current Assigned BCBA</span>
                <span className="text-[14px] font-semibold text-[var(--ink-100)]">
                  {client.bcba ? `${client.bcba.firstName} ${client.bcba.lastName}` : 'Unassigned (Clinical Director Owned)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-2">
              {/* Dropdown Selector */}
              <div className="space-y-4">
                <label className="block font-mono text-[11px] font-bold text-[var(--ink-300)] uppercase">
                  Select BCBA Candidate:
                </label>
                <select
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-cyan-500 cursor-pointer font-sans"
                  value={selectedBcbaId}
                  onChange={e => setSelectedBcbaId(e.target.value)}
                >
                  <option value="">-- Choose BCBA to Inspect Stats --</option>
                  {bcbas?.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.firstName} {b.lastName}
                    </option>
                  ))}
                </select>

                <Button
                  onClick={() => handleTabBcbaAssign(selectedBcbaId)}
                  disabled={!selectedBcbaId || selectedBcbaId === client.bcbaId || isPendingAssign}
                  className={`w-full font-bold text-xs h-10 rounded-xl cursor-pointer transition-all ${
                    selectedBcbaId && selectedBcbaId !== client.bcbaId
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-500 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Confirm BCBA Assignment
                </Button>
              </div>

              {/* BCBA assignment evidence preview card */}
              {selectedBcba ? (
                <div className="p-5 bg-zinc-900/80 border border-white/10 rounded-2xl space-y-4 shadow-xl font-mono">
                  <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <div>
                      <span className="text-[10px] text-cyan-400 font-bold uppercase block">BCBA ASSIGNMENT SNAPSHOT</span>
                      <h4 className="text-base font-extrabold text-white mt-0.5">{selectedBcba.firstName} {selectedBcba.lastName}</h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      Assignment preview
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">ASSIGNED CLIENTS</span>
                      <span className="text-lg font-black text-white mt-1 block">
                        {selectedBcba._count?.supervisedClients ?? 0} Clients
                      </span>
                    </div>

                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">PAYER OUTCOME METRIC</span>
                      <span className="text-lg font-black text-zinc-300 mt-1 block">
                        N/A
                      </span>
                      <span className="text-[9px] text-zinc-500 mt-1 block">Evidence unavailable</span>
                    </div>

                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">PLAN TURNAROUND METRIC</span>
                      <span className="text-lg font-black text-zinc-300 mt-1 block">
                        N/A
                      </span>
                      <span className="text-[9px] text-zinc-500 mt-1 block">Evidence unavailable</span>
                    </div>

                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">SUPERVISION ASSESSMENT</span>
                      <span className="text-lg font-black text-zinc-300 mt-1 block">
                        N/A
                      </span>
                      <span className="text-[9px] text-amber-300/80 mt-1 block">Policy not configured · Evidence unavailable</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  Select a BCBA from the dropdown on the left to preview their assigned-client count and available evidence states.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'clinical' && (
          <ClinicalReviewTab client={client} />
        )}

        {activeTab === 'billing' && (isBillingMode || wantsBilling) && (
          <BillingAuthTab client={client} />
        )}

        {activeTab === 'assignments' && (
          <ClientAssignmentsTab client={client} />
        )}

        {activeTab === 'assessment' && (
          <BcbaAssessmentTab client={client} />
        )}

        {activeTab === 'treatment_plan' && (
          <BcbaTreatmentPlanTab client={client} />
        )}

        {activeTab === 'clinical_goals' && showClinicalGoalsTab && (
          <ClinicalGoalsTab
            client={client}
            onOpenTreatmentPlan={() => setActiveTab('treatment_plan')}
          />
        )}

        {activeTab === 'session_emr' && (
          <BcbaSessionEmrTab client={client} />
        )}

        {activeTab === 'chart_progress' && showChartProgressTab && (
          <ClinicalChartProgressTab
            clientId={client.id}
            clientStatus={client.status}
          />
        )}

        {activeTab === 'report' && isPastAssessment && (
          <ReportAssemblyTab client={client} />
        )}

        {activeTab === 'staffing_integrity' && showStaffingIntegrityTab && (
          <StaffingIntegrityTab client={client} />
        )}

        {activeTab === 'case_coord_scheduling' && isCaseCoordMode && (
          <CaseCoordSchedulingTab
            client={client}
            initialSubTab={wantsFirstSession ? 'activation' : 'job_board'}
          />
        )}

      </div>
    </div>
  );
}
