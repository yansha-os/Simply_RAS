/**
 * Unified EMR Document Vault & legacy import archive
 *
 * Manages clinical chart documents, categories, verification workflows,
 * expiration alerts for IEPs/authorizations, and historical document archiving.
 */

import { clinicDateKey, endOfClinicDayForDateOnly } from '@/lib/clinicTimezone';

export type DocumentCategory =
  | 'DIAGNOSTIC_AND_MEDICAL'
  | 'INSURANCE_AND_AUTH'
  | 'LEGAL_AND_CONSENTS'
  | 'EDUCATIONAL_AND_IEP'
  | 'ARCHIVES_AND_OTHER';

export interface VaultDocumentItem {
  id: string;
  clientId: string;
  type: string; // DocumentType enum string
  category: DocumentCategory;
  displayName: string;
  fileUrl: string | null;
  expirationDate: string | null; // ISO string
  isVerified: boolean;
  isExpired: boolean;
  daysUntilExpiration: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmrVaultAuditSummary {
  totalDocuments: number;
  verifiedDocumentsCount: number;
  hasDiagnosticEval: boolean;
  hasInsuranceCard: boolean;
  hasSignedConsent: boolean;
  hasIepOnCourse: boolean;
  auditReadinessPct: number; // 0 to 100
  categories: Record<DocumentCategory, VaultDocumentItem[]>;
  expiringSoonAlerts: VaultDocumentItem[];
  expiredAlerts: VaultDocumentItem[];
}

const DOCUMENT_TYPE_LABELS: Record<string, { label: string; category: DocumentCategory }> = {
  DIAGNOSTIC_EVAL: { label: 'Diagnostic Autism Evaluation (F84.0)', category: 'DIAGNOSTIC_AND_MEDICAL' },
  PSYCH_EVAL: { label: 'Psychological / Neurodevelopmental Eval', category: 'DIAGNOSTIC_AND_MEDICAL' },
  REFERRAL: { label: 'Physician ABA Referral / Prescription (Rx)', category: 'DIAGNOSTIC_AND_MEDICAL' },
  INSURANCE_CARD: { label: 'Primary Insurance Card (Front & Back)', category: 'INSURANCE_AND_AUTH' },
  MEDICAID_CARD: { label: 'Secondary / Medicaid Benefit Card', category: 'INSURANCE_AND_AUTH' },
  PRIOR_TREATMENT_PLAN: { label: 'Prior ABA Treatment Plan / PA Letter', category: 'INSURANCE_AND_AUTH' },
  CONSENT: { label: 'Caregiver Treatment & Telehealth Consents', category: 'LEGAL_AND_CONSENTS' },
  CUSTODY: { label: 'Custody / Legal Guardianship Documentation', category: 'LEGAL_AND_CONSENTS' },
  MEET_AND_GREET_FORM: { label: 'Meet & Greet / Home Safety Assessment', category: 'LEGAL_AND_CONSENTS' },
  IEP: { label: 'Individualized Education Program (IEP)', category: 'EDUCATIONAL_AND_IEP' },
  OTHER: { label: 'Historical EMR archive / Miscellaneous', category: 'ARCHIVES_AND_OTHER' },
};

export function getDocumentTypeInfo(type: string): { label: string; category: DocumentCategory } {
  return DOCUMENT_TYPE_LABELS[type] || { label: type.replace(/_/g, ' '), category: 'ARCHIVES_AND_OTHER' };
}

/**
 * Evaluates and organizes raw document records into a clinical vault audit summary
 */
export function organizeEmrDocumentVault(
  documents: Array<{
    id: string;
    clientId: string;
    type: string;
    fileUrl?: string | null;
    expirationDate?: Date | string | null;
    isVerified: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
  }>,
  asOfDate: Date = new Date()
): EmrVaultAuditSummary {
  const asOfMs = asOfDate.getTime();

  const categories: Record<DocumentCategory, VaultDocumentItem[]> = {
    DIAGNOSTIC_AND_MEDICAL: [],
    INSURANCE_AND_AUTH: [],
    LEGAL_AND_CONSENTS: [],
    EDUCATIONAL_AND_IEP: [],
    ARCHIVES_AND_OTHER: [],
  };

  const expiringSoonAlerts: VaultDocumentItem[] = [];
  const expiredAlerts: VaultDocumentItem[] = [];

  let verifiedCount = 0;
  let hasDiagnosticEval = false;
  let hasInsuranceCard = false;
  let hasSignedConsent = false;
  let hasIepOnCourse = false;

  for (const doc of documents) {
    if (doc.isVerified) verifiedCount++;

    const info = getDocumentTypeInfo(doc.type);
    let expirationDateStr: string | null = null;
    let daysUntilExpiration: number | null = null;
    let isExpired = false;

    if (doc.expirationDate) {
      const expMs = new Date(doc.expirationDate).getTime();
      if (Number.isFinite(expMs)) {
        expirationDateStr = new Date(doc.expirationDate).toISOString().split('T')[0];
        const [asOfYear, asOfMonth, asOfDay] = clinicDateKey(asOfDate).split('-').map(Number);
        const [expYear, expMonth, expDay] = expirationDateStr.split('-').map(Number);
        daysUntilExpiration = Math.round(
          (Date.UTC(expYear, expMonth - 1, expDay) -
            Date.UTC(asOfYear, asOfMonth - 1, asOfDay)) /
            (1000 * 60 * 60 * 24),
        );
        isExpired = endOfClinicDayForDateOnly(new Date(doc.expirationDate)).getTime() < asOfMs;
      }
    }

    const item: VaultDocumentItem = {
      id: doc.id,
      clientId: doc.clientId,
      type: doc.type,
      category: info.category,
      displayName: info.label,
      fileUrl: doc.fileUrl || null,
      expirationDate: expirationDateStr,
      isVerified: doc.isVerified,
      isExpired,
      daysUntilExpiration,
      createdAt: new Date(doc.createdAt).toISOString(),
      updatedAt: new Date(doc.updatedAt).toISOString(),
    };

    categories[info.category].push(item);

    if (isExpired) {
      expiredAlerts.push(item);
    } else if (daysUntilExpiration !== null && daysUntilExpiration <= 30) {
      expiringSoonAlerts.push(item);
    }

    const qualifiesForReadiness = doc.isVerified && Boolean(doc.fileUrl) && !isExpired;
    if (qualifiesForReadiness && (doc.type === 'DIAGNOSTIC_EVAL' || doc.type === 'PSYCH_EVAL')) hasDiagnosticEval = true;
    if (qualifiesForReadiness && (doc.type === 'INSURANCE_CARD' || doc.type === 'MEDICAID_CARD')) hasInsuranceCard = true;
    if (qualifiesForReadiness && doc.type === 'CONSENT') hasSignedConsent = true;
    if (qualifiesForReadiness && doc.type === 'IEP') hasIepOnCourse = true;
  }

  // Calculate audit readiness percentage based on required core documents
  let auditScore = 0;
  if (hasDiagnosticEval) auditScore += 35;
  if (hasInsuranceCard) auditScore += 25;
  if (hasSignedConsent) auditScore += 25;
  if (hasIepOnCourse) auditScore += 15;

  return {
    totalDocuments: documents.length,
    verifiedDocumentsCount: verifiedCount,
    hasDiagnosticEval,
    hasInsuranceCard,
    hasSignedConsent,
    hasIepOnCourse,
    auditReadinessPct: Math.min(100, auditScore),
    categories,
    expiringSoonAlerts,
    expiredAlerts,
  };
}
