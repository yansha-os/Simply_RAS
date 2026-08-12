/**
 * Server-side predecessor gates + ops next-action guidance for ClientStatus.
 * Aligns with FlowMap / intake-workflow-map so writers and UI share one spine.
 *
 * ACTIVE is Bridge E only (durable first therapy Session) — never staffing accept alone.
 * External systems in copy: RAS (clinical chart / Session Studio) · Plutus (manual PA/claims tracker).
 */

export const CLIENT_STATUS_PIPELINE = [
  'INQUIRY',
  'MAGIC_LINK_SENT',
  'DOCS_SUBMITTED',
  'DOCS_APPROVED_INTAKE',
  'CLINICAL_REVIEW_APPROVED',
  'VOB_COMPLETED',
  'PA_SUBMITTED',
  'PA_APPROVED',
  'ASSESSMENT_SCHEDULED',
  'REPORT_ASSEMBLED',
  'TX_PA_SUBMITTED',
  'TX_PA_APPROVED',
  'STAFFING_PENDING',
  'ACTIVE',
  'DISCHARGED',
] as const;

export type PipelineStatus = (typeof CLIENT_STATUS_PIPELINE)[number];

export type StatusGuidance = {
  status: PipelineStatus;
  title: string;
  /** Who owns the next durable write */
  owner: string;
  /** Short ops CTA — what to do now */
  nextAction: string;
  /** Where in RAS to act */
  surface: string;
  /** SOP / why this step exists */
  sop: string;
};

/**
 * Status → next-action matrix (honest spine through STAFFING_PENDING → ACTIVE).
 * Used by FlowMap and light client-profile gate messaging.
 */
