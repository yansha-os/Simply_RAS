/**
 * Claim Denial Appeals & Payer Dispute Resolution Engine
 *
 * Ingests standard CARC/RARC payer denial reason codes (e.g. CO-197, CO-16, CO-50, CO-4)
 * and generates audit-grade clinical appeal packets with attached authorizations and notes.
 */

export interface DenialReasonInfo {
  code: string; // e.g. "CO-197"
  category: 'AUTHORIZATION' | 'MEDICAL_NECESSITY' | 'MODIFIER_POS' | 'TIMELY_FILING' | 'CLERICAL';
  title: string;
  description: string;
  recommendedAction: string;
}

export interface DenialAppealInput {
  claimId: string;
  clientName: string;
  clientDob?: string;
  memberId: string;
  payerName: string;
  dateOfService: string;
  cptCode: string;
  billedUnits: number;
  billedAmountDollar: number;
  denialCode: string;
  denialReasonText?: string;
  authNumber?: string;
  bcbaName: string;
  customRebuttalNotes?: string;
}

export interface DenialAppealPacket {
  claimId: string;
  payerName: string;
  appealDate: string;
  formalSubjectLine: string;
  headerDetails: {
    patientName: string;
    patientDob: string;
    memberId: string;
    dateOfService: string;
    cptCode: string;
    billedUnits: number;
    billedAmount: string;
    authNumber: string;
  };
  denialSummary: {
    code: string;
    category: string;
    reason: string;
  };
  appealNarrative: string;
  attachedEvidenceChecklist: string[];
  bcbaAttestation: string;
}

export const CARC_DENIAL_DICTIONARY: Record<string, DenialReasonInfo> = {
  'CO-197': {
    code: 'CO-197',
    category: 'AUTHORIZATION',
    title: 'Precertification / Prior Authorization Absent or Expired',
    description: 'Payer states prior authorization was absent, invalid, or expired for the date of service.',
    recommendedAction: 'Provide active prior authorization letter with approved date range and CPT units.',
  },
  'CO-50': {
    code: 'CO-50',
    category: 'MEDICAL_NECESSITY',
    title: 'Not Deemed Medically Necessary by Payer',
    description: 'Payer claims treatment does not meet clinical criteria for ABA medical necessity.',
    recommendedAction: 'Attach Comprehensive Diagnostic Evaluation (F84.0), Individualized Treatment Plan, and baseline-to-mastery trajectory graphs.',
  },
  'CO-16': {
    code: 'CO-16',
    category: 'CLERICAL',
    title: 'Claim / Service Lacks Information or Billing Error',
    description: 'Payer requires additional clinical documentation or correction of service item details.',
    recommendedAction: 'Submit complete signed session note with POS code, rendering NPI, and supervisory signatures.',
  },
  'CO-4': {
    code: 'CO-4',
    category: 'MODIFIER_POS',
    title: 'Procedure Code Inconsistent with Modifier or Place of Service',
    description: 'Payer rejected claim due to modifier mismatch (e.g. missing 95/GT for telehealth or invalid POS 12 vs 11).',
    recommendedAction: 'Clarify Place of Service (CMS POS 12 for in-home, 11 for clinic) and appropriate clinical modifiers.',
  },
  'CO-29': {
    code: 'CO-29',
    category: 'TIMELY_FILING',
    title: 'Timely Filing Limit Exceeded',
    description: 'Payer asserts initial claim was submitted after payer timely filing window.',
    recommendedAction: 'Attach EDI 837 clearinghouse acceptance timestamp proving timely initial submission.',
  },
};

/**
 * Builds a formal, audit-ready clinical appeal packet
 */
