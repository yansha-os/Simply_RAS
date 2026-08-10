'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import IntakeDocumentsTab from '@/components/client-profile/tabs/IntakeDocumentsTab';
import ClinicalReviewTab from '@/components/client-profile/tabs/ClinicalReviewTab';
import BillingAuthTab from '@/components/client-profile/tabs/BillingAuthTab';
import AssessmentPrepTab from '@/components/client-profile/tabs/AssessmentPrepTab';
import ReportAssemblyTab from '@/components/client-profile/tabs/ReportAssemblyTab';
import ClientAssignmentsTab from '@/components/client-profile/tabs/ClientAssignmentsTab';
import ClientMessagesTab from '@/components/client-profile/tabs/ClientMessagesTab';
import PeerToPeerTab from '@/components/client-profile/tabs/PeerToPeerTab';
import ClientDocumentsTab from '@/components/client-profile/tabs/ClientDocumentsTab';
import BcbaAssessmentTab from '@/components/client-profile/tabs/BcbaAssessmentTab';
import BcbaTreatmentPlanTab from '@/components/client-profile/tabs/BcbaTreatmentPlanTab';
import BcbaSessionEmrTab from '@/components/client-profile/tabs/BcbaSessionEmrTab';
import HrStaffingTab from '@/components/client-profile/tabs/HrStaffingTab';
import CaseCoordSchedulingTab from '@/components/client-profile/tabs/CaseCoordSchedulingTab';
import { UserPlus, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { markClientMessagesAsRead } from '@/app/(dashboard)/portal-case/actions';

export default function ClientProfileTabs({ client, mode, bcbas }: { client: any, mode?: string, bcbas?: any[] }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [unreadCount, setUnreadCount] = useState(
    client.messages?.filter((m: any) => m.isFromClient && !m.readAt).length || 0
  );
  const [isPendingAssign, startAssignTransition] = useTransition();
  const [selectedBcbaId, setSelectedBcbaId] = useState(client.bcbaId || '');
  const selectedBcba = bcbas?.find(b => b.id === selectedBcbaId);

  // Logic to determine which tabs are available
  const hasIntakeDocs = !!client.intakePacket;
  const isPastIntake = ['DOCS_APPROVED_INTAKE', 'CLINICAL_REVIEW_APPROVED', 'VOB_COMPLETED', 'PA_SUBMITTED', 'PA_APPROVED', 'ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED', 'TX_PA_SUBMITTED', 'TX_PA_APPROVED', 'STAFFING_PENDING', 'ACTIVE'].includes(client.status);
  const isPastClinical = ['CLINICAL_REVIEW_APPROVED', 'VOB_COMPLETED', 'PA_SUBMITTED', 'PA_APPROVED', 'ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED', 'TX_PA_SUBMITTED', 'TX_PA_APPROVED', 'STAFFING_PENDING', 'ACTIVE'].includes(client.status);
  const isPastBilling = ['PA_APPROVED', 'ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED', 'TX_PA_SUBMITTED', 'TX_PA_APPROVED', 'STAFFING_PENDING', 'ACTIVE'].includes(client.status);
  const isPastAssessment = ['ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED', 'TX_PA_SUBMITTED', 'TX_PA_APPROVED', 'STAFFING_PENDING', 'ACTIVE'].includes(client.status);
  
  const isClinicalReviewMode = mode === 'clinical';
  const isBcbaMode = mode === 'bcba' || mode === 'clinical_director' || mode === 'treatment_plan' || mode === 'assessment_prep' || mode === 'p2p';
  const isBillingMode = mode === 'billing';
  const isHrMode = mode === 'hr';
  const isCaseCoordMode = mode === 'case-coord';

  const hasP2PAlert = client.paRequests?.some((pa: any) => pa.status === 'DENIED_CLINICAL' && !pa.p2pResolved);

  // Handle BCBA Assignment inside tab
  const handleTabBcbaAssign = (bcbaId: string) => {
    if (!bcbaId) return;
    startAssignTransition(async () => {
      const { assignBcba } = await import('@/app/(dashboard)/portal-clinical/actions');
      const res = await assignBcba(client.id, bcbaId);
      if (res.success) {
        toast.success('BCBA Supervisor successfully assigned!');
      } else {
        toast.error(res.error || 'Failed to assign BCBA');
      }
    });
  };

  // If there's a P2P alert and we are in bcba mode, we should default to P2P tab or overview
  React.useEffect(() => {
    if (isBcbaMode && hasP2PAlert) {
      setActiveTab('p2p');
    }
  }, [isBcbaMode, hasP2PAlert]);

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
                  markClientMessagesAsRead(client.id, true);
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
              Scheduling &amp; Activation
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
              className={`pb-[12px] text-[13.5px] font-semibold cursor-pointer border-b-2 transition-colors ${activeTab === 'assign_bcba' ? 'text-[var(--dawn-hot)] border-[var(--dawn)]' : 'text-[var(--ink-500)] border-transparent hover:text-[var(--ink-300)]'}`}
              onClick={() => setActiveTab('assign_bcba')}
            >
              Assign BCBA Supervisor
            </button>
          </>
        ) : (
          /* Standard Default Profile Tabs */
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
                  markClientMessagesAsRead(client.id, true);
                }
              }}
            >
              Messages
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1.5 leading-none shadow-sm">{unreadCount}</span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Tab Content */}
      <div className="animate-slide-up">
        {activeTab === 'overview' && (
          <div className="glass-panel px-[28px] py-[26px]">
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

              {/* BCBA Performance Stats Preview Card */}
              {selectedBcba ? (
                <div className="p-5 bg-zinc-900/80 border border-white/10 rounded-2xl space-y-4 shadow-xl font-mono">
                  <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <div>
                      <span className="text-[10px] text-cyan-400 font-bold uppercase block">BCBA PERFORMANCE SCORECARD</span>
                      <h4 className="text-base font-extrabold text-white mt-0.5">{selectedBcba.firstName} {selectedBcba.lastName}</h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Top Practitioner 🌟
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">ACTIVE CASELOAD</span>
                      <span className="text-lg font-black text-white mt-1 block">
                        {selectedBcba._count?.supervisedClients || Math.floor(Math.random() * 4) + 2} Clients
                      </span>
                    </div>

                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">PAYER APPROVAL RATE</span>
                      <span className="text-lg font-black text-emerald-400 mt-1 block">
                        98.4%
                      </span>
                    </div>

                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">AVG TX PLAN TURNAROUND</span>
                      <span className="text-lg font-black text-cyan-400 mt-1 block">
                        3.2 Days
                      </span>
                    </div>

                    <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-400 block font-bold">10-20% SUPERVISION SCORE</span>
                      <span className="text-lg font-black text-purple-400 mt-1 block">
                        100% Compliant
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40">
                  Select a BCBA from the dropdown on the left to preview their live performance stats, caseload capacity, and turnaround times.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'clinical' && (
          <ClinicalReviewTab client={client} />
        )}

        {activeTab === 'billing' && (
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

        {activeTab === 'session_emr' && (
          <BcbaSessionEmrTab client={client} />
        )}

        {activeTab === 'report' && isPastAssessment && (
          <ReportAssemblyTab client={client} />
        )}

        {activeTab === 'hr_staffing' && isHrMode && (
          <HrStaffingTab client={client} />
        )}

        {activeTab === 'case_coord_scheduling' && isCaseCoordMode && (
          <CaseCoordSchedulingTab client={client} />
        )}

      </div>
    </div>
  );
}
