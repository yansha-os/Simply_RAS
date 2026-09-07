/**
 * Staff Credential & Payer Credentialing Watchdog
 *
 * Tracks NPI, CAQH, BACB License, CPR Cert, and Medicaid Provider IDs across payers.
 * Provides 30/60 day expiration alerts, payer clearance verification, and roster compliance audits.
 */

import { clinicDateKey, endOfClinicDayForDateOnly } from '@/lib/clinicTimezone';

export interface CredentialDetail {
  id: string;
  userId: string;
  credentialType: 'NPI' | 'CAQH' | 'BACB_LICENSE' | 'CPR_CERT' | 'MEDICAID_PROVIDER_ID' | 'LIABILITY_INSURANCE' | string;
  credentialNumber: string | null;
  payerName: string; // "ALL_PAYERS", "Medicaid", "Empire BCBS", etc.
  isCredentialed: boolean;
  expirationDate: string | null; // ISO string
  status: 'ACTIVE' | 'EXPIRING_30_DAYS' | 'EXPIRING_60_DAYS' | 'EXPIRED' | 'INACTIVE';
  daysUntilExpiration: number | null;
}

export interface StaffPayerClearance {
  userId: string;
  staffName: string;
  role: string;
  payerName: string;
  cleared: boolean;
  clearanceReason: string;
  missingCredentials: string[];
  expiringCredentials: string[];
}

export interface CredentialRosterScorecard {
  totalStaff: number;
  fullyCredentialedStaffCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  complianceRatePct: number;
  payerBreakdown: Record<string, { total: number; cleared: number }>;
  urgentAlerts: Array<{
    staffId: string;
    staffName: string;
    credentialType: string;
    expirationDate: string;
    daysRemaining: number;
  }>;
}

const REQUIRED_CREDENTIALS_MAP: Record<string, string[]> = {
  BCBA: ['NPI', 'CAQH', 'BACB_LICENSE', 'MEDICAID_PROVIDER_ID'],
  RBT: ['NPI', 'BACB_LICENSE', 'CPR_CERT'],
  CLINICAL_DIRECTOR: ['NPI', 'CAQH', 'BACB_LICENSE', 'MEDICAID_PROVIDER_ID'],
};

const NUMBER_REQUIRED_TYPES = new Set([
  'NPI',
  'CAQH',
  'BACB_LICENSE',
  'MEDICAID_PROVIDER_ID',
]);

function hasRequiredNumber(credential: CredentialDetail): boolean {
  if (!NUMBER_REQUIRED_TYPES.has(credential.credentialType.toUpperCase())) return true;
  const number = credential.credentialNumber?.trim() ?? '';
  if (credential.credentialType.toUpperCase() === 'NPI') return /^\d{10}$/.test(number);
  return number.length > 0;
}

function dateKeyDistance(fromDateKey: string, toDateKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromDateKey.split('-').map(Number);
  const [toYear, toMonth, toDay] = toDateKey.split('-').map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      (1000 * 60 * 60 * 24),
  );
}

/**
 * Evaluates individual credential expiration and lifecycle status
 */
export function evaluateCredentialItem(
  cred: {
    id?: string;
    userId: string;
    credentialType: string;
    credentialNumber?: string | null;
    payerName?: string | null;
    isCredentialed: boolean;
    expirationDate?: Date | string | null;
  },
  asOfDate: Date = new Date()
): CredentialDetail {
  const payerName = cred.payerName || 'ALL_PAYERS';
  const asOfMs = asOfDate.getTime();

  let expirationDateStr: string | null = null;
  let daysUntilExpiration: number | null = null;
  let isExpired = false;

  if (cred.expirationDate) {
    const expiration = new Date(cred.expirationDate);
    const expMs = expiration.getTime();
    if (Number.isFinite(expMs)) {
      expirationDateStr = expiration.toISOString().split('T')[0];
      const expirationEndMs = endOfClinicDayForDateOnly(expiration).getTime();
      isExpired = expirationEndMs < asOfMs;
      daysUntilExpiration = dateKeyDistance(clinicDateKey(asOfDate), expirationDateStr);
    }
  }

  let status: CredentialDetail['status'] = 'ACTIVE';

  if (!cred.isCredentialed) {
    status = 'INACTIVE';
  } else if (daysUntilExpiration !== null) {
    if (isExpired) {
      status = 'EXPIRED';
    } else if (daysUntilExpiration <= 30) {
      status = 'EXPIRING_30_DAYS';
    } else if (daysUntilExpiration <= 60) {
      status = 'EXPIRING_60_DAYS';
    }
  }

  return {
    id: cred.id || '',
    userId: cred.userId,
    credentialType: cred.credentialType,
    credentialNumber: cred.credentialNumber || null,
    payerName,
    isCredentialed: cred.isCredentialed,
    expirationDate: expirationDateStr,
    status,
    daysUntilExpiration,
  };
}