export const STATUS_GUIDANCE: Record<PipelineStatus, StatusGuidance> = {
  INQUIRY: {
    status: 'INQUIRY',
    title: 'Initial Inquiry',
    owner: 'Intake',
    nextAction: 'Confirm demographics, then generate the parent magic link.',
    surface: 'Client profile → Documents / Magic Link',
    sop: 'Collect child and guardian details in RAS before inviting the parent to upload insurance and diagnostic documents.',
  },
  MAGIC_LINK_SENT: {
    status: 'MAGIC_LINK_SENT',
    title: 'Magic Link Sent',
    owner: 'Parent · Intake',
    nextAction: 'Wait for parent submission — or resend the magic link if stalled.',
    surface: 'Magic link portal · Intake Documents',
    sop: 'Parent uploads insurance cards, Medicaid cards, and diagnostic eval via the secure magic link. Intake monitors until docs land.',
  },
  DOCS_SUBMITTED: {
    status: 'DOCS_SUBMITTED',
    title: 'Documents Submitted',
    owner: 'Intake',
    nextAction: 'Review every form and document; approve or request changes, then send to clinical.',
    surface: 'Intake Documents tab',
    sop: 'Intake Coordinator validates Insurance, Medicaid, and Diagnostic Eval. Rejections return the packet to the parent without skipping clinical.',
  },
  DOCS_APPROVED_INTAKE: {
    status: 'DOCS_APPROVED_INTAKE',
    title: 'Intake Approved',
    owner: 'Clinical Support',
    nextAction: 'Complete medical-necessity / clinical double-check and approve the review.',
    surface: 'Clinical Review · Clinical Support queue',
    sop: 'Clinical Support confirms medical necessity in the RAS clinical chart and clears the case for billing VOB — no external EMR handoff.',
  },
  CLINICAL_REVIEW_APPROVED: {
    status: 'CLINICAL_REVIEW_APPROVED',
    title: 'Clinical Review Approved',
    owner: 'Billing',
    nextAction: 'Complete Verification of Benefits (VOB) + credentialing checklist.',
    surface: 'Billing Auth tab · Billing portal',
    sop: 'Billing verifies eligibility and benefits in RAS before any Assessment PA is logged in the Plutus manual tracker.',
  },
  VOB_COMPLETED: {
    status: 'VOB_COMPLETED',
    title: 'VOB Completed',
    owner: 'Billing',
    nextAction: 'Submit Assessment PA (CPT 97151) in the Plutus manual tracker.',
    surface: 'Billing Auth → Assessment PA',
    sop: 'Log Assessment PA as submitted in RAS (manual Plutus tracker). No EDI / Plutus API in this phase.',
  },
  PA_SUBMITTED: {
    status: 'PA_SUBMITTED',
    title: 'Assessment PA Submitted',
    owner: 'Billing · Payer',
    nextAction: 'Await payer decision; mark Assessment PA approved (or denied) in the Plutus tracker.',
    surface: 'Billing Auth → Assessment PA',
    sop: 'Billing tracks Assessment PA outcome in RAS against the Plutus manual tracker. Approval unlocks assessment scheduling.',
  },
  PA_APPROVED: {
    status: 'PA_APPROVED',
    title: 'Assessment PA Approved',
    owner: 'BCBA · Clinical Support',
    nextAction: 'Schedule the 97151 assessment (real datetime) in the RAS clinical chart.',
    surface: 'Assessment Prep / Clinical Support schedule',
    sop: 'Persist a real assessment datetime — status advances to ASSESSMENT_SCHEDULED. Do not fake progress.',
  },
  ASSESSMENT_SCHEDULED: {
    status: 'ASSESSMENT_SCHEDULED',
    title: 'Assessment Scheduled',
    owner: 'BCBA · Clinical Support',
    nextAction: 'Complete assessment, build the Treatment Plan, assemble the report packet, collect signatures.',
    surface: 'BCBA Assessment · Treatment Plan · Report Assembly',
    sop: 'BCBA writes the TP in RAS; Clinical Support assembles the packet and obtains BCBA + parent typed-name signatures.',
  },
  REPORT_ASSEMBLED: {
    status: 'REPORT_ASSEMBLED',
    title: 'Report Assembled',
    owner: 'Billing',
    nextAction: 'Submit Treatment PA in the Plutus manual tracker.',
    surface: 'Billing Auth → Treatment PA · Clinical Support handoff',
    sop: 'With the TP packet ready, Billing logs Treatment PA submitted in RAS (Plutus manual tracker). Clinical Support may mark “sent to Plutus”.',
  },
  TX_PA_SUBMITTED: {
    status: 'TX_PA_SUBMITTED',
    title: 'Treatment PA Submitted',
    owner: 'Billing · Payer',
    nextAction: 'Await payer decision; approve Treatment PA in the Plutus tracker when authorized.',
    surface: 'Billing Auth → Treatment PA',
    sop: 'Treatment auth numbers/units are recorded in RAS. Approval hands the client to Case Coord staffing — still not ACTIVE.',
  },
  TX_PA_APPROVED: {
    status: 'TX_PA_APPROVED',
    title: 'Treatment PA Approved',
    owner: 'Billing · Case Coord',
    nextAction: 'Confirm handoff to staffing (status → STAFFING_PENDING) if not already advanced.',
    surface: 'Billing Auth · Case Coord clients',
    sop: 'Authorized for recurring therapy. Next durable status is STAFFING_PENDING. Parent accept / RBT assign does not activate the case.',
  },
  STAFFING_PENDING: {
    status: 'STAFFING_PENDING',
    title: 'Staffing Pending',
    owner: 'Case Coord',
    nextAction:
      'Staff via job board → assign RBT + BCBA → schedule first 97153 → Activate after first session (Bridge E).',
    surface: 'Staffing · First Session (Case Coord tab)',
    sop: 'Post CaseOpening, review HRM applications, parent accept assigns RBT only. ACTIVE requires a durable non-97151 Session then explicit activate — staffing accept alone never activates.',
  },
  ACTIVE: {
    status: 'ACTIVE',
    title: 'Active Therapy',
    owner: 'Clinical · Billing',
    nextAction:
      'Run ongoing sessions in RAS Session Studio; BCBA e-sign notes for Plutus / claims eligibility.',
    surface: 'Chart Progress · Unsigned notes · Plutus tracker',
    sop: 'Client has a durable first therapy Session on record. Delivery lives in RAS (HRM Studio + CRM chart). Claims stay on the Plutus manual tracker after BCBA sign.',
  },
  DISCHARGED: {
    status: 'DISCHARGED',
    title: 'Discharged',
    owner: 'Case Coord',
    nextAction: 'Archive follow-ups; no further pipeline advances.',
    surface: 'Case Coord · Client overview',
    sop: 'Client is discharged from active therapy. Re-open only via an intentional clinical/ops decision — do not treat as ACTIVE.',
  },
};

export function statusIndex(status: string): number {
  return CLIENT_STATUS_PIPELINE.indexOf(status as PipelineStatus);
}

export function getStatusGuidance(status: string): StatusGuidance {
  if (status in STATUS_GUIDANCE) {
    return STATUS_GUIDANCE[status as PipelineStatus];
  }
  return {
    status: 'INQUIRY',
    title: 'Unknown Status',
    owner: 'Ops',
    nextAction: 'Verify Client.status against the intake spine before advancing.',
    surface: 'Client profile',
    sop: `Unrecognized status “${status}”. Expected one of: ${CLIENT_STATUS_PIPELINE.join(' → ')}.`,
  };
}

/**
 * @param allowedFrom — statuses from which this step may advance
 * @param targetStatus — if current is already at/past this, treat as idempotent (no downgrade)
 */
export function assertPredecessor(
  current: string,
  allowedFrom: string[],
  targetStatus?: string
): { ok: true; alreadyPast: boolean } | { ok: false; error: string } {
  if (targetStatus) {
    const cur = statusIndex(current);
    const tgt = statusIndex(targetStatus);
    if (cur >= 0 && tgt >= 0 && cur >= tgt) {
      return { ok: true, alreadyPast: true };
    }
  }
  if (allowedFrom.includes(current)) {
    return { ok: true, alreadyPast: false };
  }
  const guidance = getStatusGuidance(current);
  return {
    ok: false,
    error: `Pipeline gate: expected ${allowedFrom.join(' | ')}, got ${current}. Next: ${guidance.nextAction}`,
  };
}
