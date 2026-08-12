import { describe, expect, it } from 'vitest';

import {
  INTAKE_REJECTABLE_DOCUMENT_KEYS,
  IntakeWriteConflictError,
  assertSingleConditionalWrite,
  buildDocumentCorrectionPatch,
  buildFormCorrectionPatch,
  deriveMessageMutation,
  deriveReadDirection,
  isIntakeReviewItemKey,
  isRejectableIntakeDocumentKey,
  isReviewableIntakeFormField,
  normalizeFormCorrections,
  runAuthorizedIntakeAction,
  validateMagicLinkCreationState,
  validateMagicLinkRotationState,
  validatePacketReadyForClinical,
  validateSubmittedIntakeReview,
  validateUnlockRequest,
  type IntakeClientPacketSnapshot,
} from './intake-action-security';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const PACKET_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PACKET_ID = '44444444-4444-4444-8444-444444444444';

function submittedSnapshot(
  overrides: Partial<IntakeClientPacketSnapshot> = {}
): IntakeClientPacketSnapshot {
  return {
    id: CLIENT_ID,
    status: 'DOCS_SUBMITTED',
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    intakePacket: {
      id: PACKET_ID,
      clientId: CLIENT_ID,
      status: 'SUBMITTED',
      updatedAt: new Date('2026-08-12T12:00:00.000Z'),
      clientChangeRequested: false,
      formData: {
        childName: 'Example Child',
        sig1Name: 'Example Parent',
        sig1Date: '08/12/2026',
        docInsuranceFront: {
          url: `/api/documents?path=${CLIENT_ID}/insurance-front.pdf`,
        },
      },
      rejectionDetails: {},
      intakeFormComplete: true,
      consentFormComplete: true,
      insuranceCardFrontUploaded: true,
      insuranceCardBackUploaded: true,
      medicaidCardFrontUploaded: false,
      medicaidCardBackUploaded: false,
      diagnosticEvalUploaded: true,
      physicianRxUploaded: true,
      iepUploaded: false,
      custodyDocsUploaded: false,
      priorAbaRecordsUploaded: false,
    },
    ...overrides,
  };
}

describe('intake action authorization ordering', () => {
  it('returns a role denial without invoking the database operation', async () => {
    let operationCalls = 0;

    const result = await runAuthorizedIntakeAction(
      async () => ({
        ok: false as const,
        error: 'You are not authorized to perform this action.',
      }),
      async () => {
        operationCalls += 1;
        return { success: true as const };
      }
    );

    expect(result).toEqual({
      success: false,
      code: 'AUTHORIZATION_FAILED',
      error: 'You are not authorized to perform this action.',
    });
    expect(operationCalls).toBe(0);
  });
});

describe('authoritative client and packet binding', () => {
  it('rejects a browser packet id belonging to another client', () => {
    const result = validateSubmittedIntakeReview(
      submittedSnapshot(),
      CLIENT_ID,
      OTHER_PACKET_ID
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'PACKET_CLIENT_MISMATCH',
    });
  });

  it('rejects a persisted packet whose client foreign key disagrees', () => {
    const snapshot = submittedSnapshot();
    snapshot.intakePacket = {
      ...snapshot.intakePacket!,
      clientId: OTHER_CLIENT_ID,
    };

    expect(
      validateSubmittedIntakeReview(snapshot, CLIENT_ID, PACKET_ID)
    ).toMatchObject({
      ok: false,
      code: 'PACKET_CLIENT_MISMATCH',
    });
  });
});

describe('canonical intake allowlists', () => {
  it('allows only upload flags to enter document rejection writes', () => {
    for (const key of INTAKE_REJECTABLE_DOCUMENT_KEYS) {
      expect(isRejectableIntakeDocumentKey(key)).toBe(true);
    }

    expect(isRejectableIntakeDocumentKey('intakeFormComplete')).toBe(false);
    expect(isRejectableIntakeDocumentKey('consentFormComplete')).toBe(false);
  });

  it('rejects unknown, computed Prisma, and prototype-pollution keys', () => {
    for (const key of [
      'status',
      'updatedAt',
      'clientId',
      'magicLinkToken',
      '__proto__',
      'prototype',
      'constructor',
      'insuranceCardFrontUploaded ',
      '',
    ]) {
      expect(isRejectableIntakeDocumentKey(key)).toBe(false);
      expect(isIntakeReviewItemKey(key)).toBe(false);
      expect(isReviewableIntakeFormField(key)).toBe(false);
    }
  });

  it('accepts explicit form fields and exact availability field ids', () => {
    expect(isReviewableIntakeFormField('childName')).toBe(true);
    expect(isReviewableIntakeFormField('sig1Name')).toBe(true);
    expect(isReviewableIntakeFormField('avail_Monday_from')).toBe(true);
    expect(isReviewableIntakeFormField('avail_Sunday_to')).toBe(true);
    expect(isReviewableIntakeFormField('avail_Funday_from')).toBe(false);
  });
});

describe('form correction payload validation', () => {
  it('rejects unknown and prototype-pollution field ids', () => {
    for (const fieldId of ['unknownField', '__proto__', 'constructor']) {
      expect(
        normalizeFormCorrections([{ fieldId, reason: 'Please correct this field.' }])
      ).toMatchObject({
        ok: false,
        code: 'INVALID_FORM_FIELD',
      });
    }
  });

  it('rejects empty, oversized, and weak correction payloads', () => {
    expect(normalizeFormCorrections([])).toMatchObject({
      ok: false,
      code: 'INVALID_FORM_FIELD',
    });
    expect(
      normalizeFormCorrections([
        { fieldId: 'childName', reason: 'bad' },
      ])
    ).toMatchObject({
      ok: false,
      code: 'INVALID_REASON',
    });
    expect(
      normalizeFormCorrections(
        Array.from({ length: 51 }, (_, index) => ({
          fieldId: 'childName',
          reason: `Correction ${index}`,
        }))
      )
    ).toMatchObject({
      ok: false,
      code: 'INVALID_FORM_FIELD',
    });
  });
});

