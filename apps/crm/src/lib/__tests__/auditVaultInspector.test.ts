import { describe, expect, it } from 'vitest';
import {
  buildAuditCsvExport,
  sanitizeAuditMetadata,
  verifyAuditHashChain,
  type AuditVaultRecord,
} from '../auditVaultInspector';

describe('sanitizeAuditMetadata', () => {
  it('redacts sensitive PHI keys while preserving operational metadata', () => {
    const raw = {
      actionSource: 'BILLING_PORTAL',
      clientName: 'Jane Doe',
      dob: '2018-05-12',
      medicaidId: 'AB12345C',
      authUnits: 120,
      nested: {
        ssn: '123-45-6789',
        statusCode: 'APPROVED',
      },
    };

    const sanitized = sanitizeAuditMetadata(raw);
    expect(sanitized.actionSource).toBe('BILLING_PORTAL');
    expect(sanitized.authUnits).toBe(120);
    expect(sanitized.clientName).toBe('[REDACTED_PHI]');
    expect(sanitized.dob).toBe('[REDACTED_PHI]');
    expect(sanitized.medicaidId).toBe('[REDACTED_PHI]');
    expect(sanitized.nested).toEqual({
      ssn: '[REDACTED_PHI]',
      statusCode: 'APPROVED',
    });
  });

  it('handles null, undefined, and non-object metadata defensively', () => {
    expect(sanitizeAuditMetadata(null)).toEqual({});
    expect(sanitizeAuditMetadata(undefined)).toEqual({});
    expect(sanitizeAuditMetadata('string')).toEqual({});
  });
});

describe('verifyAuditHashChain', () => {
  const records: AuditVaultRecord[] = [
    {
      id: 'log-1',
      userId: 'u-1',
      action: 'VIEW',
      resourceType: 'CLIENT',
      resourceId: 'c-100',
      ipAddress: '127.0.0.1',
      metadata: {},
      timestamp: '2026-02-01T10:00:00.000Z',
    },
    {
      id: 'log-2',
      userId: 'u-1',
      action: 'SIGN',
      resourceType: 'SESSION_NOTE',
      resourceId: 'sn-200',
      ipAddress: '127.0.0.1',
      metadata: { units: 4 },
      timestamp: '2026-02-01T10:30:00.000Z',
    },
  ];

  it('computes page hashes but does not claim a durable tamper-evident chain', () => {
    const res = verifyAuditHashChain(records);
    expect(res.verified).toBe(false);
    expect(res.totalVerifiedRecords).toBe(2);
    expect(res.genesisHash).toHaveLength(64);
    expect(res.terminalHash).toHaveLength(64);
  });

  it('handles empty audit records list without claiming verification', () => {
    const res = verifyAuditHashChain([]);
    expect(res.verified).toBe(false);
    expect(res.totalVerifiedRecords).toBe(0);
  });
});

describe('buildAuditCsvExport', () => {
  it('generates standard CSV with sanitized metadata', () => {
    const records: AuditVaultRecord[] = [
      {
        id: 'log-1',
        userId: 'u-1',
        userEmail: 'bcba@example.com',
        userName: 'Dr. Smith',
        action: 'EXPORT',
        resourceType: 'RE_AUTH_PACKET',
        resourceId: 'p-1',
        ipAddress: '10.0.0.1',
        metadata: { clientName: 'Secret Child' },
        timestamp: '2026-02-01T10:00:00.000Z',
      },
    ];

    const csv = buildAuditCsvExport(records);
    expect(csv).toContain('Log ID,Timestamp (UTC)');
    expect(csv).toContain('"Dr. Smith"');
    expect(csv).toContain('"EXPORT"');
    expect(csv).toContain('[REDACTED_PHI]');
    expect(csv).not.toContain('Secret Child');
  });
});
