import { canonicalDocumentReference } from '@/lib/documentReference';
import type { DocumentCategory, VaultDocumentItem } from '@/lib/emrDocumentVault';

export type BillingDocGroup =
  | 'VOB_INSURANCE'
  | 'PA_CLINICAL'
  | 'CLAIMS_SUPPORT';

export type BillingDocumentItem = {
  id: string;
  source: 'intake' | 'vault';
  key: string;
  label: string;
  group: BillingDocGroup;
  url: string | null;
  requiredForPa: boolean;
  isVerified?: boolean;
  expirationDate?: string | null;
};

export type BillingDocumentsSummary = {
  items: BillingDocumentItem[];
  presentCount: number;
  requiredCount: number;
  requiredPresentCount: number;
  readinessPct: number;
  insurancePayer: string | null;
  memberId: string | null;
  medicaidId: string | null;
  hasMedicaid: boolean;
};

const BILLING_VAULT_CATEGORIES: DocumentCategory[] = [
  'INSURANCE_AND_AUTH',
  'DIAGNOSTIC_AND_MEDICAL',
  'EDUCATIONAL_AND_IEP',
];

const INTAKE_BILLING_FIELDS: Array<{
  key: string;
  label: string;
  group: BillingDocGroup;
  requiredForPa?: boolean;
}> = [
  {
    key: 'docInsuranceFront',
    label: 'Primary Insurance Card (Front)',
    group: 'VOB_INSURANCE',
    requiredForPa: true,
  },
  {
    key: 'docInsuranceBack',
    label: 'Primary Insurance Card (Back)',
    group: 'VOB_INSURANCE',
    requiredForPa: true,
  },
  {
    key: 'docMedicaidFront',
    label: 'Medicaid Card (Front)',
    group: 'VOB_INSURANCE',
  },
  {
    key: 'docMedicaidBack',
    label: 'Medicaid Card (Back)',
    group: 'VOB_INSURANCE',
  },
  {
    key: 'docEval',
    label: 'Diagnostic Autism Evaluation (F84.0)',
    group: 'PA_CLINICAL',
    requiredForPa: true,
  },
  {
    key: 'docReferral',
    label: 'Physician ABA Referral / Prescription',
    group: 'PA_CLINICAL',
    requiredForPa: true,
  },
  {
    key: 'docPriorABA',
    label: 'Prior ABA Treatment Plan / Records',
    group: 'PA_CLINICAL',
  },
  {
    key: 'docIEP',
    label: 'Individualized Education Program (IEP)',
    group: 'CLAIMS_SUPPORT',
  },
];

export const BILLING_DOC_GROUP_META: Record<
  BillingDocGroup,
  { title: string; description: string }
> = {
  VOB_INSURANCE: {
    title: 'Insurance & VOB',
    description: 'Primary and Medicaid cards for eligibility verification and payer portals.',
  },
  PA_CLINICAL: {
    title: 'Prior Auth Supporting',
    description: 'Diagnostic evaluation, physician referral, and prior ABA records for PA submission.',
  },
  CLAIMS_SUPPORT: {
    title: 'Claims & Treatment Support',
    description: 'Educational and treatment documentation billing may attach to claims or re-auth.',
  },
};

function displayText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseIntakeFormData(value: unknown): Record<string, unknown> {
  let parsed = value;
  try {
    for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
      parsed = JSON.parse(parsed);
    }
  } catch {
    return {};
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function vaultGroupForType(type: string): BillingDocGroup {
  if (type === 'IEP') return 'CLAIMS_SUPPORT';
  if (
    type === 'INSURANCE_CARD' ||
    type === 'MEDICAID_CARD' ||
    type === 'PRIOR_TREATMENT_PLAN'
  ) {
    return type === 'PRIOR_TREATMENT_PLAN' ? 'PA_CLINICAL' : 'VOB_INSURANCE';
  }
  return 'PA_CLINICAL';
}

function vaultRequiredForPa(type: string): boolean {
  return (
    type === 'DIAGNOSTIC_EVAL' ||
    type === 'PSYCH_EVAL' ||
    type === 'REFERRAL' ||
    type === 'INSURANCE_CARD'
  );
}

export function collectBillingDocuments(input: {
  clientId: string;
  formData: Record<string, unknown>;
  vaultItems?: VaultDocumentItem[];
}): BillingDocumentsSummary {
  const { clientId, formData, vaultItems = [] } = input;

  const intakeItems: BillingDocumentItem[] = INTAKE_BILLING_FIELDS.map((field) => ({
    id: `intake:${field.key}`,
    source: 'intake' as const,
    key: field.key,
    label: field.label,
    group: field.group,
    url: canonicalDocumentReference(formData[field.key], clientId),
    requiredForPa: field.requiredForPa ?? false,
  }));

  const vaultBillingItems: BillingDocumentItem[] = vaultItems
    .filter((item) => BILLING_VAULT_CATEGORIES.includes(item.category))
    .map((item) => ({
      id: `vault:${item.id}`,
      source: 'vault' as const,
      key: item.type,
      label: item.displayName,
      group: vaultGroupForType(item.type),
      url: item.fileUrl,
      requiredForPa: vaultRequiredForPa(item.type),
      isVerified: item.isVerified,
      expirationDate: item.expirationDate,
    }));

  const items = [...intakeItems, ...vaultBillingItems];
  const requiredItems = items.filter((item) => item.requiredForPa);
  const presentCount = items.filter((item) => item.url).length;
  const requiredPresentCount = requiredItems.filter((item) => item.url).length;
  const requiredCount = requiredItems.length;
  const readinessPct =
    requiredCount === 0
      ? 100
      : Math.round((requiredPresentCount / requiredCount) * 100);

  return {
    items,
    presentCount,
    requiredCount,
    requiredPresentCount,
    readinessPct,
    insurancePayer: displayText(formData.insurancePayer),
    memberId: displayText(formData.insuranceMemberId),
    medicaidId: displayText(formData.medicaidId),
    hasMedicaid: formData.hasMedicaid === 'Yes' || formData.hasMedicaid === true,
  };
}
