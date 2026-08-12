import type { FinancePayrollReport } from './financePayrollModel';

const CSV_HEADERS = [
  'RBT name',
  'Hourly rate estimate',
  'Rate source',
  'Sessions',
  'Note units',
  'Duration-estimated units',
  'Total units',
  'Gross estimate',
  'Payable sessions',
  'Payable units',
  'Payable estimate (not submitted)',
  'Held sessions',
  'Held units',
  'Held estimate',
  'Range start',
  'Range end',
  'Clinic time zone',
  'Generated at',
] as const;

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildFinancePayrollCsv(report: FinancePayrollReport): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];
  for (const row of report.staff) {
    lines.push(
      [
        row.rbtName,
        row.hourlyRate.toFixed(2),
        row.rateSource === 'SIGNED_LS54'
          ? 'Signed LS-54'
          : 'Default estimate',
        row.sessionCount,
        row.noteUnits,
        row.estimatedUnits,
        row.totalUnits,
        row.grossEstimate.toFixed(2),
        row.payableSessionCount,
        row.payableUnits,
        row.payableEstimate.toFixed(2),
        row.heldSessionCount,
        row.heldUnits,
        row.heldEstimate.toFixed(2),
        report.range.from,
        report.range.to,
        report.range.timeZone,
        report.generatedAt,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
