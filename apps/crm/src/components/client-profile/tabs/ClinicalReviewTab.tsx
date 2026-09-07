'use client';

import React, { Fragment, useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DocumentReviewPreviewModal } from '@/components/client-profile/DocumentReviewPreviewModal';
import { DocumentReviewStackedDialog } from '@/components/client-profile/DocumentReviewStackedDialog';
import { SecureDocumentPreviewContent } from '@/components/client-profile/SecureDocumentPreviewContent';
import {
  DocumentReviewApproveButton,
  DocumentReviewApprovedBadge,
  DocumentReviewRejectButton,
  DocumentReviewSendCorrectionsButton,
} from '@/components/client-profile/DocumentReviewToolbarButtons';
import { FileText, CheckCircle, AlertTriangle, Eye, Pencil, Clock } from 'lucide-react';
import { getSecureDocument } from '@/lib/secureDocument';
import { approveClinicalReview, approveClinicalReviewItem, rejectClinicalReview, rejectClinicalFormFieldsBulk } from '@/app/(dashboard)/portal-case/actions/clinical';
import {
  CLINICAL_VERIFICATION_DB_TO_FORM_KEY,
  CLINICAL_VERIFICATION_DOC_LABELS,
  getRequiredClinicalVerificationKeys,
  type ClinicalVerificationDocumentKey,
} from '@/lib/clinicalVerificationDocs';
import { parseClinicalReviewApprovals, resolveClinicalReviewRowBadge, isClinicalFamilyCorrectionLoop, shouldShowClinicalWaitingForFamilyBanner, shouldShowClinicalNeedsReviewBanner, summarizeClinicalCorrectionStates, type ClinicalReviewItemKey } from '@/lib/clinicalReviewApprovals';
import { Form01ClientIntake } from '@/components/magic-link/Form01ClientIntake';
import { Form02Consent } from '@/components/magic-link/Form02Consent';
import { parsePacketFormData, safeParseJson } from '@/lib/safeParseJson';

type ClinicalPacketView = {
  id: string;
  status: string;
  formData?: unknown;
  rejectionDetails?: unknown;
  intakeFormComplete: boolean;
  consentFormComplete: boolean;
  insuranceCardFrontUploaded: boolean;
  insuranceCardBackUploaded: boolean;
  medicaidCardFrontUploaded: boolean;
  medicaidCardBackUploaded: boolean;
  diagnosticEvalUploaded: boolean;
  physicianRxUploaded: boolean;
  iepUploaded: boolean;
  custodyDocsUploaded: boolean;
  priorAbaRecordsUploaded: boolean;
  [key: string]: unknown;
};

type ClinicalClientView = {
  id: string;
  status: string;
  intakePacket: ClinicalPacketView | null;
  [key: string]: unknown;
};

const FORM_02_FIELD_KEYS = new Set([
  'cpt97151', 'cpt97153', 'cpt97154', 'cpt97155', 'cpt97156', 'cpt97157',
  'cpt97158', 'locHome', 'locClinic', 'locCommunity', 'locSchool',
  'telehealthConsent', 'telehealthDecline', 'mediaClinical', 'mediaTraining',
  'mediaPhotos', 'mediaMarketing', 'mediaObservation', 'hipaaAck',
  'hipaaInitial', 'photoInitial', 'cancelInitial', 'phiInsurance', 'phiBilling',
  'phiPcp', 'phiDiagnosing', 'phiSchool', 'phiOtherTherapies', 'phiAdd1Name',
  'phiAdd1Purpose', 'phiAdd1Initial', 'phiAdd2Name', 'phiAdd2Purpose',
  'phiAdd2Initial', 'aobInitial', 'attendanceInitial', 'commPhone', 'commSms',
  'commEmail', 'commPortal', 'emergencyInitial', 'eSignInitial', 'sig1Name',
  'sig1Date',
]);

const CLINICAL_COMPLETE_STATUSES = new Set([
  'CLINICAL_REVIEW_APPROVED',
  'VOB_COMPLETED',
  'PA_SUBMITTED',
  'PA_APPROVED',
  'ASSESSMENT_SCHEDULED',
  'REPORT_ASSEMBLED',
  'TX_PA_SUBMITTED',
  'TX_PA_APPROVED',
  'STAFFING_PENDING',
  'ACTIVE',
  'DISCHARGED',
]);

