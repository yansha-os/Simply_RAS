export type SupervisionServiceRecord = {
  status?: unknown;
  cptCode?: unknown;
  actualStart?: unknown;
  actualEnd?: unknown;
};

type ServiceCodeSummary = {
  recordCount: number;
  completedRecordCount: number;
  actualServiceMinutes: number;
};

export type SupervisionServiceSummary = {
  assessmentStatus: 'not_assessable';
  assessmentLabel: 'N/A';
  policyLabel: 'Policy not configured';
  evidenceLabel: 'Supervision evidence unavailable';
  payerLabel: string;
  potentialServiceRecordCount: number;
  completedServiceRecordCount: number;
  completedRecordsWithActualTime: number;
  completedRecordsMissingActualTime: number;
  totalActualServiceMinutes: number;
  service97153: ServiceCodeSummary;
  service97155: ServiceCodeSummary;
  warnings: string[];
};

function asTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function actualServiceDurationMinutes(
  record: Pick<SupervisionServiceRecord, 'actualStart' | 'actualEnd'>
): number | null {
  const start = asTimestamp(record.actualStart);
  const end = asTimestamp(record.actualEnd);

  if (start == null || end == null || end <= start) return null;
  return Math.round((end - start) / 60_000);
}

export function summarizeSupervisionServiceRecords(
  records: readonly SupervisionServiceRecord[] | null | undefined,
  insurancePayer: unknown
): SupervisionServiceSummary {
  const service97153: ServiceCodeSummary = {
    recordCount: 0,
    completedRecordCount: 0,
    actualServiceMinutes: 0,
  };
  const service97155: ServiceCodeSummary = {
    recordCount: 0,
    completedRecordCount: 0,
    actualServiceMinutes: 0,
  };
  let potentialServiceRecordCount = 0;
  let completedServiceRecordCount = 0;
  let completedRecordsWithActualTime = 0;
  let completedRecordsMissingActualTime = 0;
  let totalActualServiceMinutes = 0;

  for (const record of records ?? []) {
    const cptCode =
      typeof record.cptCode === 'string' ? record.cptCode.trim() : '';
    if (cptCode !== '97153' && cptCode !== '97155') continue;

    const codeSummary = cptCode === '97153' ? service97153 : service97155;
    potentialServiceRecordCount += 1;
    codeSummary.recordCount += 1;

    const isCompleted =
      typeof record.status === 'string' &&
      record.status.trim().toUpperCase() === 'COMPLETED';
    if (!isCompleted) continue;

    completedServiceRecordCount += 1;
    codeSummary.completedRecordCount += 1;

    const durationMinutes = actualServiceDurationMinutes(record);
    if (durationMinutes == null) {
      completedRecordsMissingActualTime += 1;
      continue;
    }

    completedRecordsWithActualTime += 1;
    totalActualServiceMinutes += durationMinutes;
    codeSummary.actualServiceMinutes += durationMinutes;
  }

  const payerLabel =
    typeof insurancePayer === 'string' && insurancePayer.trim()
      ? insurancePayer.trim()
      : 'Payer not recorded';
  const warnings = [
    'Policy not configured: no resolved, versioned supervision policy is available.',
    'Supervision evidence unavailable: no supervisor-presence records are available.',
  ];

  if (service97155.recordCount > 0) {
    warnings.push(
      'CPT 97155 is a protocol-modification service code, not proof of supervisor attendance.'
    );
  }

  if (completedRecordsMissingActualTime > 0) {
    warnings.push(
      `${completedRecordsMissingActualTime} completed service record${
        completedRecordsMissingActualTime === 1 ? '' : 's'
      } excluded from time totals because valid actual start/end timestamps were unavailable.`
    );
  }

  return {
    assessmentStatus: 'not_assessable',
    assessmentLabel: 'N/A',
    policyLabel: 'Policy not configured',
    evidenceLabel: 'Supervision evidence unavailable',
    payerLabel,
    potentialServiceRecordCount,
    completedServiceRecordCount,
    completedRecordsWithActualTime,
    completedRecordsMissingActualTime,
    totalActualServiceMinutes,
    service97153,
    service97155,
    warnings,
  };
}
