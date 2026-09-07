/**
 * Audit log vault inspector (prototype helpers).
 *
 * Key-name redaction and CSV formatting for AuditLogVault review.
 * This is NOT a HIPAA compliance program or a stored tamper-evident chain.
 */

import { createHash } from 'crypto';

export interface AuditVaultRecord {
  id: string;
  userId: string | null;
  userEmail?: string | null;
  userName?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  timestamp: string; // ISO string
}

export interface AuditVaultFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface HashChainVerificationResult {
  verified: boolean;
  tamperedIndex: number | null;
  totalVerifiedRecords: number;
  genesisHash: string;
  terminalHash: string;
}

const DISALLOWED_PHI_KEYS = new Set([
  'clientname',
  'firstname',
  'lastname',
  'dob',
  'dateofbirth',
  'ssn',
  'medicaidid',
  'memberid',
  'address',
  'phone',
  'email',
  'guardianname',
  'narrative',
  'clinicalnotes',
]);

/**
 * Sanitizes audit metadata to prevent accidental PHI/PII leakage in logs or exports
 */
export function sanitizeAuditMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (DISALLOWED_PHI_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED_PHI]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Computes page hashes for review only. AuditLogVault rows do not store a
 * durable hash chain, so this never claims cryptographic verification.
 */
export function verifyAuditHashChain(records: AuditVaultRecord[]): HashChainVerificationResult {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      verified: false,
      tamperedIndex: null,
      totalVerifiedRecords: 0,
      genesisHash: '0'.repeat(64),
      terminalHash: '0'.repeat(64),
    };
  }

  let prevHash = '0'.repeat(64);
  let genesisHash = '';

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const payload = JSON.stringify({
      id: r.id,
      userId: r.userId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      timestamp: r.timestamp,
      prevHash,
    });

    const currentHash = createHash('sha256').update(payload).digest('hex');
    if (i === 0) {
      genesisHash = currentHash;
    }
    prevHash = currentHash;
  }

  return {
    verified: false,
    tamperedIndex: null,
    totalVerifiedRecords: records.length,
    genesisHash,
    terminalHash: prevHash,
  };
}

/**
 * Formats audit vault records into RFC 4180 compliant CSV export text
 */
export function buildAuditCsvExport(records: AuditVaultRecord[]): string {
  const headers = [
    'Log ID',
    'Timestamp (UTC)',
    'User ID',
    'User Name',
    'Action',
    'Resource Type',
    'Resource ID',
    'IP Address',
    'Metadata',
  ];

  const escapeCsv = (val: string | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = records.map((r) => [
    escapeCsv(r.id),
    escapeCsv(r.timestamp),
    escapeCsv(r.userId),
    escapeCsv(r.userName || r.userEmail || 'System'),
    escapeCsv(r.action),
    escapeCsv(r.resourceType),
    escapeCsv(r.resourceId),
    escapeCsv(r.ipAddress),
    escapeCsv(JSON.stringify(sanitizeAuditMetadata(r.metadata))),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
