'use client';

import React, { useState } from 'react';
import { ArrowRight, FileText, Sparkles, X } from 'lucide-react';
import {
  CLIENT_STATUS_PIPELINE,
  getStatusGuidance,
  statusIndex,
} from '@/lib/clientStatusGates';

/** Collapsed visual spine — intermediate statuses map onto these nodes. */
const PIPELINE_STEPS = [
  { id: 'DOCS_SUBMITTED', label: 'Docs Rcvd', dept: 'Intake' },
  { id: 'DOCS_APPROVED_INTAKE', label: 'Clin Review', dept: 'Clinical' },
  { id: 'PA_SUBMITTED', label: 'Assess PA', dept: 'Billing' },
  { id: 'ASSESSMENT_SCHEDULED', label: 'Assessment', dept: 'BCBA' },
  { id: 'REPORT_ASSEMBLED', label: 'Tx Plan', dept: 'Clin Supp' },
  { id: 'TX_PA_SUBMITTED', label: 'Tx PA', dept: 'Billing' },
  { id: 'STAFFING_PENDING', label: 'Staffing', dept: 'Case Coord' },
  { id: 'ACTIVE', label: 'Active', dept: 'Clinical' },
] as const;

type PipelineStepId = (typeof PIPELINE_STEPS)[number]['id'];

/** Map full ClientStatus → collapsed FlowMap node (display only — never fakes ACTIVE). */
function mapToPipelineNode(status: string): {
  nodeId: PipelineStepId;
  labelOverride?: string;
} {
  switch (status) {
    case 'INQUIRY':
    case 'MAGIC_LINK_SENT':
      return { nodeId: 'DOCS_SUBMITTED', labelOverride: 'Awaiting Docs' };
    case 'DOCS_SUBMITTED':
      return { nodeId: 'DOCS_SUBMITTED' };
    case 'DOCS_APPROVED_INTAKE':
      return { nodeId: 'DOCS_APPROVED_INTAKE' };
    case 'CLINICAL_REVIEW_APPROVED':
      return { nodeId: 'PA_SUBMITTED', labelOverride: 'Pending VOB' };
    case 'VOB_COMPLETED':
      return { nodeId: 'PA_SUBMITTED', labelOverride: 'Needs PA Sub' };
    case 'PA_SUBMITTED':
      return { nodeId: 'PA_SUBMITTED' };
    case 'PA_APPROVED':
      return { nodeId: 'ASSESSMENT_SCHEDULED', labelOverride: "PA Appr'd" };
    case 'ASSESSMENT_SCHEDULED':
      return { nodeId: 'ASSESSMENT_SCHEDULED' };
    case 'REPORT_ASSEMBLED':
      return { nodeId: 'REPORT_ASSEMBLED' };
    case 'TX_PA_SUBMITTED':
      return { nodeId: 'TX_PA_SUBMITTED' };
    case 'TX_PA_APPROVED':
      return { nodeId: 'STAFFING_PENDING', labelOverride: 'Auth Granted' };
    case 'STAFFING_PENDING':
      return { nodeId: 'STAFFING_PENDING' };
    case 'ACTIVE':
      return { nodeId: 'ACTIVE' };
    case 'DISCHARGED':
      return { nodeId: 'ACTIVE', labelOverride: 'Discharged' };
    default:
      return { nodeId: 'DOCS_SUBMITTED', labelOverride: 'Unknown' };
  }
}

function parseRejections(raw: unknown): Record<string, string> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, string>;
  }
  return {};
}

