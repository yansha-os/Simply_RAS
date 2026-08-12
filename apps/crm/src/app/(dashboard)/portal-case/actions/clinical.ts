'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { assertPredecessor } from '@/lib/clientStatusGates';
import { requireClientAccess, requireStaff, CLINICAL_ROLES } from '@/lib/auth-guard';
import {
  parsePacketFormData,
  safeParseJson,
  type IntakePacketDocFlagKey,
} from '@/lib/safeParseJson';

type ClinicalActionResult =
  | { success: true }
  | { success: false; error: string };

const CLINICAL_DOCUMENT_KEYS = [
  'insuranceCardFrontUploaded',
  'insuranceCardBackUploaded',
  'medicaidCardFrontUploaded',
  'medicaidCardBackUploaded',
  'diagnosticEvalUploaded',
  'physicianRxUploaded',
  'iepUploaded',
  'custodyDocsUploaded',
  'priorAbaRecordsUploaded',
] as const satisfies readonly IntakePacketDocFlagKey[];

type ClinicalDocumentKey = (typeof CLINICAL_DOCUMENT_KEYS)[number];

const CLINICAL_DOCUMENT_KEY_SET = new Set<string>(CLINICAL_DOCUMENT_KEYS);

const DOCUMENT_FORM_KEYS: Record<ClinicalDocumentKey, string> = {
  insuranceCardFrontUploaded: 'docInsuranceFront',
  insuranceCardBackUploaded: 'docInsuranceBack',
  medicaidCardFrontUploaded: 'docMedicaidFront',
  medicaidCardBackUploaded: 'docMedicaidBack',
  diagnosticEvalUploaded: 'docEval',
  physicianRxUploaded: 'docReferral',
  iepUploaded: 'docIEP',
  custodyDocsUploaded: 'docCustody',
  priorAbaRecordsUploaded: 'docPriorABA',
};

const FORM_01_REVIEW_FIELDS = new Set([
  'childName', 'preferredName', 'dob', 'sexAtBirth', 'childLivesWithParents',
  'childAddress', 'primaryLang', 'otherLang', 'allergies', 'meds',
  'medConditions', 'elopement', 'diet', 'g1Name', 'g1Relation', 'g1Phone',
  'g1Email', 'g1Address', 'g1ContactPref', 'g1BestTimes', 'g2Name',
  'g2Relation', 'g2Phone', 'g2Email', 'g2Address', 'custodyType',
  'custodyLimits', 'nonParentConsenter', 'custodyDocAttached', 'priInsCompany',
  'priInsPlan', 'priInsMemberId', 'priInsGroup', 'priInsHolderName',
  'priInsHolderDob', 'priInsHolderRel', 'priInsEffective', 'priInsPhone',
  'priInsEmployer', 'hasSecondPlan', 'secInsCompany', 'secInsMemberId',
  'secInsGroup', 'secInsEffective', 'hasMedicaid', 'medicaidStateOther',
  'medicaidId', 'medicaidMCO', 'medicaidLapsed', 'medicaidRenewal', 'pcpName',
  'pcpPractice', 'pcpPhone', 'pcpFax', 'pcpAddress', 'pcpLastVisit',
  'hasDiagnosis', 'evalDate', 'diagnosisText', 'dxInitialDate', 'dxRecentDate',
  'dxProviderName', 'dxCredentials', 'dxPractice', 'dxPhone', 'dxCooccurring',
  'hasReferral', 'referralProvider', 'referralDate', 'referralExpires',
  'referralExpDate', 'hasPriorABA', 'priorABAInfo', 'schoolName', 'schoolGrade',
  'hasIEP', 'serviceCoordinator', 'abaGoals', 'unsafeBehaviors',
  'childInterests', 'prefLocation', 'quietSpace', 'hasPets', 'petTypes',
  'othersHome', 'em1Name', 'em1Rel', 'em1Phone', 'em2Name', 'em2Rel',
  'em2Phone', 'emPermission', 'prefHospital', 'attestationAgree',
  'attestationName',
]);

const FORM_02_REVIEW_FIELDS = new Set([
  'cpt97151', 'cpt97153', 'cpt97154', 'cpt97155', 'cpt97156', 'locHome',
  'locClinic', 'locCommunity', 'locSchool', 'telehealthConsent',
  'telehealthDecline', 'mediaClinical', 'mediaTraining', 'mediaPhotos',
  'mediaMarketing', 'mediaObservation', 'hipaaAck', 'phiInsurance',
  'phiBilling', 'phiPcp', 'phiDiagnosing', 'phiSchool', 'phiOtherTherapies',
  'phiAdd1Name', 'phiAdd1Purpose', 'phiAdd1Initial', 'phiAdd2Name',
  'phiAdd2Purpose', 'phiAdd2Initial', 'aobInitial', 'attendanceInitial',
  'commPhone', 'commSms', 'commEmail', 'commPortal', 'emergencyInitial',
  'eSignInitial', 'sig1Name',
]);

