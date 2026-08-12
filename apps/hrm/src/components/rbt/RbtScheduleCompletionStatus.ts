export type ScheduleCompletionEvidence = {
  status?: string | null;
  rbtSigned?: boolean | null;
  rbtSignedAt?: string | Date | null;
  bcbaSigned?: boolean | null;
  bcbaSignedAt?: string | Date | null;
  isConverted?: boolean | null;
  plutusClaimRef?: string | null;
};

export type ScheduleCompletionPresentation = {
  state:
    | 'SESSION_COMPLETED'
    | 'DOCUMENTATION_SUBMITTED'
    | 'RBT_SIGNED'
    | 'BCBA_SIGNED'
    | 'CONVERTED_REFERENCE_MISSING'
    | 'CONVERTED'
    | 'UNCONFIRMED';
  label: string;
  detail: string;
  reference?: string;
  tone: 'slate' | 'amber' | 'sky' | 'emerald';
};

const unconfirmedStatus: ScheduleCompletionPresentation = {
  state: 'UNCONFIRMED',
  label: 'Status not confirmed',
  detail:
    'The available schedule data is incomplete or inconsistent. Billing and clinical review status are not yet confirmed.',
  tone: 'slate',
};

function hasDurableTimestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === 'string'
    && value.trim().length > 0
    && !Number.isNaN(Date.parse(value));
}

export function describeScheduleCompletion(
  evidence: ScheduleCompletionEvidence
): ScheduleCompletionPresentation {
  const status = evidence.status?.trim().toUpperCase() ?? '';
  const reference = evidence.plutusClaimRef?.trim() || undefined;
  const hasRbtSignedAt = hasDurableTimestamp(evidence.rbtSignedAt);
  const hasBcbaSignedAt = hasDurableTimestamp(evidence.bcbaSignedAt);
  const hasRbtSignature = evidence.rbtSigned === true && hasRbtSignedAt;
  const hasBcbaSignature =
    hasRbtSignature
    && evidence.bcbaSigned === true
    && hasBcbaSignedAt;

  const hasBrokenSignatureChain =
    (evidence.rbtSigned === true && !hasRbtSignedAt)
    || (hasRbtSignedAt && evidence.rbtSigned !== true)
    || (evidence.bcbaSigned === true && !hasBcbaSignature)
    || (hasBcbaSignedAt && evidence.bcbaSigned !== true);
  const hasBrokenConversionChain =
    (evidence.isConverted === true && !hasBcbaSignature)
    || (reference !== undefined && evidence.isConverted !== true);

  if (hasBrokenSignatureChain || hasBrokenConversionChain) {
    return unconfirmedStatus;
  }

  if (evidence.isConverted === true && hasBcbaSignature) {
    if (!reference) {
      return {
        state: 'CONVERTED_REFERENCE_MISSING',
        label: 'Plutus conversion recorded',
        detail:
          'SessionNote.isConverted is true, but no Plutus reference is available. Claim filing status is not confirmed.',
        tone: 'amber',
      };
    }

    return {
      state: 'CONVERTED',
      label: 'Plutus tracker entry recorded',
      detail:
        'The durable note flags and reference confirm tracker conversion, not payer submission or payment.',
      reference,
      tone: 'emerald',
    };
  }

  if (hasBcbaSignature) {
    return {
      state: 'BCBA_SIGNED',
      label: 'BCBA co-sign recorded',
      detail:
        'The BCBA signature and timestamp are recorded. Plutus tracker conversion is not confirmed.',
      tone: 'sky',
    };
  }

  if (hasRbtSignature) {
    return {
      state: 'RBT_SIGNED',
      label: 'Documentation submitted',
      detail:
        'The RBT signature and timestamp are recorded. Awaiting BCBA review; billing status is not yet confirmed.',
      tone: 'amber',
    };
  }

  if (status === 'DOCUMENTATION_SUBMITTED') {
    return {
      state: 'DOCUMENTATION_SUBMITTED',
      label: 'Documentation submitted',
      detail:
        'Awaiting BCBA review. Billing and clinical review status are not yet confirmed.',
      tone: 'amber',
    };
  }

  if (status === 'COMPLETED') {
    return {
      state: 'SESSION_COMPLETED',
      label: 'Session completed',
      detail: 'Billing and clinical review status are not yet confirmed.',
      tone: 'slate',
    };
  }

  return unconfirmedStatus;
}
