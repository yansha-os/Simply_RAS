import { describe, expect, it } from 'vitest';
import {
  getDocumentTypeInfo,
  organizeEmrDocumentVault,
} from '../emrDocumentVault';

describe('getDocumentTypeInfo', () => {
  it('maps DocumentType enum values to human labels and clinical categories', () => {
    expect(getDocumentTypeInfo('DIAGNOSTIC_EVAL').category).toBe('DIAGNOSTIC_AND_MEDICAL');
    expect(getDocumentTypeInfo('INSURANCE_CARD').category).toBe('INSURANCE_AND_AUTH');
    expect(getDocumentTypeInfo('CONSENT').category).toBe('LEGAL_AND_CONSENTS');
    expect(getDocumentTypeInfo('IEP').category).toBe('EDUCATIONAL_AND_IEP');
    expect(getDocumentTypeInfo('OTHER').category).toBe('ARCHIVES_AND_OTHER');
  });
});

describe('organizeEmrDocumentVault', () => {
  const asOf = new Date('2026-06-01T00:00:00.000Z');

  it('computes 100% audit readiness when core clinical documents exist', () => {
    const docs = [
      {
        id: 'd-1',
        clientId: 'c-1',
        type: 'DIAGNOSTIC_EVAL',
        fileUrl: 'https://storage.example.com/eval.pdf',
        isVerified: true,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
      {
        id: 'd-2',
        clientId: 'c-1',
        type: 'INSURANCE_CARD',
        fileUrl: 'https://storage.example.com/ins.pdf',
        isVerified: true,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
      {
        id: 'd-3',
        clientId: 'c-1',
        type: 'CONSENT',
        fileUrl: 'https://storage.example.com/consent.pdf',
        isVerified: true,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
      {
        id: 'd-4',
        clientId: 'c-1',
        type: 'IEP',
        fileUrl: 'https://storage.example.com/iep.pdf',
        expirationDate: '2026-12-31T00:00:00Z',
        isVerified: true,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
    ];

    const summary = organizeEmrDocumentVault(docs, asOf);
    expect(summary.totalDocuments).toBe(4);
    expect(summary.verifiedDocumentsCount).toBe(4);
    expect(summary.hasDiagnosticEval).toBe(true);
    expect(summary.hasInsuranceCard).toBe(true);
    expect(summary.hasSignedConsent).toBe(true);
    expect(summary.hasIepOnCourse).toBe(true);
    expect(summary.auditReadinessPct).toBe(100);
    expect(summary.expiringSoonAlerts).toHaveLength(0);
    expect(summary.expiredAlerts).toHaveLength(0);
  });

  it('detects expiring and expired documents', () => {
    const docs = [
      {
        id: 'd-expiring',
        clientId: 'c-1',
        type: 'REFERRAL',
        expirationDate: '2026-06-15T00:00:00Z', // 14 days
        isVerified: true,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
      {
        id: 'd-expired',
        clientId: 'c-1',
        type: 'IEP',
        expirationDate: '2026-05-01T00:00:00Z', // already expired
        isVerified: true,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
    ];

    const summary = organizeEmrDocumentVault(docs, asOf);
    expect(summary.expiringSoonAlerts).toHaveLength(1);
    expect(summary.expiringSoonAlerts[0].id).toBe('d-expiring');
    expect(summary.expiredAlerts).toHaveLength(1);
    expect(summary.expiredAlerts[0].id).toBe('d-expired');
  });

  it('handles empty document lists gracefully', () => {
    const summary = organizeEmrDocumentVault([], asOf);
    expect(summary.totalDocuments).toBe(0);
    expect(summary.auditReadinessPct).toBe(0);
    expect(summary.hasDiagnosticEval).toBe(false);
  });

  it('does not award audit readiness for unverified or metadata-only records', () => {
    const summary = organizeEmrDocumentVault([
      {
        id: 'unverified-diagnostic',
        clientId: 'c-1',
        type: 'DIAGNOSTIC_EVAL',
        fileUrl: '/api/documents?path=c-1%2Feval.pdf',
        isVerified: false,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
      {
        id: 'metadata-consent',
        clientId: 'c-1',
        type: 'CONSENT',
        fileUrl: null,
        isVerified: true,
        createdAt: '2026-01-10T00:00:00Z',
        updatedAt: '2026-01-10T00:00:00Z',
      },
    ], asOf);

    expect(summary.auditReadinessPct).toBe(0);
    expect(summary.hasDiagnosticEval).toBe(false);
    expect(summary.hasSignedConsent).toBe(false);
  });
});