function parseRejectionDetails(raw: unknown): Record<string, string> {
  const parsed = safeParseJson<unknown>(raw, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => typeof value === 'string')
  );
}

function getActionError(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('error' in result)) return null;
  const error = (result as { error?: unknown }).error;
  return typeof error === 'string' && error.trim() ? error : null;
}

export default function ClinicalReviewTab({
  client,
  documentVerificationOnly = false,
}: {
  client: ClinicalClientView;
  /** CSS clinical mode — verify uploads only; Intake already approved Form 01/02. */
  documentVerificationOnly?: boolean;
}) {
  const router = useRouter();
  const packet = client.intakePacket;

  const [previewDoc, setPreviewDoc] = useState<{ key: ClinicalReviewItemKey, name: string } | null>(null);
  const [rejectDoc, setRejectDoc] = useState<{ key: string, name: string } | null>(null);

  // Staged rejection states
  const [isChangeMode, setIsChangeMode] = useState(false);
  const [stagedRejections, setStagedRejections] = useState<string[]>([]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [isActionPending, startActionTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState('');
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    const hasOpenDialog = Boolean(
      previewDoc ||
      rejectDoc ||
      showDiscardConfirm ||
      showSubmitConfirm ||
      showApproveConfirm
    );
    if (!hasOpenDialog) return;

    const closeTopDialog = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isActionPending) return;
      event.preventDefault();

      if (showSubmitConfirm) return setShowSubmitConfirm(false);
      if (showDiscardConfirm) return setShowDiscardConfirm(false);
      if (showApproveConfirm) return setShowApproveConfirm(false);
      if (rejectDoc) {
        setRejectDoc(null);
        setRejectReason('');
        return;
      }
      if (previewDoc) {
        if (stagedRejections.length > 0) {
          setShowDiscardConfirm(true);
        } else {
          setPreviewDoc(null);
          setIsChangeMode(false);
        }
      }
    };

    document.addEventListener('keydown', closeTopDialog);
    return () => document.removeEventListener('keydown', closeTopDialog);
  }, [
    isActionPending,
    previewDoc,
    rejectDoc,
    showApproveConfirm,
    showDiscardConfirm,
    showSubmitConfirm,
    stagedRejections.length,
  ]);

  const runAction = (
    operation: () => Promise<unknown>,
    successMessage: string,
    onSuccess?: () => void
  ) => {
    setActionError(null);
    setActionMessage(null);
    startActionTransition(async () => {
      try {
        const result = await operation();
        const error = getActionError(result);
        if (error) {
          setActionError(error);
          return;
        }
        onSuccess?.();
        setActionMessage(successMessage);
        router.refresh();
      } catch {
        setActionError('The request could not be completed. Please try again.');
      }
    });
  };

  if (!packet) {
    return (
      <Card className="overflow-hidden border-dashed border-white/10 bg-zinc-950/70">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center" role="status">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
            <FileText className="h-7 w-7 text-amber-400" aria-hidden="true" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-white">Clinical review is not ready</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
            Intake must generate and approve the parent packet before clinical documents can be reviewed.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rejectionDetails = parseRejectionDetails(packet.rejectionDetails);
  const formData = parsePacketFormData(packet.formData);
  const approvedDocs = parseClinicalReviewApprovals(formData);

  const rejectedFieldsList = Object.keys(rejectionDetails)
    .filter(k => k.startsWith('formField_'))
    .map(k => k.replace('formField_', ''));

  const handleRejectFormField = (fieldId: string) => {
    if (stagedRejections.includes(fieldId)) {
      setStagedRejections(prev => prev.filter(id => id !== fieldId));
    } else {
      setStagedRejections(prev => [...prev, fieldId]);
    }
  };

  const handleCloseModal = () => {
    if (stagedRejections.length > 0) {
      setShowDiscardConfirm(true);
    } else {
      setPreviewDoc(null);
      setIsChangeMode(false);
    }
  };

  const handleBulkRejectSubmit = () => {
    const reason = bulkRejectReason.trim();
    if (reason.length < 5) {
      setActionError('Provide a specific correction reason (at least 5 characters).');
      return;
    }

    const fields = stagedRejections.map(fieldId => ({ fieldId, reason }));
    runAction(
      () => rejectClinicalFormFieldsBulk(client.id, packet.id, fields),
      'The parent packet is open for the requested corrections. Other approved clinical items stay approved.',
      () => {
        setPreviewDoc(null);
        setIsChangeMode(false);
        setStagedRejections([]);
        setShowSubmitConfirm(false);
        setBulkRejectReason('');
      }
    );
  };

  const dbKeyToFormKey: Record<string, string> =
    CLINICAL_VERIFICATION_DB_TO_FORM_KEY;
  const requiredDocumentKeys = getRequiredClinicalVerificationKeys(formData);
  const visibleKeys: ClinicalReviewItemKey[] = documentVerificationOnly
    ? [...requiredDocumentKeys]
    : [
        'intakeFormComplete',
        'consentFormComplete',
        ...requiredDocumentKeys,
      ];

  const clinicalReviewComplete = CLINICAL_COMPLETE_STATUSES.has(client.status);
  const isClinicalReviewReady =
    client.status === 'DOCS_APPROVED_INTAKE' && packet.status === 'APPROVED';
  const correctionEntries = Object.entries(rejectionDetails);
  const clinicalCorrectionLoop = isClinicalFamilyCorrectionLoop({
    clientStatus: client.status,
    packetStatus: packet.status,
    rejectionDetails,
  });
  const correctionSummary = summarizeClinicalCorrectionStates(formData, rejectionDetails);
  const clinicalStatusMismatch =
    (clinicalReviewComplete || client.status === 'DOCS_APPROVED_INTAKE') &&
    packet.status !== 'APPROVED' &&
    !clinicalCorrectionLoop;
  const awaitingParentCorrections = shouldShowClinicalWaitingForFamilyBanner({
    clientStatus: client.status,
    packetStatus: packet.status,
    rejectionDetails,
    formData,
  });
  const needsCssReReview = shouldShowClinicalNeedsReviewBanner({
    clientStatus: client.status,
    packetStatus: packet.status,
    rejectionDetails,
    formData,
  });
  const awaitingParentSubmission =
    packet.status === 'PENDING_CLIENT_SUBMISSION' &&
    correctionEntries.length === 0 &&
    client.status !== 'DOCS_APPROVED_INTAKE';
  const awaitingIntakeReview =
    client.status === 'DOCS_SUBMITTED' &&
    packet.status === 'SUBMITTED';
  const legacyClinicalRejection = packet.status === 'REJECTED_BY_CLINICAL';
  const allApproved =
    clinicalReviewComplete ||
    (isClinicalReviewReady && visibleKeys.every(k => approvedDocs.includes(k)));
  const previewIsForm =
    previewDoc?.key === 'intakeFormComplete' || previewDoc?.key === 'consentFormComplete';
  const previewItemAvailable = previewDoc
    ? previewIsForm
      ? Boolean(packet[previewDoc.key])
      : Boolean(
          getSecureDocument(
            formData[dbKeyToFormKey[previewDoc.key] || previewDoc.key],
            client.id
          )
        )
    : false;

  const renderDocumentRow = ({ title, dbKey, isForm = false }: { title: string, dbKey: ClinicalReviewItemKey, isForm?: boolean }) => {
    const isApprovedLocally = approvedDocs.includes(dbKey) || clinicalReviewComplete;
    const document = isForm
      ? null
      : getSecureDocument(formData[dbKeyToFormKey[dbKey]], client.id);
    const isAvailable = isForm ? Boolean(packet[dbKey]) : Boolean(document);
    const directRejection = rejectionDetails[dbKey];
    const hasFormRejection = isForm && Object.keys(rejectionDetails).some((key) => {
      if (!key.startsWith('formField_')) return false;
      const fieldId = key.slice('formField_'.length);
      const isForm02 = dbKey === 'consentFormComplete';
      return isForm02 ? FORM_02_FIELD_KEYS.has(fieldId) : !FORM_02_FIELD_KEYS.has(fieldId);
    });
    const isRejected = Boolean(directRejection || hasFormRejection);
    
    return (
      <div className="flex items-center justify-between text-sm p-2 hover:bg-white/5 rounded-lg transition-colors group">
        <button 
          type="button"
          onClick={() => {
            setActionError(null);
            setPreviewDoc({ key: dbKey, name: title });
          }}
          disabled={!isForm && !isAvailable}
          aria-label={`Preview ${title}`}
          className="flex-1 flex flex-col text-left group-hover:text-brand-blue-400 transition-colors py-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex items-center text-zinc-300 font-medium">
            <FileText className="w-4 h-4 mr-3 text-zinc-500" aria-hidden="true" /> {title}
          </span>
          {directRejection && (
            <span className={`ml-7 mt-1 pr-4 text-xs ${isAvailable ? 'text-amber-300' : 'text-red-400'}`}>
              {isAvailable
                ? `New upload received — review again. Previous note: ${directRejection}`
                : `Correction requested: ${directRejection}`}
            </span>
          )}
        </button>
        
        <div className="flex items-center space-x-2">
          {(() => {
            const rowBadge = resolveClinicalReviewRowBadge({
              isRejected,
              isApproved: isApprovedLocally,
              isAvailable,
              clientStatus: client.status,
              packetStatus: packet.status,
            });

            if (rowBadge === 'WAITING_FOR_FAMILY') {
              return (
                <span className="flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                  <Clock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> WAITING FOR FAMILY
                </span>
              );
            }

            if (rowBadge === 'CHANGES_NEEDED') {
              return (
                <span className="flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  CHANGES NEEDED
                </span>
              );
            }

            if (rowBadge === 'APPROVED') {
              return (
                <span className="flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wider bg-green-500/10 text-green-400">
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> APPROVED
                </span>
              );
            }

            if (rowBadge === 'MISSING') {
              return (
                <span className="flex items-center bg-zinc-500/10 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase">
                  {packet.status === 'PENDING_CLIENT_SUBMISSION' ? 'PENDING UPLOAD' : 'MISSING'}
                </span>
              );
            }

            if (rowBadge === 'AWAITING_INTAKE') {
              return (
                <span className="flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  AWAITING INTAKE
                </span>
              );
            }

            return (
              <span className="flex items-center border border-[rgba(255,122,69,0.3)] bg-[rgba(255,122,69,0.15)] text-[var(--dawn-hot)] px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase">
                NEEDS REVIEW
              </span>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 relative">
      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}
      {actionMessage && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200"
        >
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
          <span>{actionMessage}</span>
        </div>
      )}

      {awaitingParentSubmission && (
        <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100" role="status">
          The parent packet is open in the secure magic-link flow. Clinical review unlocks after the parent submits it
          and Intake completes its review.
        </div>
      )}

      {awaitingParentCorrections && (
        <div className="rounded-2xl border border-red-500/25 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_55%)] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
            <div>
              <h3 className="font-heading font-semibold text-white">
                Waiting for family
              </h3>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                Clinical Support flagged the documents below. This case stays on the Clinical Support queue until the family re-uploads. Intake is not in this loop.
              </p>
              {correctionEntries.length > 0 && (
                <ul className="mt-3 space-y-2" aria-label="Requested corrections">
                  {correctionEntries.map(([key, reason]) => {
                    const resubmitted = correctionSummary.needsCssReviewKeys.includes(key);
                    return (
                    <li key={key} className={`rounded-lg border px-3 py-2 text-xs ${resubmitted ? 'border-amber-500/20 bg-amber-500/10 text-amber-100' : 'border-white/10 bg-black/20 text-red-200'}`}>
                      {resubmitted ? `New upload received — ${reason}` : reason}
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {needsCssReReview && (
        <div className="rounded-2xl border border-amber-500/25 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_55%)] p-5" role="status">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
            <div>
              <h3 className="font-heading font-semibold text-white">
                Needs review
              </h3>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                The family re-uploaded the flagged document. Preview the new file and re-approve it. The previous rejection note stays until you approve.
              </p>
              {correctionEntries.length > 0 && (
                <ul className="mt-3 space-y-2" aria-label="Documents ready for re-review">
                  {correctionEntries.map(([key, reason]) => (
                    <li key={key} className="rounded-lg border border-amber-500/20 bg-black/20 px-3 py-2 text-xs text-amber-100">
                      New upload received — review again. Previous note: {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {awaitingIntakeReview && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100" role="status">
          Parent changes are in the Intake queue. Clinical review unlocks after Intake re-approves the packet.
        </div>
      )}

      {legacyClinicalRejection && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100" role="alert">
          This packet is in the legacy Clinical Rejected state, which cannot be resubmitted through the parent portal.
          Intake must reset it to the active correction loop before review can continue.
        </div>
      )}

      {clinicalStatusMismatch && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100" role="alert">
          The packet and client pipeline statuses do not agree. Clinical approval is blocked until Intake reconciles
          the canonical packet state.
        </div>
      )}

      <Card className="border-white/10 shadow-sm w-full">
        <CardHeader className="pb-4 border-b border-white/5 flex flex-row justify-between items-center">
          <div>
            <CardTitle className="text-lg text-white flex items-center gap-3">
              {documentVerificationOnly ? 'Clinical Document Verification' : 'Clinical Review'}
              {clinicalReviewComplete && (
                <span className="text-[10px] font-bold border px-2.5 py-1 rounded-md tracking-wider uppercase bg-green-500/10 border-green-500/30 text-green-400">
                  APPROVED
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-zinc-400 mt-1">
              {documentVerificationOnly
                ? 'Cross-check insurance cards and clinical supporting documents. Intake has already approved Form 01 and Form 02.'
                : 'Review the medical documentation to establish medical necessity.'}
            </p>
          </div>

          {!clinicalReviewComplete && (
            <div 
              className="relative group rounded-md" 
              title={
                !isClinicalReviewReady
                  ? 'Intake approval is required before clinical review.'
                  : !allApproved
                    ? 'Review every required item to continue.'
                    : ''
              }
            >
              <div className={`absolute -inset-0.5 rounded-md blur opacity-50 transition duration-200 ${allApproved ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`}></div>
              <Button 
                type="button"
                variant="primary" 
                onClick={() => {
                  setActionError(null);
                  setShowApproveConfirm(true);
                }}
                disabled={!allApproved || isActionPending}
                className={`relative font-bold tracking-wide border ${allApproved ? 'bg-zinc-900 text-white hover:bg-zinc-800 border-green-500/50 cursor-pointer' : 'bg-zinc-800 text-zinc-400 border-zinc-600 cursor-not-allowed'}`}
              >
                Approve Clinical Review
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-6 space-y-8">
          {isClinicalReviewReady && !clinicalReviewComplete && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400" role="status">
              Reviewed {approvedDocs.length} of {visibleKeys.length} required{' '}
              {documentVerificationOnly ? 'documents' : 'items'}. Open each{' '}
              {documentVerificationOnly ? 'document' : 'item'} and confirm it before final approval.
            </p>
          )}
          
          <div className={documentVerificationOnly ? 'space-y-3' : 'grid md:grid-cols-2 gap-8'}>
            {!documentVerificationOnly && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Required Forms</h4>
                <div className="space-y-1">
                  {renderDocumentRow({ title: 'Client Intake Form (Form 01)', dbKey: 'intakeFormComplete', isForm: true })}
                  {renderDocumentRow({ title: 'Consent & Authorization (Form 02)', dbKey: 'consentFormComplete', isForm: true })}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">
                {documentVerificationOnly ? 'Clinical Verification Checklist' : 'Document Uploads'}
              </h4>
              <div className="space-y-1">
                {requiredDocumentKeys.map((dbKey) => (
                  <Fragment key={dbKey}>
                    {renderDocumentRow({
                      title: CLINICAL_VERIFICATION_DOC_LABELS[dbKey as ClinicalVerificationDocumentKey],
                      dbKey,
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      <DocumentReviewPreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={handleCloseModal}
        title={previewDoc?.name ?? ''}
        titleId="clinical-preview-title"
        breadcrumbLabel="Clinical Verification"
        isApproved={previewDoc ? approvedDocs.includes(previewDoc.key) : false}
        toolbarCenter={
          previewDoc &&
          (previewDoc.key === 'intakeFormComplete' || previewDoc.key === 'consentFormComplete') &&
          isClinicalReviewReady &&
          previewItemAvailable ? (
            <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-white/[0.07] bg-zinc-800/80 p-1">
              <button
                type="button"
                onClick={() => setIsChangeMode(false)}
                aria-pressed={!isChangeMode}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  !isChangeMode
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Eye className="h-3 w-3" />
                View Mode
              </button>
              <button
                type="button"
                onClick={() => setIsChangeMode(true)}
                aria-pressed={isChangeMode}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  isChangeMode
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Pencil className="h-3 w-3" />
                Request Changes
              </button>
            </div>
          ) : undefined
        }
        toolbarActions={
          previewDoc ? (
            <>
              {isChangeMode && stagedRejections.length > 0 && (
                <DocumentReviewSendCorrectionsButton
                  count={stagedRejections.length}
                  disabled={isActionPending}
                  onClick={() => setShowSubmitConfirm(true)}
                />
              )}

              {!isChangeMode && isClinicalReviewReady && previewItemAvailable && !approvedDocs.includes(previewDoc.key) && (
                <>
                  {previewDoc.key !== 'intakeFormComplete' && previewDoc.key !== 'consentFormComplete' && (
                    <DocumentReviewRejectButton
                      disabled={isActionPending}
                      onClick={() => {
                        setActionError(null);
                        setRejectDoc(previewDoc);
                      }}
                    />
                  )}
                  <DocumentReviewApproveButton
                    disabled={isActionPending}
                    onClick={() => {
                      if (!previewDoc) return;
                      runAction(
                        () =>
                          approveClinicalReviewItem(
                            client.id,
                            packet.id,
                            previewDoc.key,
                          ),
                        `${previewDoc.name} approved.`,
                        () => setPreviewDoc(null),
                      );
                    }}
                  />
                </>
              )}

              {!isChangeMode && approvedDocs.includes(previewDoc.key) && (
                <DocumentReviewApprovedBadge />
              )}
            </>
          ) : undefined
        }
        changeModeBanner={
          isChangeMode ? (
            <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-orange-500/20 bg-orange-500/[0.08] px-5 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
              <p className="text-xs font-medium text-orange-300">
                Click any field to flag it for correction. A parent-facing reason is required before sending.
              </p>
            </div>
          ) : undefined
        }
      >
        {previewDoc?.key === 'intakeFormComplete' ? (
          <div className="mx-auto w-full max-w-5xl px-4 py-6">
            <Form01ClientIntake
              formData={formData}
              client={client}
              readOnly={true}
              adminReviewMode={isChangeMode}
              rejectedFields={rejectedFieldsList}
              stagedRejections={stagedRejections}
              onRejectField={handleRejectFormField}
            />
          </div>
        ) : previewDoc?.key === 'consentFormComplete' ? (
          <div className="mx-auto w-full max-w-5xl px-4 py-6">
            <Form02Consent
              formData={formData}
              client={client}
              readOnly={true}
              adminReviewMode={isChangeMode}
              rejectedFields={rejectedFieldsList}
              stagedRejections={stagedRejections}
              onRejectField={handleRejectFormField}
            />
          </div>
        ) : previewDoc ? (
          <SecureDocumentPreviewContent
            docData={getSecureDocument(
              formData[dbKeyToFormKey[previewDoc.key] || previewDoc.key],
              client.id
            )}
            previewTitle={previewDoc.name}
          />
        ) : null}
      </DocumentReviewPreviewModal>

      {/* Approve Main Clinical Review Modal */}
      <DocumentReviewStackedDialog
        isOpen={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        titleId="approve-clinical-title"
        dismissOnBackdrop={!isActionPending}
      >
        <div className="space-y-4 p-6 pr-12">
          <h3 id="approve-clinical-title" className="font-heading flex items-center text-lg font-semibold text-white">
            <CheckCircle className="mr-2 h-5 w-5 text-green-500" aria-hidden="true" /> Approve Clinical Review
          </h3>
          <p className="text-sm leading-relaxed text-zinc-400">By approving, you confirm that the diagnostic report and referrals establish medical necessity for ABA therapy.</p>
          {actionError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>}
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" autoFocus variant="secondary" disabled={isActionPending} onClick={() => setShowApproveConfirm(false)}>Cancel</Button>
            <div className="group relative rounded-md">
              <div className="absolute -inset-0.5 rounded-md bg-green-500 opacity-50 blur transition duration-200 group-hover:opacity-100" />
              <Button
                type="button"
                disabled={isActionPending}
                isLoading={isActionPending}
                variant="primary"
                className="relative cursor-pointer border border-green-500/50 bg-zinc-900 font-bold tracking-wide text-white hover:bg-zinc-800"
                onClick={() => runAction(
                  () => approveClinicalReview(client.id, {
                    verificationDocsOnly: documentVerificationOnly,
                  }),
                  'Clinical review approved. Billing can begin VOB.',
                  () => setShowApproveConfirm(false)
                )}
              >
                Confirm Approval
              </Button>
            </div>
          </div>
        </div>
      </DocumentReviewStackedDialog>

      {/* Reject Modal — portaled above preview at z-120 */}
      <DocumentReviewStackedDialog
        isOpen={Boolean(rejectDoc)}
        onClose={() => {
          if (isActionPending) return;
          setRejectDoc(null);
          setRejectReason('');
        }}
        titleId="clinical-correction-title"
        dismissOnBackdrop={!isActionPending}
      >
        {rejectDoc && (
          <div className="space-y-4 p-6 pr-12">
            <h3 id="clinical-correction-title" className="font-heading flex items-center text-lg font-semibold text-white">
              <AlertTriangle className="mr-2 h-5 w-5 text-red-500" aria-hidden="true" /> Request Correction: {rejectDoc.name}
            </h3>
            <p className="text-sm leading-relaxed text-zinc-400">This asks the family to re-upload this document only. Other approved clinical items stay approved, and the case remains on the Clinical Support queue until the new file is reviewed.</p>
            <label htmlFor="clinical-document-reason" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Correction reason
            </label>
            <textarea
              id="clinical-document-reason"
              autoFocus
              className="h-24 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 p-3 text-sm text-white outline-none transition-colors focus:border-red-500"
              placeholder="e.g. The evaluation report is missing a formal ASD diagnosis."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={1000}
              required
              aria-describedby="clinical-document-reason-help"
            />
            <p id="clinical-document-reason-help" className="text-xs text-zinc-500">
              The family will see this reason. Intake is not notified. {rejectReason.length}/1000
            </p>
            {actionError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>}
            <div className="flex justify-end space-x-3 pt-2">
              <Button type="button" variant="secondary" disabled={isActionPending} onClick={() => { setRejectDoc(null); setRejectReason(''); }}>Cancel</Button>
              <Button
                type="button"
                variant="danger"
                isLoading={isActionPending}
                disabled={rejectReason.trim().length < 5 || isActionPending}
                className={rejectReason.trim().length >= 5 ? 'cursor-pointer' : 'cursor-not-allowed'}
                onClick={() => runAction(
                  () => rejectClinicalReview(client.id, rejectDoc.key, rejectReason.trim()),
                  'Correction requested. The family was asked to re-upload this document. This case stays on Clinical Support.',
                  () => {
                    setRejectDoc(null);
                    setRejectReason('');
                    setPreviewDoc(null);
                  }
                )}
              >
                Request Correction
              </Button>
            </div>
          </div>
        )}
      </DocumentReviewStackedDialog>

      {/* Discard Confirm */}
      <DocumentReviewStackedDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        titleId="discard-clinical-title"
      >
        <div className="space-y-4 p-6 pr-12">
          <h3 id="discard-clinical-title" className="font-heading text-lg font-semibold text-white">Discard Changes?</h3>
          <p className="text-sm leading-relaxed text-zinc-400">You have {stagedRejections.length} field(s) selected for correction. Are you sure you want to discard these selections and close the form?</p>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowDiscardConfirm(false)}>Keep Editing</Button>
            <Button type="button" variant="danger" className="cursor-pointer" onClick={() => {
              setShowDiscardConfirm(false);
              setStagedRejections([]);
              setIsChangeMode(false);
              setPreviewDoc(null);
            }}>Discard & Close</Button>
          </div>
        </div>
      </DocumentReviewStackedDialog>

      {/* Submit Bulk Confirm */}
      <DocumentReviewStackedDialog
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        titleId="return-intake-title"
        dismissOnBackdrop={!isActionPending}
      >
        <div className="space-y-4 p-6 pr-12">
          <h3 id="return-intake-title" className="font-heading text-lg font-semibold text-white">Return to Intake?</h3>
          <p className="text-sm leading-relaxed text-zinc-400">You are about to wipe {stagedRejections.length} field(s) and bounce this form back to the Intake Coordinator.</p>
          <label htmlFor="clinical-field-reason" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            What must be corrected?
          </label>
          <textarea
            id="clinical-field-reason"
            autoFocus
            value={bulkRejectReason}
            onChange={(event) => setBulkRejectReason(event.target.value)}
            maxLength={1000}
            required
            placeholder="Describe the correction needed so the parent knows exactly what to update."
            className="h-28 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 p-3 text-sm text-white outline-none transition-colors focus:border-red-500"
          />
          <p className="text-xs text-zinc-500">
            Applied to all {stagedRejections.length} selected fields. {bulkRejectReason.length}/1000
          </p>
          {actionError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>}
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" disabled={isActionPending} onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isActionPending}
              disabled={bulkRejectReason.trim().length < 5 || isActionPending}
              className={bulkRejectReason.trim().length >= 5 ? 'cursor-pointer' : 'cursor-not-allowed'}
              onClick={handleBulkRejectSubmit}
            >
              Confirm & Send
            </Button>
          </div>
        </div>
      </DocumentReviewStackedDialog>

    </div>
  );
}