export default function FlowMap({ client }: { client: any }) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const rawStatus: string = client.status;
  const guidance = getStatusGuidance(rawStatus);
  const mapped = mapToPipelineNode(rawStatus);
  let effectiveStatus: string = mapped.nodeId;
  const dynamicLabelOverrides: Record<string, string> = {};
  if (mapped.labelOverride) {
    dynamicLabelOverrides[mapped.nodeId] = mapped.labelOverride;
  }

  // NOTE: intakePacket is a single object (one-to-one), NOT an array
  const packet = client.intakePacket;
  if (packet) {
    const parsedRejections = parseRejections(packet.rejectionDetails);
    const hasRejections = Object.keys(parsedRejections).length > 0;

    if (packet.status === 'PENDING_CLIENT_SUBMISSION') {
      const pastIntake =
        statusIndex(rawStatus) >= statusIndex('DOCS_APPROVED_INTAKE');

      if (pastIntake) {
        dynamicLabelOverrides[effectiveStatus] = 'Changes Needed';
      } else {
        effectiveStatus = 'DOCS_SUBMITTED';
        dynamicLabelOverrides['DOCS_SUBMITTED'] =
          hasRejections || rawStatus === 'DOCS_SUBMITTED' ? 'Changes Needed' : 'Awaiting Docs';
      }
    } else if (packet.status === 'SUBMITTED') {
      if (rawStatus === 'DOCS_APPROVED_INTAKE') {
        effectiveStatus = 'DOCS_APPROVED_INTAKE';
        dynamicLabelOverrides['DOCS_APPROVED_INTAKE'] = 'Review Needed';
      } else if (rawStatus === 'DOCS_SUBMITTED' || rawStatus === 'MAGIC_LINK_SENT') {
        effectiveStatus = 'DOCS_SUBMITTED';
        dynamicLabelOverrides['DOCS_SUBMITTED'] = 'Review Needed';
      }
    }
  }

  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.id === effectiveStatus);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  // Honest progress: only stages BEFORE the current one count as complete.
  const pctComplete = Math.round((safeIndex / (PIPELINE_STEPS.length - 1)) * 100);
  const isStaffingHold = rawStatus === 'STAFFING_PENDING' || rawStatus === 'TX_PA_APPROVED';
  const isDischarged = rawStatus === 'DISCHARGED';
  const spineNumber = Math.max(1, statusIndex(rawStatus) + 1);
  const spineTotal = CLIENT_STATUS_PIPELINE.length;

  const selectedGuidance = selectedNode
    ? getStatusGuidance(selectedNode)
    : null;

  return (
    <div className="relative overflow-hidden rounded-[16px] border border-white/10 bg-zinc-950/80 backdrop-blur-xl px-[28px] py-[26px] mb-[22px] shadow-[0_0_40px_rgba(0,0,0,0.35)]">
      {/* Current-node pulse (scoped — `animate-pulse-glow` was never defined globally) */}
      <style>{`
        @keyframes fmNodePulse {
          0%, 100% { box-shadow: 0 0 0 5px rgba(255,122,69,0.12), 0 0 14px rgba(255,122,69,0.35); }
          50% { box-shadow: 0 0 0 8px rgba(255,122,69,0.20), 0 0 26px rgba(255,122,69,0.65); }
        }
        @keyframes fmNodePulseBlocked {
          0%, 100% { box-shadow: 0 0 0 5px rgba(239,68,68,0.12), 0 0 14px rgba(239,68,68,0.35); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0.22), 0 0 26px rgba(239,68,68,0.65); }
        }
        .fm-node-pulse { animation: fmNodePulse 2.2s ease-in-out infinite; }
        .fm-node-pulse-blocked { animation: fmNodePulseBlocked 2.2s ease-in-out infinite; }
      `}</style>
      <div
        className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,122,69,0.22), transparent 70%)' }}
      />

      <div className="relative flex items-center justify-between mb-[20px]">
        <div className="font-mono text-[11px] font-semibold tracking-[1.8px] text-zinc-500">
          MASTER PIPELINE
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500 tracking-wide">
            SPINE {spineNumber}/{spineTotal}
          </span>
          <span className="font-mono text-[11px] text-[var(--dawn-hot)]">
            STAGE {safeIndex + 1} / {PIPELINE_STEPS.length} · {pctComplete}%
          </span>
        </div>
      </div>

      {/* Current status · next action (always from raw Client.status — never collapsed fake ACTIVE) */}
      <div
        className={`relative mb-[22px] rounded-[12px] border px-4 py-3.5 transition-all duration-300 ${
          isDischarged
            ? 'border-zinc-500/30 bg-zinc-900/60'
            : isStaffingHold
              ? 'border-amber-500/30 bg-amber-500/[0.06] shadow-[0_0_24px_rgba(245,158,11,0.08)]'
              : 'border-brand-orange-500/25 bg-gradient-to-r from-brand-orange-500/[0.08] via-zinc-950/40 to-transparent'
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.6px] text-zinc-300">
                <span className="dot-live" />
                {rawStatus.replace(/_/g, ' ')}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[1px] text-zinc-500">
                {guidance.owner}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dawn-hot)] opacity-80" />
              <div>
                <p className="text-[12px] font-semibold text-white leading-snug">
                  Next: {guidance.nextAction}
                </p>
                <p className="mt-1 font-mono text-[10.5px] text-zinc-500">
                  {guidance.surface}
                </p>
              </div>
            </div>
          </div>
          {isStaffingHold && (
            <div className="shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Bridge E · no fake ACTIVE
            </div>
          )}
        </div>
      </div>

      <div className="relative h-[4px] rounded-[2px] bg-white/[0.06] mx-[21px] mb-[32px]">
        <div
          className="absolute top-0 left-0 h-full rounded-[2px] shadow-[0_0_12px_rgba(255,122,69,0.5)] transition-all duration-1000"
          style={{ width: `${pctComplete}%`, background: 'var(--grad-horizon)' }}
        />
      </div>

      <div className="flex justify-between relative">
        {PIPELINE_STEPS.map((step, idx) => {
          const isCompleted = idx < safeIndex;
          const isCurrent = idx === safeIndex;
          const isSelected = selectedNode === step.id;

          const label = dynamicLabelOverrides[step.id] || step.label;
          const isChangesNeeded = label === 'Changes Needed';
          const isDischargedCurrent = isCurrent && isDischarged;

          const stepGuidance = getStatusGuidance(step.id);
          const nodeTooltip = isCurrent
            ? `${guidance.title} · ${guidance.owner} — Next: ${guidance.nextAction}`
            : `${stepGuidance.title} · ${stepGuidance.owner} — ${stepGuidance.nextAction}`;

          const activeBg = isChangesNeeded ? 'bg-red-500/10' : 'bg-[var(--navy-950)]';
          const activeBorder = isChangesNeeded ? 'border-red-500' : 'border-[var(--dawn)]';
          const activeText = isChangesNeeded ? 'text-red-500' : 'text-[var(--dawn-hot)]';
          const activePulse = isChangesNeeded ? 'fm-node-pulse-blocked' : 'fm-node-pulse';

          const currentClasses = isDischargedCurrent
            ? 'bg-zinc-900 border border-zinc-500/50 text-zinc-400 shadow-[0_0_0_5px_rgba(113,113,122,0.10)]'
            : `${activeBg} border ${activeBorder} ${activeText} ${activePulse}`;

          const labelColor =
            isCurrent || isSelected
              ? isDischargedCurrent
                ? 'text-zinc-400'
                : isChangesNeeded
                  ? 'text-red-500'
                  : 'text-[var(--dawn-hot)]'
              : 'text-zinc-400';

          return (
            <div
              key={step.id}
              className={`flex flex-col items-center gap-[9px] w-full relative ${isCurrent ? 'current' : ''}`}
            >
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setSelectedNode(step.id)}
                title={nodeTooltip}
                aria-label={nodeTooltip}
                className={`w-[32px] h-[32px] rounded-[9px] flex items-center justify-center font-mono text-[12px] font-semibold transition-all duration-300 relative z-[2] -mt-[22px] cursor-pointer outline-none
                  ${
                    isCompleted
                      ? 'bg-[rgba(255,122,69,0.14)] border border-[rgba(255,122,69,0.45)] text-[var(--dawn-hot)] hover:scale-[1.05]'
                      : isCurrent
                        ? currentClasses
                        : 'bg-[var(--navy-800)] border border-[var(--line-hi)] text-zinc-500 hover:bg-white/5 hover:border-brand-orange-500/40'
                  }
                `}
              >
                {isCompleted ? '✓' : idx + 1}
              </button>

              <div>
                <div className="font-mono text-[9px] font-medium tracking-[1px] text-zinc-500 uppercase text-center">
                  {step.dept}
                </div>
                <div className={`text-[11.5px] font-semibold mt-[2px] text-center ${labelColor}`}>
                  {label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedNode && selectedGuidance && (
        <div className="mt-[28px] pt-[22px] border-t border-white/10 animate-slide-up">
          <div className="rounded-[12px] border border-white/10 bg-black/30 p-[20px] backdrop-blur-sm">
            <div className="flex justify-between items-center mb-[12px]">
              <h2 className="font-mono text-[10px] font-semibold tracking-[1px] text-zinc-500 uppercase flex items-center">
                <FileText className="w-[14px] h-[14px] mr-[8px] opacity-70" />
                SOP · {PIPELINE_STEPS.find((s) => s.id === selectedNode)?.label ?? selectedNode}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>

            <h3 className="font-heading text-[17px] font-semibold text-white mb-[6px]">
              {selectedGuidance.title}
            </h3>
            <p className="text-zinc-400 text-[13.5px] leading-[1.65] mb-[14px]">
              {selectedGuidance.sop}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-lg border border-brand-orange-500/20 bg-brand-orange-500/[0.06] px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--dawn-hot)]" />
                <span className="text-[12px] text-zinc-200">
                  <span className="font-semibold text-[var(--dawn-hot)]">Next action · </span>
                  {selectedGuidance.nextAction}
                </span>
              </div>
              <span className="sm:ml-auto font-mono text-[10px] text-zinc-500 shrink-0">
                {selectedGuidance.owner} · {selectedGuidance.surface}
              </span>
            </div>

            {selectedNode === 'STAFFING_PENDING' && (
              <p className="mt-3 font-mono text-[10.5px] text-amber-400/90 leading-relaxed">
                Bridge E: ACTIVE only after a durable first therapy Session (97153) + Activate —
                job-board / parent accept never sets ACTIVE.
              </p>
            )}
            {selectedNode === 'ACTIVE' && rawStatus !== 'DISCHARGED' && (
              <p className="mt-3 font-mono text-[10.5px] text-zinc-500 leading-relaxed">
                Delivery: RAS Session Studio · Claims: Plutus manual tracker after BCBA e-sign.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