export function compileDenialAppealPacket(input: DenialAppealInput): DenialAppealPacket {
  const info = CARC_DENIAL_DICTIONARY[input.denialCode] || {
    code: input.denialCode,
    category: 'CLERICAL',
    title: 'Claim Denial Appeal',
    description: input.denialReasonText || 'Payer denied claim line.',
    recommendedAction: 'Review claim details and clinical documentation.',
  };

  const nowStr = new Date().toISOString().split('T')[0];
  const authNum = input.authNumber || 'ON FILE';

  let specificArgument = '';

  switch (info.category) {
    case 'AUTHORIZATION':
      specificArgument = `The services rendered on ${input.dateOfService} under CPT ${input.cptCode} were fully authorized under Prior Authorization #${authNum}. Attached is a copy of the official approval letter covering this date of service and authorized unit allocation.`;
      break;
    case 'MEDICAL_NECESSITY':
      specificArgument = `The patient has an established diagnosis of Autism Spectrum Disorder (ICD-10 F84.0). ABA therapy rendered under CPT ${input.cptCode} is medically necessary to address pervasive deficits in functional communication, adaptive daily living skills, and behavior reduction. Attached clinical session notes demonstrate measurable progress and protocol fidelity.`;
      break;
    case 'MODIFIER_POS':
      specificArgument = `The service was rendered in accordance with standard CMS guidelines at Place of Service 12 (Home) and accurately reflects the rendering provider's scope of practice. All modifiers applied are compliant with payer manual specifications.`;
      break;
    case 'TIMELY_FILING':
      specificArgument = `The initial claim was submitted electronically within the required timely filing window. Attached is the clearinghouse electronic proof of timely submission.`;
      break;
    default:
      specificArgument = `Complete documentation supporting the billed services is attached for your review and claim reprocessing.`;
      break;
  }

  if (input.customRebuttalNotes) {
    specificArgument += ` Additional Clinical Context: ${input.customRebuttalNotes}`;
  }

  const appealNarrative = `RE: FORMAL FIRST-LEVEL APPEAL FOR CLAIM #${input.claimId}

Dear Appeals Committee / Medical Review Department,

We are writing to formally appeal the denial of Claim #${input.claimId} for patient ${input.clientName} (Member ID: ${input.memberId}) for date of service ${input.dateOfService}. The claim was denied under reason code ${info.code} (${info.title}).

${specificArgument}

We respectfully request that this claim be re-opened, re-adjudicated, and reimbursed in full according to the contracted fee schedule.

Sincerely,
${input.bcbaName}, BCBA / Clinical Director
Rise & Shine ABA Services`;

  const attachedEvidenceChecklist = [
    `Official Prior Authorization Approval Letter (Auth #${authNum})`,
    `Signed Clinical Session Note & Data Sheet (DOS: ${input.dateOfService})`,
    `Supervising BCBA E-Signature Attestation`,
    `Comprehensive Diagnostic Evaluation (ICD-10 F84.0)`,
  ];

  return {
    claimId: input.claimId,
    payerName: input.payerName,
    appealDate: nowStr,
    formalSubjectLine: `FIRST-LEVEL CLINICAL APPEAL - CLAIM #${input.claimId} - ${input.clientName} (DOB: ${input.clientDob || 'On File'})`,
    headerDetails: {
      patientName: input.clientName,
      patientDob: input.clientDob || 'On File',
      memberId: input.memberId,
      dateOfService: input.dateOfService,
      cptCode: input.cptCode,
      billedUnits: input.billedUnits,
      billedAmount: `$${input.billedAmountDollar.toFixed(2)}`,
      authNumber: authNum,
    },
    denialSummary: {
      code: info.code,
      category: info.category,
      reason: info.description,
    },
    appealNarrative,
    attachedEvidenceChecklist,
    bcbaAttestation: `I, ${input.bcbaName}, certify that the clinical services documented herein were rendered under my supervision and are medically necessary for the patient's individualized treatment plan.`,
  };
}

export type DenialPlaybookHint = {
  code: string;
  category: DenialReasonInfo['category'];
  title: string;
  recommendedAction: string;
  checklistHint: string;
};

/** Read-only denial coaching — top CARC patterns mapped to checklist blockers. */
export function summarizeDenialPlaybookHints(limit = 5): DenialPlaybookHint[] {
  const hints: DenialPlaybookHint[] = [
    {
      code: 'CO-197',
      category: 'AUTHORIZATION',
      title: CARC_DENIAL_DICTIONARY['CO-197'].title,
      recommendedAction: CARC_DENIAL_DICTIONARY['CO-197'].recommendedAction,
      checklistHint: 'Verify auth # + date window on client Billing tab before convert.',
    },
    {
      code: 'CO-16',
      category: 'CLERICAL',
      title: CARC_DENIAL_DICTIONARY['CO-16'].title,
      recommendedAction: CARC_DENIAL_DICTIONARY['CO-16'].recommendedAction,
      checklistHint: 'Run claim scrubber — POS, NPI, BCBA co-sign, and units must be clean.',
    },
    {
      code: 'CO-50',
      category: 'MEDICAL_NECESSITY',
      title: CARC_DENIAL_DICTIONARY['CO-50'].title,
      recommendedAction: CARC_DENIAL_DICTIONARY['CO-50'].recommendedAction,
      checklistHint: 'Attach F84.0 diagnosis + TP progress before appeal packet compile.',
    },
    {
      code: 'CO-4',
      category: 'MODIFIER_POS',
      title: CARC_DENIAL_DICTIONARY['CO-4'].title,
      recommendedAction: CARC_DENIAL_DICTIONARY['CO-4'].recommendedAction,
      checklistHint: 'Confirm CMS POS on Session Studio clock-in matches service location.',
    },
    {
      code: 'CO-29',
      category: 'TIMELY_FILING',
      title: CARC_DENIAL_DICTIONARY['CO-29'].title,
      recommendedAction: CARC_DENIAL_DICTIONARY['CO-29'].recommendedAction,
      checklistHint: 'Convert within payer filing window — Plutus ref timestamps handoff.',
    },
  ];
  return hints.slice(0, Math.max(1, limit));
}
