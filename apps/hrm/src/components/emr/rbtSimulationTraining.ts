export type SimulationEvidence = {
  dtt: boolean;
  taskAnalysis: boolean;
  measurement: boolean;
  interval: boolean;
  abc: boolean;
  acknowledgment: boolean;
};

export type SimulationCompletionScope = 'PERSISTED' | 'LOCAL_SESSION';

const EVIDENCE_KEYS: Array<keyof SimulationEvidence> = [
  'dtt',
  'taskAnalysis',
  'measurement',
  'interval',
  'abc',
  'acknowledgment',
];

export function getSimulationReadiness(evidence: SimulationEvidence) {
  const missing = EVIDENCE_KEYS.filter((key) => !evidence[key]);

  return {
    completed: EVIDENCE_KEYS.length - missing.length,
    total: EVIDENCE_KEYS.length,
    ready: missing.length === 0,
    missing,
  };
}

export function completionScopeForPersistResult(
  persisted: boolean
): SimulationCompletionScope {
  return persisted ? 'PERSISTED' : 'LOCAL_SESSION';
}

export type PracticeRepairReason =
  | 'MISSING_PARENT_SIGNATURE'
  | 'MISSING_SOAP_NOTE'
  | 'MISSING_ABC_LOG';

export type PracticeRepairError =
  | 'PRACTICE_ACKNOWLEDGMENT_REQUIRED'
  | 'PRACTICE_NARRATIVE_REQUIRED';

export function validatePracticeRepair(
  reason: PracticeRepairReason,
  acknowledgment: string,
  narrative: string
): PracticeRepairError | null {
  if (
    reason === 'MISSING_PARENT_SIGNATURE' &&
    acknowledgment.trim().length < 2
  ) {
    return 'PRACTICE_ACKNOWLEDGMENT_REQUIRED';
  }
  if (reason === 'MISSING_SOAP_NOTE' && narrative.trim().length === 0) {
    return 'PRACTICE_NARRATIVE_REQUIRED';
  }
  return null;
}