describe('intake status and stale-write gates', () => {
  it('rejects packet review after either persisted status moved', () => {
    expect(
      validateSubmittedIntakeReview(
        submittedSnapshot({ status: 'DOCS_APPROVED_INTAKE' }),
        CLIENT_ID,
        PACKET_ID
      )
    ).toMatchObject({ ok: false, code: 'INVALID_STATUS' });

    const packetMoved = submittedSnapshot();
    packetMoved.intakePacket = {
      ...packetMoved.intakePacket!,
      status: 'PENDING_CLIENT_SUBMISSION',
    };
    expect(
      validateSubmittedIntakeReview(packetMoved, CLIENT_ID, PACKET_ID)
    ).toMatchObject({ ok: false, code: 'INVALID_STATUS' });
  });

  it('classifies a zero-row conditional update as stale', () => {
    expect(() => assertSingleConditionalWrite(0)).toThrow(
      IntakeWriteConflictError
    );
    expect(() => assertSingleConditionalWrite(1)).not.toThrow();
  });

  it('permits link creation and rotation only at their canonical stages', () => {
    expect(
      validateMagicLinkCreationState(
        {
          id: CLIENT_ID,
          status: 'INQUIRY',
          updatedAt: new Date('2026-08-12T12:00:00.000Z'),
          intakePacket: null,
        },
        CLIENT_ID
      )
    ).toEqual({ ok: true });

    expect(
      validateMagicLinkCreationState(submittedSnapshot(), CLIENT_ID)
    ).toMatchObject({ ok: false, code: 'INVALID_STATUS' });

    const pending = submittedSnapshot({ status: 'MAGIC_LINK_SENT' });
    pending.intakePacket = {
      ...pending.intakePacket!,
      status: 'PENDING_CLIENT_SUBMISSION',
    };
    expect(
      validateMagicLinkRotationState(pending, CLIENT_ID, PACKET_ID)
    ).toEqual({ ok: true });
  });

  it('unlocks only a submitted packet with a persisted parent request', () => {
    const requested = submittedSnapshot();
    requested.intakePacket = {
      ...requested.intakePacket!,
      clientChangeRequested: true,
    };

    expect(
      validateUnlockRequest(requested, CLIENT_ID, PACKET_ID)
    ).toEqual({ ok: true });
    expect(
      validateUnlockRequest(submittedSnapshot(), CLIENT_ID, PACKET_ID)
    ).toMatchObject({ ok: false, code: 'INVALID_STATUS' });
  });
});

describe('valid intake correction loop', () => {
  it('returns selected form fields to parent correction without changing client status', () => {
    const snapshot = submittedSnapshot();
    expect(
      validateSubmittedIntakeReview(snapshot, CLIENT_ID, PACKET_ID)
    ).toEqual({ ok: true });

    const correction = buildFormCorrectionPatch(snapshot.intakePacket!, [
      { fieldId: 'childName', reason: 'Use the full legal name.' },
      { fieldId: 'sig1Name', reason: 'Please re-enter the signer name.' },
    ]);

    expect(correction.ok).toBe(true);
    if (!correction.ok) return;
    expect(correction.value).toMatchObject({
      status: 'PENDING_CLIENT_SUBMISSION',
      intakeFormComplete: false,
      consentFormComplete: false,
      rejectionDetails: {
        formField_childName: 'Use the full legal name.',
        formField_sig1Name: 'Please re-enter the signer name.',
      },
    });
    expect(correction.value.formData).not.toHaveProperty('childName');
    expect(correction.value.formData).not.toHaveProperty('sig1Name');
    expect(correction.value.formData).not.toHaveProperty('sig1Date');
    expect(snapshot.status).toBe('DOCS_SUBMITTED');
  });

  it('clears only the mapped upload during a valid document correction', () => {
    const correction = buildDocumentCorrectionPatch(
      submittedSnapshot().intakePacket!,
      'insuranceCardFrontUploaded',
      'The card image is too blurry to read.'
    );

    expect(correction.ok).toBe(true);
    if (!correction.ok) return;
    expect(correction.value).toMatchObject({
      status: 'PENDING_CLIENT_SUBMISSION',
      insuranceCardFrontUploaded: false,
      rejectionDetails: {
        insuranceCardFrontUploaded: 'The card image is too blurry to read.',
      },
    });
    expect(correction.value.formData).not.toHaveProperty('docInsuranceFront');
  });
});

describe('clinical handoff and message-derived fields', () => {
  it('rejects a clinical handoff when a required secure upload is missing', () => {
    const snapshot = submittedSnapshot();

    expect(
      validatePacketReadyForClinical(snapshot, CLIENT_ID, PACKET_ID)
    ).toMatchObject({
      ok: false,
      code: 'MISSING_REQUIRED_ITEMS',
    });
  });

  it('derives message sender fields and read direction from the authenticated actor', () => {
    expect(deriveMessageMutation('parent', '  Hello clinic  ')).toEqual({
      ok: true,
      value: {
        content: 'Hello clinic',
        isFromClient: true,
        senderName: 'Client',
      },
    });
    expect(deriveMessageMutation('staff', 'Update')).toEqual({
      ok: true,
      value: {
        content: 'Update',
        isFromClient: false,
        senderName: 'Clinic Concierge',
      },
    });
    expect(deriveReadDirection('parent')).toBe(false);
    expect(deriveReadDirection('staff')).toBe(true);
  });
});
