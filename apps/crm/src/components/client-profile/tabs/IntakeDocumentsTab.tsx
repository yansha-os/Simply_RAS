'use client';

import React, { useState, useEffect, useSyncExternalStore, useTransition } from 'react';
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
import { Link as LinkIcon, FileText, CheckCircle, AlertTriangle, X, Check, Eye, LockOpen, Pencil } from 'lucide-react';
import { getSecureDocument } from '@/lib/secureDocument';
import { generateMagicLink, sendToClinical, approveDocument, rejectDocument, rejectFormFieldsBulk, regenerateMagicLink, unlockPacket } from '@/app/(dashboard)/portal-case/actions';
import { Form01ClientIntake } from '@/components/magic-link/Form01ClientIntake';
import { Form02Consent } from '@/components/magic-link/Form02Consent';
import { parsePacketFormData, safeParseJson } from '@/lib/safeParseJson';

type IntakePacketView = {
  id: string;
  status: string;
  magicLinkToken?: string | null;
  formData?: unknown;
  rejectionDetails?: unknown;
  clientChangeRequested?: boolean;
  clientChangeNotes?: string | null;
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

type IntakeClientView = {
  id: string;
  status: string;
  intakePacket: IntakePacketView | null;
  [key: string]: unknown;
};

const subscribeToHydration = () => () => {};

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

const INTAKE_COMPLETE_STATUSES = new Set([
  'DOCS_APPROVED_INTAKE',
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

export default function IntakeDocumentsTab({
  client,
  isCaseCoordMode,
}: {
  client: IntakeClientView;
  isCaseCoordMode?: boolean;
}) {
  const router = useRouter();
  const packet = client.intakePacket;
  const hasPacket = !!packet;

  const [previewDoc, setPreviewDoc] = useState<{ key: string, name: string } | null>(null);
  const [approveDoc, setApproveDoc] = useState<{ key: string, name: string } | null>(null);
  const [rejectDoc, setRejectDoc] = useState<{ key: string, name: string } | null>(null);

  // Staged rejection states
  const [isChangeMode, setIsChangeMode] = useState(false);
  const [stagedRejections, setStagedRejections] = useState<string[]>([]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showSendClinicalConfirm, setShowSendClinicalConfirm] = useState(false);
  const [isActionPending, startActionTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState('');
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [approvedDocs, setApprovedDocs] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
  useEffect(() => {
    const hasOpenDialog = Boolean(
      previewDoc ||
      approveDoc ||
      rejectDoc ||
      showDiscardConfirm ||
      showSubmitConfirm ||
      showApproveConfirm ||
      showSendClinicalConfirm
    );
    if (!hasOpenDialog) return;

    const closeTopDialog = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isActionPending) return;
      event.preventDefault();

      if (showSubmitConfirm) return setShowSubmitConfirm(false);
      if (showDiscardConfirm) return setShowDiscardConfirm(false);
      if (showSendClinicalConfirm) return setShowSendClinicalConfirm(false);
      if (showApproveConfirm) return setShowApproveConfirm(false);
      if (rejectDoc) {
        setRejectDoc(null);
        setRejectReason('');
        return;
      }
      if (approveDoc) return setApproveDoc(null);
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
    approveDoc,
    isActionPending,
    previewDoc,
    rejectDoc,
    showApproveConfirm,
    showDiscardConfirm,
    showSendClinicalConfirm,
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

  const rejectionDetails = parseRejectionDetails(packet?.rejectionDetails);
  const formData = parsePacketFormData(packet?.formData);

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
    if (!packet) {
      setActionError('The intake packet is no longer available. Refresh and try again.');
      return;
    }
    const reason = bulkRejectReason.trim();
    if (reason.length < 5) {
      setActionError('Provide a specific correction reason (at least 5 characters).');
      return;
    }

    const fields = stagedRejections.map(fieldId => ({ fieldId, reason }));
    runAction(
      () => rejectFormFieldsBulk(packet.id, client.id, fields),
      'The selected fields were returned for parent correction.',
      () => {
        setPreviewDoc(null);
        setIsChangeMode(false);
        setStagedRejections([]);
        setShowSubmitConfirm(false);
        setBulkRejectReason('');
        // Do NOT wipe approvedDocs here — field-level rejections on one form
        // do not un-approve other documents. router.refresh() will re-derive
        // the correct state from the updated packet after the action completes.
      }
    );
  };

  const medicaidValue = formData['hasMedicaid'];
  const hasMedicaid =
    typeof medicaidValue === 'string' &&
    medicaidValue !== 'No' &&
    medicaidValue !== 'Not Sure';
  const hasCustodyDoc = formData['custodyDocAttached'] === 'Yes — Attached' || formData['custodyDocAttached'] === 'Yes — Will Provide';
  const hasIEP = formData['hasIEP'] === 'Yes — Attached' || formData['hasIEP'] === 'Yes — Will Provide';
  const hasPriorABA = formData['hasPriorABA'] === 'Yes';

  const dbKeyToFormKey: Record<string, string> = {
    insuranceCardFrontUploaded: 'docInsuranceFront',
    insuranceCardBackUploaded: 'docInsuranceBack',
    medicaidCardFrontUploaded: 'docMedicaidFront',
    medicaidCardBackUploaded: 'docMedicaidBack',
    diagnosticEvalUploaded: 'docEval',
    physicianRxUploaded: 'docReferral',
    iepUploaded: 'docIEP',
    custodyDocsUploaded: 'docCustody',
    priorAbaRecordsUploaded: 'docPriorABA'
  };

  const visibleKeys = [
    'intakeFormComplete',
    'consentFormComplete',
    'insuranceCardFrontUploaded',
    'insuranceCardBackUploaded',
    'diagnosticEvalUploaded',
    'physicianRxUploaded',
  ];
  if (hasMedicaid) visibleKeys.push('medicaidCardFrontUploaded', 'medicaidCardBackUploaded');
  if (hasIEP) visibleKeys.push('iepUploaded');
  if (hasCustodyDoc) visibleKeys.push('custodyDocsUploaded');
  if (hasPriorABA) visibleKeys.push('priorAbaRecordsUploaded');

  const intakeReviewComplete = INTAKE_COMPLETE_STATUSES.has(client.status);
  const intakeStatusMismatch =
    Boolean(packet) && (packet?.status === 'APPROVED') !== intakeReviewComplete;
  const isIntakeReviewReady =
    packet?.status === 'SUBMITTED' && client.status === 'DOCS_SUBMITTED';
  const awaitingParentCorrections =
    packet?.status === 'PENDING_CLIENT_SUBMISSION' &&
    Object.keys(rejectionDetails).length > 0;
  const legacyRejectedPacket =
    packet?.status === 'REJECTED_BY_INTAKE' ||
    packet?.status === 'REJECTED_BY_CLINICAL';
  const allApproved =
    intakeReviewComplete ||
    (isIntakeReviewReady && visibleKeys.every((key) => approvedDocs.includes(key)));
  const correctionEntries = Object.entries(rejectionDetails);
  const magicLinkToken =
    typeof packet?.magicLinkToken === 'string' ? packet.magicLinkToken : '';
  const magicLinkUrl = magicLinkToken
    ? `${mounted ? window.location.origin : ''}/magic-link/${magicLinkToken}`
    : '';

  const renderDocumentRow = ({ title, dbKey, isComplete, isForm = false }: { title: string, dbKey: string, isComplete: boolean, isForm?: boolean }) => {
    const directRejection = rejectionDetails[dbKey];
    const hasFormRejection = isForm && Object.keys(rejectionDetails).some((key) => {
      if (!key.startsWith('formField_')) return false;
      const fieldId = key.slice('formField_'.length);
      const isForm02 = dbKey === 'consentFormComplete';
      return isForm02 ? FORM_02_FIELD_KEYS.has(fieldId) : !FORM_02_FIELD_KEYS.has(fieldId);
    });
    const isRejected = Boolean(directRejection || hasFormRejection);
    const document = isForm
      ? null
      : getSecureDocument(formData[dbKeyToFormKey[dbKey]], client.id);
    const isAvailable = isForm ? Boolean(isComplete) : Boolean(document);
    const isApprovedLocally = approvedDocs.includes(dbKey) || intakeReviewComplete;
    
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
            <span className="text-xs text-red-400 ml-7 mt-1 break-words pr-4">Correction requested: {directRejection}</span>
          )}
        </button>
        
        <div className="flex items-center space-x-2">
          {(() => {
            if (isRejected) {
              return (
                <span className="flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-red-500/10 text-red-500 border border-red-500/30">
                  CHANGES NEEDED
                </span>
              );
            }

            if (isApprovedLocally) {
              return (
                <span className="flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wider bg-green-500/10 text-green-400">
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> APPROVED
                </span>
              );
            }

            if (isIntakeReviewReady && isAvailable) {
              return (
                <>
                  <span className="flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[rgba(255,122,69,0.15)] text-[var(--dawn-hot)] border border-[rgba(255,122,69,0.3)]">
                    REVIEW NEEDED
                  </span>
                  {!isForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setRejectDoc({ key: dbKey, name: title });
                      }}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer hover:scale-110 active:scale-95"
                      aria-label={`Request correction for ${title}`}
                      title="Request correction"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setApproveDoc({ key: dbKey, name: title });
                    }}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-green-400 hover:bg-green-500/10 transition-all cursor-pointer hover:scale-110 active:scale-95"
                    aria-label={`Approve ${title}`}
                    title="Approve item"
                  >
                    <Check className="w-4 h-4" aria-hidden="true" />
                  </button>
                </>
              );
            }

            if (packet?.status === 'PENDING_CLIENT_SUBMISSION') {
              return (
                <span className="flex items-center bg-zinc-500/10 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase">
                  PENDING UPLOAD
                </span>
              );
            }

            if (isForm) {
              return (
                <span className="flex items-center bg-zinc-500/10 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase">
                  {isAvailable ? 'AWAITING REVIEW' : 'NOT STARTED'}
                </span>
              );
            }

            return (
              <span className="flex items-center bg-zinc-500/10 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase">
                {isAvailable ? 'AWAITING REVIEW' : 'MISSING'}
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
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}
      {actionMessage && (
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
          <span>{actionMessage}</span>
        </div>
      )}

      {awaitingParentCorrections && (
        <div className="rounded-2xl border border-red-500/25 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_55%)] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
            <div>
              <h3 className="font-heading font-semibold text-white">Waiting for parent re-upload</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                The secure packet is unlocked only for the requested corrections. After the parent resubmits,
                this card returns to Review Needed before it can move to Clinical.
              </p>
              {correctionEntries.length > 0 && (
                <ul className="mt-3 space-y-2" aria-label="Requested corrections">
                  {correctionEntries.map(([key, reason]) => (
                    <li key={key} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-red-200">
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {intakeStatusMismatch && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
          The packet and client pipeline statuses do not agree. Do not advance this case until Intake verifies the canonical
          transition from Submitted to Intake Approved.
        </div>
      )}

      {legacyRejectedPacket && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
          This packet uses a legacy rejected status and cannot be resubmitted through the active parent correction loop.
          Reset it to Pending Client Submission before asking the parent to re-upload.
        </div>
      )}
      
      {packet?.clientChangeRequested && (
        <div className="bg-brand-orange-500/10 border-l-4 border-brand-orange-500 p-4 rounded-r-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center text-brand-orange-500 font-bold mb-1">
                <AlertTriangle className="w-5 h-5 mr-2" aria-hidden="true" />
                Client Requested Access to Make Changes
              </div>
              <p className="text-zinc-300 text-sm">
                <span className="font-semibold text-white">Client Note:</span> {packet.clientChangeNotes}
              </p>
            </div>
            <Button
              type="button"
              disabled={isActionPending}
              isLoading={isActionPending}
              onClick={() => runAction(
                () => unlockPacket(packet.id, client.id),
                'The parent packet is unlocked for corrections.'
              )}
              variant="secondary"
              className="cursor-pointer bg-brand-orange-500/20 text-brand-orange-400 hover:bg-brand-orange-500/30 border border-brand-orange-500/50"
            >
              <LockOpen className="w-4 h-4 mr-2" aria-hidden="true" /> Unlock Packet
            </Button>
          </div>
        </div>
      )}

      {/* Approve Modal & Regeneration UI */}
      {!hasPacket && (
        <Card className="overflow-hidden border-dashed border-white/10 bg-zinc-950/70">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center" role="status">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-blue-500/20 bg-brand-blue-500/10">
              <LinkIcon className="h-7 w-7 text-brand-blue-400" aria-hidden="true" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-white">No intake packet yet</h3>
            <p className="text-sm leading-6 text-zinc-400 max-w-md mt-2 mb-6">
              Generate a secure magic link for the parent to complete the two required forms and upload the required documents.
            </p>
            <Button
              type="button"
              variant="primary"
              isLoading={isActionPending}
              disabled={isActionPending}
              className="cursor-pointer"
              onClick={() => {
                runAction(
                  () => generateMagicLink(client.id),
                  'Secure parent link generated.'
                );
              }}
            >
              Generate Magic Link
            </Button>
          </CardContent>
        </Card>
      )}

      {hasPacket && (
        <Card className="border-white/10 shadow-sm w-full">
          <CardHeader className="pb-4 border-b border-white/5 flex flex-row justify-between items-center">
            <div>
              <CardTitle className="text-lg text-white flex items-center gap-3">
                Client Submissions
                {(() => {
                  let text = packet.status.replace(/_/g, ' ');
                  let colorClass = "bg-zinc-800 border-zinc-700 text-zinc-300";
                  if (packet.status === 'PENDING_CLIENT_SUBMISSION') {
                    if (Object.keys(rejectionDetails).length > 0 || client.status === 'DOCS_SUBMITTED') {
                      text = 'CHANGES NEEDED';
                      colorClass = "bg-red-500/10 border-red-500/30 text-red-500";
                    } else {
                      text = 'PENDING CLIENT SUBMISSION';
                    }
                  } else if (packet.status === 'SUBMITTED') {
                    if (allApproved) {
                      text = 'READY FOR CLINICAL';
                      colorClass = "bg-green-500/10 border-green-500/30 text-green-400";
                    } else {
                      text = 'REVIEW NEEDED';
                      colorClass = "bg-[rgba(255,122,69,0.15)] border-[rgba(255,122,69,0.3)] text-[var(--dawn-hot)]";
                    }
                  }
                  return (
                    <span className={`text-[10px] font-bold border px-2.5 py-1 rounded-md tracking-wider uppercase ${colorClass}`}>
                      {text}
                    </span>
                  );
                })()}
              </CardTitle>
              <p className="text-sm text-zinc-400 mt-1">Review and approve each document below.</p>
            </div>
            {!intakeReviewComplete && (
              <div
                className="relative group rounded-md"
                title={!isIntakeReviewReady ? 'Wait for the parent to submit the packet.' : !allApproved ? 'Review every required item first.' : ''}
              >
                <div className={`absolute -inset-0.5 rounded-md blur opacity-40 ${allApproved ? 'bg-green-500' : 'bg-zinc-700'}`} />
                <Button
                  type="button"
                  variant="primary"
                  disabled={!allApproved || isActionPending}
                  className={`relative border font-bold ${allApproved ? 'cursor-pointer border-green-500/50 bg-zinc-900 text-white hover:bg-zinc-800' : 'cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-500'}`}
                  onClick={() => {
                    setActionError(null);
                    setShowSendClinicalConfirm(true);
                  }}
                >
                  Send to Clinical
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            {isIntakeReviewReady && !intakeReviewComplete && (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400" role="status">
                Reviewed {approvedDocs.length} of {visibleKeys.length} required items. Open each item and confirm it before sending the packet to Clinical.
              </p>
            )}
            
            {/* Magic Link Display */}
            {!isCaseCoordMode && (
              <div className="bg-zinc-900 border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-orange-500/30 transition-colors">
                <div>
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Secure Parent Link</h4>
                  <p className="text-sm font-mono text-zinc-300 break-all select-all">
                    {magicLinkUrl || 'Link unavailable — regenerate to create a new token.'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {!intakeReviewComplete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isActionPending}
                      className="cursor-pointer text-zinc-400 hover:text-white"
                      onClick={() => {
                        runAction(
                          () => regenerateMagicLink(client.id, packet.id),
                          'The parent link was regenerated.'
                        );
                      }}
                    >
                      Regenerate
                    </Button>
                  )}
                  <Button 
                    type="button"
                    variant="secondary" 
                    size="sm" 
                    disabled={!magicLinkUrl}
                    className={magicLinkUrl ? 'shrink-0 cursor-pointer' : 'shrink-0 cursor-not-allowed'}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(magicLinkUrl);
                        setCopiedLink(true);
                        setActionError(null);
                        setActionMessage('Secure parent link copied.');
                        window.setTimeout(() => setCopiedLink(false), 2000);
                      } catch {
                        setActionError('The link could not be copied. Select it and copy it manually.');
                      }
                    }}
                  >
                    {copiedLink ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Required Forms</h4>
                <div className="space-y-1">
                  {renderDocumentRow({ title: 'Client Intake Form (Form 01)', dbKey: 'intakeFormComplete', isComplete: packet.intakeFormComplete, isForm: true })}
                  {renderDocumentRow({ title: 'Consent & Authorization (Form 02)', dbKey: 'consentFormComplete', isComplete: packet.consentFormComplete, isForm: true })}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Document Uploads</h4>
                <div className="space-y-1">
                  {renderDocumentRow({ title: 'Primary Insurance Card (Front)', dbKey: 'insuranceCardFrontUploaded', isComplete: packet.insuranceCardFrontUploaded })}
                  {renderDocumentRow({ title: 'Primary Insurance Card (Back)', dbKey: 'insuranceCardBackUploaded', isComplete: packet.insuranceCardBackUploaded })}
                  
                  {hasMedicaid && (
                    <>
                      {renderDocumentRow({ title: 'Medicaid Card (Front)', dbKey: 'medicaidCardFrontUploaded', isComplete: packet.medicaidCardFrontUploaded })}
                      {renderDocumentRow({ title: 'Medicaid Card (Back)', dbKey: 'medicaidCardBackUploaded', isComplete: packet.medicaidCardBackUploaded })}
                    </>
                  )}
                  
                  {renderDocumentRow({ title: 'Diagnostic Evaluation Report', dbKey: 'diagnosticEvalUploaded', isComplete: packet.diagnosticEvalUploaded })}
                  {renderDocumentRow({ title: 'Physician Referral / Prescription', dbKey: 'physicianRxUploaded', isComplete: packet.physicianRxUploaded })}
                  
                  {hasIEP && renderDocumentRow({ title: 'IEP / IFSP', dbKey: 'iepUploaded', isComplete: packet.iepUploaded })}
                  
                  {hasCustodyDoc && renderDocumentRow({ title: 'Custody/Guardianship Order', dbKey: 'custodyDocsUploaded', isComplete: packet.custodyDocsUploaded })}
                  
                  {hasPriorABA && renderDocumentRow({ title: 'Prior ABA Records', dbKey: 'priorAbaRecordsUploaded', isComplete: packet.priorAbaRecordsUploaded })}
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      <DocumentReviewPreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={handleCloseModal}
        title={previewDoc?.name ?? ''}
        titleId="intake-preview-title"
        isApproved={previewDoc ? approvedDocs.includes(previewDoc.key) : false}
        toolbarCenter={
          previewDoc &&
          (previewDoc.key === 'intakeFormComplete' || previewDoc.key === 'consentFormComplete') &&
          isIntakeReviewReady &&
          Boolean(packet?.[previewDoc.key]) ? (
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

              {!isChangeMode && isIntakeReviewReady && !approvedDocs.includes(previewDoc.key) && (
                <>
                  {previewDoc.key !== 'intakeFormComplete' && previewDoc.key !== 'consentFormComplete' && (
                    <DocumentReviewRejectButton
                      disabled={isActionPending}
                      onClick={() => setRejectDoc(previewDoc)}
                    />
                  )}
                  <DocumentReviewApproveButton onClick={() => setShowApproveConfirm(true)} />
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

      <DocumentReviewStackedDialog
        isOpen={Boolean(approveDoc && packet)}
        onClose={() => setApproveDoc(null)}
        titleId="approve-intake-item-title"
        dismissOnBackdrop={!isActionPending}
      >
        {approveDoc && packet && (
          <div className="space-y-4 p-6 pr-12">
            <h3 id="approve-intake-item-title" className="font-heading text-lg font-semibold text-white">Approve {approveDoc.name}?</h3>
            <p className="text-sm leading-relaxed text-zinc-400">Are you sure this document meets all compliance standards?</p>
            {actionError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>}
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="secondary" disabled={isActionPending} onClick={() => setApproveDoc(null)}>Cancel</Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isActionPending}
                disabled={isActionPending}
                className="cursor-pointer"
                onClick={() => runAction(
                  () => approveDocument(packet.id, approveDoc.key, client.id),
                  `${approveDoc.name} approved.`,
                  () => {
                    setApprovedDocs((previous) => previous.includes(approveDoc.key) ? previous : [...previous, approveDoc.key]);
                    setApproveDoc(null);
                    setPreviewDoc(null);
                  }
                )}
              >
                Confirm Approval
              </Button>
            </div>
          </div>
        )}
      </DocumentReviewStackedDialog>

      <DocumentReviewStackedDialog
        isOpen={Boolean(rejectDoc && packet)}
        onClose={() => {
          if (isActionPending) return;
          setRejectDoc(null);
          setRejectReason('');
        }}
        titleId="reject-intake-item-title"
        dismissOnBackdrop={!isActionPending}
      >
        {rejectDoc && packet && (
          <div className="space-y-4 p-6 pr-12">
            <h3 id="reject-intake-item-title" className="font-heading flex items-center text-lg font-semibold text-white">
              <AlertTriangle className="mr-2 h-5 w-5 text-red-500" aria-hidden="true" /> Request correction: {rejectDoc.name}
            </h3>
            <p className="text-sm leading-relaxed text-zinc-400">Why is this rejected? What needs to change? (The client will see this message).</p>
            <label htmlFor="intake-document-reason" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Correction reason
            </label>
            <textarea
              id="intake-document-reason"
              autoFocus
              className="h-24 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 p-3 text-sm text-white outline-none transition-colors focus:border-red-500"
              placeholder="e.g. The insurance card is too blurry to read the Member ID."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={1000}
              required
              aria-describedby="intake-document-reason-help"
            />
            <p id="intake-document-reason-help" className="text-xs text-zinc-500">
              The parent will see this reason. {rejectReason.length}/1000
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
                  () => rejectDocument(packet.id, rejectDoc.key, client.id, rejectReason.trim()),
                  'The document was returned for parent correction.',
                  () => {
                    setRejectDoc(null);
                    setRejectReason('');
                    setPreviewDoc(null);
                    setApprovedDocs([]);
                  }
                )}
              >
                Request Correction
              </Button>
            </div>
          </div>
        )}
      </DocumentReviewStackedDialog>

      <DocumentReviewStackedDialog
        isOpen={Boolean(showApproveConfirm && previewDoc && packet)}
        onClose={() => setShowApproveConfirm(false)}
        titleId="approve-intake-preview-title"
        dismissOnBackdrop={!isActionPending}
      >
        {showApproveConfirm && previewDoc && packet && (
          <div className="space-y-4 p-6 pr-12">
            <h3 id="approve-intake-preview-title" className="font-heading text-lg font-semibold text-white">Approve {previewDoc.name}?</h3>
            <p className="text-sm leading-relaxed text-zinc-400">Are you sure this form meets all compliance standards?</p>
            {actionError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>}
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="secondary" disabled={isActionPending} onClick={() => setShowApproveConfirm(false)}>Cancel</Button>
              <div className="group relative rounded-md">
                <div className="absolute -inset-0.5 rounded-md bg-green-500 opacity-50 blur transition duration-200 group-hover:opacity-100" />
                <Button
                  type="button"
                  variant="primary"
                  isLoading={isActionPending}
                  disabled={isActionPending}
                  className="relative cursor-pointer border border-green-500/50 bg-zinc-900 font-bold tracking-wide text-white hover:bg-zinc-800"
                  onClick={() => runAction(
                    () => approveDocument(packet.id, previewDoc.key, client.id),
                    `${previewDoc.name} approved.`,
                    () => {
                      setApprovedDocs((previous) => previous.includes(previewDoc.key) ? previous : [...previous, previewDoc.key]);
                      setShowApproveConfirm(false);
                      setPreviewDoc(null);
                    }
                  )}
                >
                  Confirm Approval
                </Button>
              </div>
            </div>
          </div>
        )}
      </DocumentReviewStackedDialog>

      <DocumentReviewStackedDialog
        isOpen={Boolean(showSendClinicalConfirm && packet)}
        onClose={() => setShowSendClinicalConfirm(false)}
        titleId="send-clinical-title"
        dismissOnBackdrop={!isActionPending}
      >
        {showSendClinicalConfirm && packet && (
          <div className="space-y-4 p-6 pr-12">
            <h3 id="send-clinical-title" className="font-heading flex items-center text-lg font-semibold text-white">
              <CheckCircle className="mr-2 h-5 w-5 text-green-400" aria-hidden="true" />
              Approve packet and send to Clinical?
            </h3>
            <p className="text-sm leading-relaxed text-zinc-400">
              This confirms Intake reviewed every required form and upload. The canonical client status will advance to Intake Approved.
            </p>
            {actionError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" autoFocus variant="secondary" disabled={isActionPending} onClick={() => setShowSendClinicalConfirm(false)}>Cancel</Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isActionPending}
                disabled={!allApproved || isActionPending}
                className="cursor-pointer border border-green-500/50 bg-zinc-950"
                onClick={() => {
                  runAction(
                    () => sendToClinical(client.id, packet.id),
                    'Packet approved and sent to Clinical.',
                    () => setShowSendClinicalConfirm(false)
                  );
                }}
              >
                Confirm & Send
              </Button>
            </div>
          </div>
        )}
      </DocumentReviewStackedDialog>

      <DocumentReviewStackedDialog
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        titleId="discard-intake-title"
      >
        <div className="space-y-4 p-6 pr-12">
          <h3 id="discard-intake-title" className="font-heading text-lg font-semibold text-white">Discard Changes?</h3>
          <p className="text-sm leading-relaxed text-zinc-400">You have {stagedRejections.length} field(s) selected for rejection. Are you sure you want to discard these selections and close the form?</p>
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

      <DocumentReviewStackedDialog
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        titleId="submit-intake-corrections-title"
        dismissOnBackdrop={!isActionPending}
      >
        <div className="space-y-4 p-6 pr-12">
          <h3 id="submit-intake-corrections-title" className="font-heading text-lg font-semibold text-white">Send Changes Requested?</h3>
          <p className="text-sm leading-relaxed text-zinc-400">You are about to wipe {stagedRejections.length} field(s) and bounce this form back to the client. The client will be notified to correct the wiped fields.</p>
          <label htmlFor="intake-field-reason" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            What must be corrected?
          </label>
          <textarea
            id="intake-field-reason"
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
