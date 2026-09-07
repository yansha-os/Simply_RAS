/**
 * Stable Plutus handoff CSV export — RAS claim-ready packet fields only.
 * No Artemis / legacy EMR export path.
 */

export type PlutusExportRow = {
  noteId: string;
  clientId: string;
  clientLastName: string;
  clientFirstName: string;
  memberId: string;
  medicaidId: string;
  insurancePayer: string;
  cptCode: string;
  billableUnits: number;
  dateOfService: string;
  authNumber: string;
  rbtNpi: string;
  bcbaNpi: string;
  plutusClaimRef: string;
  convertedAt: string;
};

export type PlutusExportNoteInput = {
  id: string;
  billableUnits: number | null;
  plutusClaimRef: string | null;
  convertedAt: Date | string | null;
  session: {
    cptCode: string | null;
    scheduledStart: Date | string;
    actualStart?: Date | string | null;
    rbtNpi?: string;
    bcbaNpi?: string;
    client: {
      id: string;
      firstName: string;
      lastName: string;
      memberId?: string | null;
      medicaidId?: string | null;
      insurancePayer?: string | null;
      authorizations?: Array<{ authNumber: string | null }>;
    };
  };
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function serviceDate(note: PlutusExportNoteInput): string {
  const start = note.session.actualStart || note.session.scheduledStart;
  return new Date(start).toISOString().slice(0, 10);
}

function authNumber(note: PlutusExportNoteInput): string {
  return (
    note.session.client.authorizations?.find((a) => a.authNumber)?.authNumber?.trim() || ''
  );
}

/** Map converted SessionNotes → Plutus CSV rows (skips rows missing required refs). */
export function buildPlutusExportRows(notes: PlutusExportNoteInput[]): PlutusExportRow[] {
  const rows: PlutusExportRow[] = [];
  for (const note of notes) {
    const units = note.billableUnits;
    const ref = note.plutusClaimRef?.trim();
    if (typeof units !== 'number' || units <= 0 || !ref) continue;
    const convertedAt = note.convertedAt ? new Date(note.convertedAt).toISOString() : '';
    rows.push({
      noteId: note.id,
      clientId: note.session.client.id,
      clientLastName: note.session.client.lastName,
      clientFirstName: note.session.client.firstName,
      memberId: note.session.client.memberId?.trim() || '',
      medicaidId: note.session.client.medicaidId?.trim() || '',
      insurancePayer: note.session.client.insurancePayer?.trim() || '',
      cptCode: (note.session.cptCode || '97153').trim().toUpperCase(),
      billableUnits: Math.floor(units),
      dateOfService: serviceDate(note),
      authNumber: authNumber(note),
      rbtNpi: note.session.rbtNpi?.trim() || '',
      bcbaNpi: note.session.bcbaNpi?.trim() || '',
      plutusClaimRef: ref,
      convertedAt,
    });
  }
  return rows;
}

const CSV_HEADERS: (keyof PlutusExportRow)[] = [
  'noteId',
  'clientId',
  'clientLastName',
  'clientFirstName',
  'memberId',
  'medicaidId',
  'insurancePayer',
  'cptCode',
  'billableUnits',
  'dateOfService',
  'authNumber',
  'rbtNpi',
  'bcbaNpi',
  'plutusClaimRef',
  'convertedAt',
];

export function buildPlutusExportCsv(rows: PlutusExportRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((key) => csvEscape(String(row[key] ?? ''))).join(','));
  }
  return lines.join('\n');
}