const AVAILABILITY_FIELD_PATTERN =
  /^avail_(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)_(from|to)$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOUNCEABLE_CLINICAL_STATUSES = [
  'DOCS_APPROVED_INTAKE',
  'CLINICAL_REVIEW_APPROVED',
] as const;
const MAX_REASON_LENGTH = 1000;

function isClinicalDocumentKey(key: string): key is ClinicalDocumentKey {
  return CLINICAL_DOCUMENT_KEY_SET.has(key);
}

function isReviewableFormField(fieldId: string): boolean {
  return (
    FORM_01_REVIEW_FIELDS.has(fieldId) ||
    FORM_02_REVIEW_FIELDS.has(fieldId) ||
    AVAILABILITY_FIELD_PATTERN.test(fieldId)
  );
}

function normalizeReason(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < 5) {
    return { ok: false, error: 'Provide a specific correction reason (at least 5 characters).' };
  }
  if (value.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Correction reasons must be ${MAX_REASON_LENGTH} characters or fewer.` };
  }
  return { ok: true, value };
}

function parseRejectionDetails(raw: unknown): Record<string, string> {
  const parsed = safeParseJson<unknown>(raw, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([key, value]) => key.length <= 160 && typeof value === 'string'
    )
  );
}

function isAuthorizedDocumentPath(path: string | null, clientId: string): boolean {
  if (!path) return false;
  const separatorIndex = path.indexOf('/');
  if (separatorIndex < 1 || path.slice(0, separatorIndex) !== clientId) return false;
  return /^[a-zA-Z0-9._-]{1,160}$/.test(path.slice(separatorIndex + 1));
}

function hasAuthorizedDocumentRoute(value: unknown, clientId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const url = (value as Record<string, unknown>).url;
  if (typeof url !== 'string') return false;

  const [pathname, query = ''] = url.split('?', 2);
  if (pathname !== '/api/documents') return false;
  const path = new URLSearchParams(query).get('path');
  return isAuthorizedDocumentPath(path, clientId);
}

function requiredClinicalReviewKeys(
  formData: Record<string, unknown>
): IntakePacketDocFlagKey[] {
  const keys: IntakePacketDocFlagKey[] = [
    'intakeFormComplete',
    'consentFormComplete',
    'insuranceCardFrontUploaded',
    'insuranceCardBackUploaded',
    'diagnosticEvalUploaded',
    'physicianRxUploaded',
  ];

  const hasMedicaid =
    Boolean(formData.hasMedicaid) &&
    formData.hasMedicaid !== 'No' &&
    formData.hasMedicaid !== 'Not Sure';
  const hasCustodyDoc =
    formData.custodyDocAttached === 'Yes — Attached' ||
    formData.custodyDocAttached === 'Yes — Will Provide';
  const hasIep =
    formData.hasIEP === 'Yes — Attached' ||
    formData.hasIEP === 'Yes — Will Provide';

  if (hasMedicaid) {
    keys.push('medicaidCardFrontUploaded', 'medicaidCardBackUploaded');
  }
  if (hasCustodyDoc) keys.push('custodyDocsUploaded');
  if (hasIep) keys.push('iepUploaded');
  if (formData.hasPriorABA === 'Yes') keys.push('priorAbaRecordsUploaded');

  return keys;
}

function revalidateClinicalReview(clientId: string) {
  revalidatePath('/', 'layout');
  revalidatePath(`/client/${clientId}`);
  revalidatePath('/portal-case/clients');
  revalidatePath('/clinical-support/clients');
  revalidatePath('/magic-link/[id]', 'page');
}

export async function approveClinicalReview(clientId: string): Promise<ClinicalActionResult> {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    if (!UUID_PATTERN.test(clientId)) {
      return { success: false, error: 'Invalid client.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) return { success: false, error: access.error };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { intakePacket: true },
    });
    if (!client) return { success: false, error: 'Client not found.' };

    const gate = assertPredecessor(
      client.status,
      ['DOCS_APPROVED_INTAKE', 'CLINICAL_REVIEW_APPROVED'],
      'CLINICAL_REVIEW_APPROVED'
    );
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }
    if (gate.alreadyPast) {
      if (client.intakePacket?.status !== 'APPROVED') {
        return {
          success: false,
          error: 'The packet and client statuses do not agree. Intake must reconcile this case.',
        };
      }
      return { success: true };
    }

    const packet = client.intakePacket;
    if (!packet || packet.status !== 'APPROVED') {
      return {
        success: false,
        error: 'The intake packet must be re-approved by Intake before clinical approval.',
      };
    }

    const formData = parsePacketFormData(packet.formData);
    const missingRequiredItems = requiredClinicalReviewKeys(formData).filter((key) => {
      if (!packet[key]) return true;
      if (!isClinicalDocumentKey(key)) return false;
      return !hasAuthorizedDocumentRoute(formData[DOCUMENT_FORM_KEYS[key]], clientId);
    });
    if (missingRequiredItems.length > 0) {
      return {
        success: false,
        error:
          'Clinical review cannot be approved until every required form and secure upload is available.',
      };
    }

    const update = await prisma.client.updateMany({
      where: { id: clientId, status: 'DOCS_APPROVED_INTAKE' },
      data: { status: 'CLINICAL_REVIEW_APPROVED' },
    });
    if (update.count !== 1) {
      return {
        success: false,
        error: 'The client status changed while you were reviewing. Refresh and try again.',
      };
    }

    revalidateClinicalReview(clientId);
    return { success: true };
  } catch (error) {
    console.error(
      'approveClinicalReview failed:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return { success: false, error: 'Failed to approve clinical review. Please try again.' };
  }
}

export async function rejectClinicalReview(
  clientId: string,
  documentKey: string,
  note: string
): Promise<ClinicalActionResult> {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    if (!UUID_PATTERN.test(clientId)) {
      return { success: false, error: 'Invalid client.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) return { success: false, error: access.error };

    // Forms must use field-level corrections; only explicit upload flags may
    // reach the computed Prisma update below.
    if (!isClinicalDocumentKey(documentKey)) {
      return { success: false, error: 'Invalid document key.' };
    }

    const reason = normalizeReason(note);
    if (!reason.ok) return { success: false, error: reason.error };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { intakePacket: true }
    });

    if (!client || !client.intakePacket) {
      return { success: false, error: 'Client or intake packet not found.' };
    }
    if (
      !BOUNCEABLE_CLINICAL_STATUSES.includes(
        client.status as (typeof BOUNCEABLE_CLINICAL_STATUSES)[number]
      )
    ) {
      return {
        success: false,
        error: 'Clinical corrections are only allowed during the clinical review stage.',
      };
    }
    if (client.intakePacket.status !== 'APPROVED') {
      return {
        success: false,
        error: 'This packet is already in a correction or intake-review cycle.',
      };
    }

    const formData = parsePacketFormData(client.intakePacket.formData);
    if (
      !client.intakePacket[documentKey] ||
      !hasAuthorizedDocumentRoute(formData[DOCUMENT_FORM_KEYS[documentKey]], clientId)
    ) {
      return {
        success: false,
        error: 'This document is not available through the authorized client document route.',
      };
    }

    const currentDetails = parseRejectionDetails(client.intakePacket.rejectionDetails);
    const rejectionDetails = {
      ...currentDetails,
      [documentKey]: `[Clinical Review] ${reason.value}`,
    };

    // Clear the secure document reference so the parent can re-upload it.
    delete formData[DOCUMENT_FORM_KEYS[documentKey]];

    // PENDING_CLIENT_SUBMISSION is the live correction-loop state accepted by
    // submitMagicLinkPacket. REJECTED_BY_CLINICAL is retained only for legacy rows.
    await prisma.$transaction(async (tx) => {
      const packetUpdate = await tx.intakePacket.updateMany({
        where: {
          id: client.intakePacket!.id,
          clientId,
          status: 'APPROVED',
        },
        data: {
          [documentKey]: false,
          status: 'PENDING_CLIENT_SUBMISSION',
          rejectionNotes: reason.value,
          rejectionDetails,
          formData,
        },
      });
      if (packetUpdate.count !== 1) throw new Error('STALE_INTAKE_PACKET');

      const clientUpdate = await tx.client.updateMany({
        where: {
          id: clientId,
          status: { in: [...BOUNCEABLE_CLINICAL_STATUSES] },
        },
        data: { status: 'DOCS_SUBMITTED' },
      });
      if (clientUpdate.count !== 1) throw new Error('STALE_CLIENT_STATUS');
    });

    revalidateClinicalReview(clientId);
    return { success: true };
  } catch (error) {
    console.error(
      'rejectClinicalReview failed:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return { success: false, error: 'Failed to request a correction. Please try again.' };
  }
}

export async function rejectClinicalFormFieldsBulk(
  clientId: string,
  packetId: string,
  fields: { fieldId: string; reason: string }[]
): Promise<ClinicalActionResult> {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(packetId)) {
      return { success: false, error: 'Invalid client or packet.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) return { success: false, error: access.error };
    if (!Array.isArray(fields) || fields.length === 0 || fields.length > 50) {
      return { success: false, error: 'Select between 1 and 50 form fields.' };
    }

    const normalizedFields: { fieldId: string; reason: string }[] = [];
    const seenFields = new Set<string>();
    for (const field of fields) {
      const fieldId = typeof field?.fieldId === 'string' ? field.fieldId.trim() : '';
      if (!isReviewableFormField(fieldId)) {
        return { success: false, error: 'One or more selected form fields are invalid.' };
      }
      if (seenFields.has(fieldId)) continue;

      const reason = normalizeReason(field?.reason);
      if (!reason.ok) return { success: false, error: reason.error };
      normalizedFields.push({ fieldId, reason: reason.value });
      seenFields.add(fieldId);
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { intakePacket: true },
    });
    const packet = client?.intakePacket;
    if (!client || !packet || packet.id !== packetId) {
      return { success: false, error: 'Packet does not belong to this client.' };
    }
    if (
      !BOUNCEABLE_CLINICAL_STATUSES.includes(
        client.status as (typeof BOUNCEABLE_CLINICAL_STATUSES)[number]
      )
    ) {
      return {
        success: false,
        error: 'Clinical corrections are only allowed during the clinical review stage.',
      };
    }
    if (packet.status !== 'APPROVED') {
      return {
        success: false,
        error: 'This packet is already in a correction or intake-review cycle.',
      };
    }

    const formData = parsePacketFormData(packet.formData);
    const rejectionDetails = parseRejectionDetails(packet.rejectionDetails);
    let intakeFormComplete = packet.intakeFormComplete;
    let consentFormComplete = packet.consentFormComplete;

    for (const field of normalizedFields) {
      rejectionDetails[`formField_${field.fieldId}`] =
        `[Clinical Review] ${field.reason}`;
      delete formData[field.fieldId];

      if (field.fieldId === 'sig1Name') delete formData.sig1Date;
      if (field.fieldId === 'attestationName') delete formData.attestationDate;

      if (FORM_02_REVIEW_FIELDS.has(field.fieldId)) {
        consentFormComplete = false;
      } else {
        intakeFormComplete = false;
      }
    }

    await prisma.$transaction(async (tx) => {
      const packetUpdate = await tx.intakePacket.updateMany({
        where: { id: packetId, clientId, status: 'APPROVED' },
        data: {
          formData,
          rejectionDetails,
          rejectionNotes: normalizedFields[0]?.reason ?? null,
          status: 'PENDING_CLIENT_SUBMISSION',
          intakeFormComplete,
          consentFormComplete,
        },
      });
      if (packetUpdate.count !== 1) throw new Error('STALE_INTAKE_PACKET');

      const clientUpdate = await tx.client.updateMany({
        where: {
          id: clientId,
          status: { in: [...BOUNCEABLE_CLINICAL_STATUSES] },
        },
        data: { status: 'DOCS_SUBMITTED' },
      });
      if (clientUpdate.count !== 1) throw new Error('STALE_CLIENT_STATUS');
    });

    revalidateClinicalReview(clientId);
    return { success: true };
  } catch (error) {
    console.error(
      'rejectClinicalFormFieldsBulk failed:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return { success: false, error: 'Failed to request form corrections. Please try again.' };
  }
}

export async function resolveP2PDenial(
  paId: string,
  notes: string
): Promise<ClinicalActionResult> {
  try {
    const auth = await requireStaff(CLINICAL_ROLES);
    if (!auth.ok) return { success: false, error: auth.error };
    if (!UUID_PATTERN.test(paId)) {
      return { success: false, error: 'Invalid PA request.' };
    }

    const reason = normalizeReason(notes);
    if (!reason.ok) return { success: false, error: reason.error };

    const existingPa = await prisma.pARequest.findUnique({
      where: { id: paId },
      select: { clientId: true },
    });
    if (!existingPa) return { success: false, error: 'PA request not found.' };

    const access = await requireClientAccess(existingPa.clientId);
    if (!access.ok) return { success: false, error: access.error };

    await prisma.pARequest.update({
      where: { id: paId },
      data: {
        p2pResolved: true,
        p2pNotes: reason.value,
      },
    });

    revalidatePath(`/client/${existingPa.clientId}`);
    revalidatePath('/clinical-support/clients');
    return { success: true };
  } catch (error) {
    console.error(
      'resolveP2PDenial failed:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return { success: false, error: 'Failed to resolve the P2P denial. Please try again.' };
  }
}
