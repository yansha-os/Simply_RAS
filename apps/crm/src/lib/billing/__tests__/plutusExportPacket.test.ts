import { describe, expect, it } from 'vitest';

import { buildPlutusExportCsv, buildPlutusExportRows } from '../plutusExportPacket';

describe('plutusExportPacket', () => {
  it('builds stable CSV rows for converted notes', () => {
    const rows = buildPlutusExportRows([
      {
        id: 'note-1',
        billableUnits: 4,
        plutusClaimRef: 'PLT-100',
        convertedAt: '2026-08-12T16:00:00.000Z',
        session: {
          cptCode: '97153',
          scheduledStart: '2026-08-12T13:00:00.000Z',
          actualStart: '2026-08-12T13:00:00.000Z',
          rbtNpi: '1234567890',
          bcbaNpi: '0987654321',
          client: {
            id: 'client-1',
            firstName: 'Alex',
            lastName: 'Rivera',
            memberId: 'MBR-1',
            medicaidId: 'MCD-1',
            insurancePayer: 'Medicaid',
            authorizations: [{ authNumber: 'AUTH-99' }],
          },
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: 'client-1',
      cptCode: '97153',
      billableUnits: 4,
      authNumber: 'AUTH-99',
      rbtNpi: '1234567890',
      bcbaNpi: '0987654321',
      plutusClaimRef: 'PLT-100',
    });

    const csv = buildPlutusExportCsv(rows);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('noteId,clientId');
    expect(csv).toContain('PLT-100');
  });

  it('skips rows missing ref or units', () => {
    const rows = buildPlutusExportRows([
      {
        id: 'note-1',
        billableUnits: 0,
        plutusClaimRef: 'PLT-100',
        convertedAt: null,
        session: {
          cptCode: '97153',
          scheduledStart: '2026-08-12T13:00:00.000Z',
          client: {
            id: 'c1',
            firstName: 'A',
            lastName: 'B',
          },
        },
      },
    ]);
    expect(rows).toHaveLength(0);
  });
});