/**
 * Verifies whether a staff member is cleared to render/supervise for a specific payer
 */
export function verifyPayerClearance(params: {
  userId: string;
  staffName: string;
  role: string;
  payerName: string;
  credentials: CredentialDetail[];
}): StaffPayerClearance {
  const { userId, staffName, role, payerName, credentials } = params;
  const requiredTypes = REQUIRED_CREDENTIALS_MAP[role] || ['BACB_LICENSE'];

  const missingCredentials: string[] = [];
  const expiringCredentials: string[] = [];

  for (const type of requiredTypes) {
    // Find matching active credential either for this specific payer or for "ALL_PAYERS"
    const match = credentials.find(
      (c) =>
        c.credentialType.toUpperCase() === type.toUpperCase() &&
        (c.payerName === 'ALL_PAYERS' || c.payerName.toLowerCase() === payerName.toLowerCase()) &&
        c.status !== 'EXPIRED' &&
        c.status !== 'INACTIVE' &&
        hasRequiredNumber(c)
    );

    if (!match) {
      missingCredentials.push(type);
    } else if (match.status === 'EXPIRING_30_DAYS' || match.status === 'EXPIRING_60_DAYS') {
      expiringCredentials.push(`${type} (expires in ${match.daysUntilExpiration} days)`);
    }
  }

  const cleared = missingCredentials.length === 0;
  const clearanceReason = cleared
    ? `All required credentials active for ${payerName}.`
    : `Missing active ${missingCredentials.join(', ')} credential(s) for ${payerName}.`;

  return {
    userId,
    staffName,
    role,
    payerName,
    cleared,
    clearanceReason,
    missingCredentials,
    expiringCredentials,
  };
}

/**
 * Computes an agency-wide credential compliance scorecard
 */
export function calculateCredentialRosterScorecard(
  staffList: Array<{
    userId: string;
    staffName: string;
    role: string;
    credentials: CredentialDetail[];
  }>
): CredentialRosterScorecard {
  let fullyCredentialed = 0;
  let expiringSoon = 0;
  let expired = 0;

  const urgentAlerts: CredentialRosterScorecard['urgentAlerts'] = [];
  const payerBreakdown: Record<string, { total: number; cleared: number }> = {};

  for (const staff of staffList) {
    const requiredTypes = REQUIRED_CREDENTIALS_MAP[staff.role] || ['BACB_LICENSE'];
    let staffHasExpired = false;
    let staffHasExpiringSoon = false;
    let staffHasAllActive = true;

    for (const req of requiredTypes) {
      const match = staff.credentials.find(
        (c) =>
          c.credentialType.toUpperCase() === req.toUpperCase() &&
          hasRequiredNumber(c),
      );
      if (!match || match.status === 'EXPIRED' || match.status === 'INACTIVE') {
        staffHasAllActive = false;
        if (match?.status === 'EXPIRED') staffHasExpired = true;
      } else if (match.status === 'EXPIRING_30_DAYS') {
        staffHasExpiringSoon = true;
        urgentAlerts.push({
          staffId: staff.userId,
          staffName: staff.staffName,
          credentialType: match.credentialType,
          expirationDate: match.expirationDate || 'Unknown',
          daysRemaining: match.daysUntilExpiration ?? 0,
        });
      }
    }

    if (staffHasExpired) expired++;
    else if (staffHasExpiringSoon) expiringSoon++;
    else if (staffHasAllActive) fullyCredentialed++;
  }

  const total = staffList.length;
  const complianceRatePct = total > 0 ? Math.round((fullyCredentialed / total) * 100) : 100;

  return {
    totalStaff: total,
    fullyCredentialedStaffCount: fullyCredentialed,
    expiringSoonCount: expiringSoon,
    expiredCount: expired,
    complianceRatePct,
    payerBreakdown,
    urgentAlerts,
  };
}
