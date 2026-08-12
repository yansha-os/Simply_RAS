'use client';

import React, { useState, useEffect, useSyncExternalStore, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileText, CheckCircle, AlertTriangle, X, Eye, FileCheck } from 'lucide-react';
import { approveClinicalReview, rejectClinicalReview, rejectClinicalFormFieldsBulk } from '@/app/(dashboard)/portal-case/actions/clinical';
import { Form01ClientIntake } from '@/components/magic-link/Form01ClientIntake';
import { Form02Consent } from '@/components/magic-link/Form02Consent';
import { parsePacketFormData, safeParseJson } from '@/lib/safeParseJson';

type SecureDocument = {
  url: string;
  name: string;
  size: string;
  type: string;
};

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

function isAuthorizedDocumentPath(path: string | null, clientId: string): boolean {
  if (!path) return false;
  const separatorIndex = path.indexOf('/');
  if (separatorIndex < 1 || path.slice(0, separatorIndex) !== clientId) return false;
  return /^[a-zA-Z0-9._-]{1,160}$/.test(path.slice(separatorIndex + 1));
}

function getSecureDocument(value: unknown, clientId: string): SecureDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (typeof document.url !== 'string') return null;

  const [pathname, query = ''] = document.url.split('?', 2);
  const path = new URLSearchParams(query).get('path');
  if (pathname !== '/api/documents' || !isAuthorizedDocumentPath(path, clientId)) {
    return null;
  }

  return {
    url: document.url,
    name: typeof document.name === 'string' ? document.name : 'Secure document',
    size: typeof document.size === 'string' ? document.size : '',
    type: typeof document.type === 'string' ? document.type : '',
  };
}

export default function ClinicalReviewTab({ client }: { client: ClinicalClientView }) {
  const router = useRouter();
  const packet = client.intakePacket;

  const [previewDoc, setPreviewDoc] = useState<{ key: string, name: string } | null>(null);
  const [rejectDoc, setRejectDoc] = useState<{ key: string, name: string } | null>(null);
  const [approvedDocs, setApprovedDocs] = useState<string[]>([]);

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

  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
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
      'The packet was returned for parent corrections.',
      () => {
        setPreviewDoc(null);
        setIsChangeMode(false);
        setStagedRejections([]);
        setShowSubmitConfirm(false);
        setBulkRejectReason('');
        setApprovedDocs([]);
      }
    );
  };

  const hasMedicaid = formData['hasMedicaid'] && formData['hasMedicaid'] !== 'No' && formData['hasMedicaid'] !== 'Not Sure';
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

  // Calculate required docs for approval
  const visibleKeys = [
    'intakeFormComplete',
    'consentFormComplete',
    'insuranceCardFrontUploaded',
    'insuranceCardBackUploaded',
    'diagnosticEvalUploaded',
    'physicianRxUploaded'
  ];
  if (hasMedicaid) { visibleKeys.push('medicaidCardFrontUploaded', 'medicaidCardBackUploaded'); }
  if (hasIEP) { visibleKeys.push('iepUploaded'); }
  if (hasCustodyDoc) { visibleKeys.push('custodyDocsUploaded'); }
  if (hasPriorABA) { visibleKeys.push('priorAbaRecordsUploaded'); }

  const clinicalReviewComplete = CLINICAL_COMPLETE_STATUSES.has(client.status);
  const clinicalStatusMismatch =
    (clinicalReviewComplete || client.status === 'DOCS_APPROVED_INTAKE') &&
    packet.status !== 'APPROVED';
  const isClinicalReviewReady =
    client.status === 'DOCS_APPROVED_INTAKE' && packet.status === 'APPROVED';
  const correctionEntries = Object.entries(rejectionDetails);
  const awaitingParentCorrections =
    packet.status === 'PENDING_CLIENT_SUBMISSION' && correctionEntries.length > 0;
  const awaitingParentSubmission =
    packet.status === 'PENDING_CLIENT_SUBMISSION' && correctionEntries.length === 0;
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

  const renderDocumentRow = ({ title, dbKey, isForm = false }: { title: string, dbKey: string, isForm?: boolean }) => {
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
            <span className="ml-7 mt-1 pr-4 text-xs text-red-400">
              Correction requested: {directRejection}
            </span>
          )}
        </button>
        
        <div className="flex items-center space-x-2">
          {(() => {
            if (isRejected) {
              return (
                <span className="flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
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

            if (!isAvailable) {
              return (
                <span className="flex items-center bg-zinc-500/10 text-zinc-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase">
                  MISSING
                </span>
              );
            }

            if (!isClinicalReviewReady) {
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
              <h3 className="font-heading font-semibold text-white">Awaiting parent corrections</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                This packet is back in the secure magic-link re-upload loop. Intake will review the
                resubmission before Clinical can continue.
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
              Clinical Review
              {clinicalReviewComplete && (
                <span className="text-[10px] font-bold border px-2.5 py-1 rounded-md tracking-wider uppercase bg-green-500/10 border-green-500/30 text-green-400">
                  APPROVED
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-zinc-400 mt-1">Review the medical documentation to establish medical necessity.</p>
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
              Reviewed {approvedDocs.length} of {visibleKeys.length} required items. Open each item and confirm it before final approval.
            </p>
          )}
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Required Forms</h4>
              <div className="space-y-1">
                {renderDocumentRow({ title: 'Client Intake Form (Form 01)', dbKey: 'intakeFormComplete', isForm: true })}
                {renderDocumentRow({ title: 'Consent & Authorization (Form 02)', dbKey: 'consentFormComplete', isForm: true })}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Document Uploads</h4>
              <div className="space-y-1">
                {renderDocumentRow({ title: 'Primary Insurance Card (Front)', dbKey: 'insuranceCardFrontUploaded' })}
                {renderDocumentRow({ title: 'Primary Insurance Card (Back)', dbKey: 'insuranceCardBackUploaded' })}
                
                {hasMedicaid && (
                  <>
                    {renderDocumentRow({ title: 'Medicaid Card (Front)', dbKey: 'medicaidCardFrontUploaded' })}
                    {renderDocumentRow({ title: 'Medicaid Card (Back)', dbKey: 'medicaidCardBackUploaded' })}
                  </>
                )}
                
                {renderDocumentRow({ title: 'Diagnostic Evaluation Report', dbKey: 'diagnosticEvalUploaded' })}
                {renderDocumentRow({ title: 'Physician Referral / Prescription', dbKey: 'physicianRxUploaded' })}
                
                {hasIEP && renderDocumentRow({ title: 'IEP / IFSP', dbKey: 'iepUploaded' })}
                
                {hasCustodyDoc && renderDocumentRow({ title: 'Custody/Guardianship Order', dbKey: 'custodyDocsUploaded' })}
                
                {hasPriorABA && renderDocumentRow({ title: 'Prior ABA Records', dbKey: 'priorAbaRecordsUploaded' })}
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {mounted && createPortal(
        <>
          {/* Preview Modal */}
          {previewDoc && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="clinical-preview-title"
                className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[90vh]"
              >
            <div className="flex justify-between items-center p-4 border-b border-white/10 bg-zinc-950">
              <h3 id="clinical-preview-title" className="font-semibold text-white flex items-center">
                <Eye className="w-5 h-5 mr-2 text-brand-blue-500" aria-hidden="true" />
                Preview: {previewDoc.name}
              </h3>
              
              <div className="flex items-center space-x-4">
                {(previewDoc.key === 'intakeFormComplete' || previewDoc.key === 'consentFormComplete') && isClinicalReviewReady && previewItemAvailable && (
                  <div className="flex items-center bg-white/5 rounded-lg p-1 space-x-2">
                    <button 
                      type="button"
                      onClick={() => setIsChangeMode(false)}
                      aria-pressed={!isChangeMode}
                      className={`cursor-pointer px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!isChangeMode ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                    >
                      View Mode
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsChangeMode(true)}
                      aria-pressed={isChangeMode}
                      className={`cursor-pointer px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isChangeMode ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Request Changes Mode
                    </button>
                  </div>
                )}
                
                {isChangeMode && stagedRejections.length > 0 && (
                  <Button type="button" variant="danger" disabled={isActionPending} onClick={() => setShowSubmitConfirm(true)}>
                    Send {stagedRejections.length} Request(s)
                  </Button>
                )}
                
                {!isChangeMode && isClinicalReviewReady && previewItemAvailable && !approvedDocs.includes(previewDoc.key) && (
                  <div className="flex space-x-2">
                    {previewDoc.key !== 'intakeFormComplete' && previewDoc.key !== 'consentFormComplete' && (
                      <Button type="button" variant="danger" disabled={isActionPending} onClick={() => {
                        setActionError(null);
                        setRejectDoc(previewDoc);
                      }}>
                        Request Correction
                      </Button>
                    )}
                    <div className="relative group rounded-md">
                      <div className="absolute -inset-0.5 bg-green-500 rounded-md blur opacity-50 group-hover:opacity-100 transition duration-200"></div>
                      <Button type="button" variant="primary" className="relative cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white font-bold tracking-wide border border-green-500/50" onClick={() => {
                        setApprovedDocs(prev => prev.includes(previewDoc.key) ? prev : [...prev, previewDoc.key]);
                        setPreviewDoc(null);
                      }}>
                        Approve
                      </Button>
                    </div>
                  </div>
                )}

                <div className="w-px h-6 bg-white/10 mx-2"></div>
                <button
                  type="button"
                  autoFocus
                  aria-label="Close document preview"
                  onClick={handleCloseModal}
                  className="cursor-pointer text-zinc-400 hover:text-white transition-colors p-1"
                >
                  <X className="w-6 h-6" aria-hidden="true" />
                </button>
              </div>
            </div>
            
            {isChangeMode && (
              <div className="bg-orange-500/10 border-b border-orange-500/20 p-3 text-center">
                <p className="text-orange-400 text-sm font-medium flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 mr-2" aria-hidden="true" />
                  Select fields that need correction. A specific reason is required before the packet returns to Intake.
                </p>
              </div>
            )}

            <div className="flex-1 p-8 flex items-start justify-center bg-zinc-900/50 overflow-y-auto">
              {previewDoc.key === 'intakeFormComplete' ? (
                <div className="w-full max-w-4xl">
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
              ) : previewDoc.key === 'consentFormComplete' ? (
                <div className="w-full max-w-4xl">
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
              ) : (
                (() => {
                  const formKey = dbKeyToFormKey[previewDoc.key] || previewDoc.key;
                  const docData = getSecureDocument(formData[formKey], client.id);
                  
                  if (docData) {
                    return (
                      <div className="w-full bg-white rounded-lg shadow-2xl overflow-hidden relative flex flex-col mt-4">
                        <div className="bg-zinc-100 border-b border-zinc-200 px-4 py-3 flex items-center justify-between text-zinc-600">
                          <div className="flex items-center text-sm font-medium">
                            <FileCheck className="w-4 h-4 mr-2 text-green-600" aria-hidden="true" />
                            {docData.name}
                          </div>
                          <div className="text-xs font-mono">{docData.size}</div>
                        </div>
                        <div className="bg-zinc-200 p-4 flex items-center justify-center min-h-[50vh]">
                          {docData.type === 'application/pdf' ? (
                            <iframe
                              src={docData.url}
                              title={`${previewDoc.name} PDF preview`}
                              className="w-full h-[70vh] rounded shadow-inner"
                            />
                          ) : (
                            // Authenticated, short-lived document route; intrinsic dimensions are unknown.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={docData.url} alt={docData.name} className="w-full h-auto object-contain shadow-2xl rounded" />
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="w-full max-w-4xl h-[70vh] bg-white rounded-lg shadow-2xl overflow-hidden relative flex flex-col mt-10">
                      <div className="bg-zinc-100 border-b border-zinc-200 px-4 py-3 flex items-center justify-between text-zinc-600">
                        <div className="flex items-center text-sm font-medium">
                          <AlertTriangle className="w-4 h-4 mr-2 text-orange-600" aria-hidden="true" />
                          Secure document unavailable
                        </div>
                      </div>
                      <div className="flex-1 bg-zinc-200/50 p-8 flex items-center justify-center relative">
                        <div className="max-w-md text-center text-zinc-600">
                          This upload is missing, was returned for correction, or does not use the authorized document route. It cannot be reviewed or approved.
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve Main Clinical Review Modal */}
      {showApproveConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="approve-clinical-title"
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <h3 id="approve-clinical-title" className="text-lg font-semibold text-white flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" aria-hidden="true" /> Approve Clinical Review
            </h3>
            <p className="text-sm text-zinc-400">By approving, you confirm that the diagnostic report and referrals establish medical necessity for ABA therapy.</p>
            {actionError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{actionError}</p>}
            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" autoFocus variant="secondary" disabled={isActionPending} onClick={() => setShowApproveConfirm(false)}>Cancel</Button>
              <div className="relative group rounded-md">
                <div className="absolute -inset-0.5 bg-green-500 rounded-md blur opacity-50 group-hover:opacity-100 transition duration-200"></div>
                <Button
                  type="button"
                  disabled={isActionPending}
                  isLoading={isActionPending}
                  variant="primary"
                  className="relative cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white font-bold tracking-wide border border-green-500/50"
                  onClick={() => runAction(
                    () => approveClinicalReview(client.id),
                    'Clinical review approved. Billing can begin VOB.',
                    () => setShowApproveConfirm(false)
                  )}
                >
                  Confirm Approval
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectDoc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clinical-correction-title"
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <h3 id="clinical-correction-title" className="text-lg font-semibold text-white flex items-center"><AlertTriangle className="w-5 h-5 mr-2 text-red-500" aria-hidden="true" /> Request Correction: {rejectDoc.name}</h3>
              <p className="text-sm text-zinc-400">This returns the packet to the Intake queue so the coordinator can help the parent provide the correct clinical documents.</p>
              <label htmlFor="clinical-document-reason" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Correction reason
              </label>
              <textarea 
                id="clinical-document-reason"
                autoFocus
                className="w-full text-sm border border-white/10 p-3 rounded-lg bg-zinc-950 text-white focus:border-red-500 outline-none transition-colors h-24 resize-none"
                placeholder="e.g. The evaluation report is missing a formal ASD diagnosis."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={1000}
                required
                aria-describedby="clinical-document-reason-help"
              />
              <p id="clinical-document-reason-help" className="text-xs text-zinc-500">
                The parent and Intake team will see this reason. {rejectReason.length}/1000
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
                    'The document was returned for parent correction.',
                    () => {
                      setRejectDoc(null);
                      setRejectReason('');
                      setPreviewDoc(null);
                      setApprovedDocs([]);
                    }
                  )}
                >
                  Return to Intake
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discard Confirm */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div role="dialog" aria-modal="true" aria-labelledby="discard-clinical-title" className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 id="discard-clinical-title" className="text-lg font-semibold text-white">Discard Changes?</h3>
              <p className="text-sm text-zinc-400">You have {stagedRejections.length} field(s) selected for correction. Are you sure you want to discard these selections and close the form?</p>
              <div className="flex justify-end space-x-3 pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowDiscardConfirm(false)}>Keep Editing</Button>
                <Button type="button" variant="danger" onClick={() => {
                  setShowDiscardConfirm(false);
                  setStagedRejections([]);
                  setIsChangeMode(false);
                  setPreviewDoc(null);
                }}>Discard & Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Bulk Confirm */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div role="dialog" aria-modal="true" aria-labelledby="return-intake-title" className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 id="return-intake-title" className="text-lg font-semibold text-white">Return to Intake?</h3>
              <p className="text-sm text-zinc-400">You are about to wipe {stagedRejections.length} field(s) and bounce this form back to the Intake Coordinator.</p>
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
          </div>
        </div>
      )}
      </>,
      document.body
    )}

    </div>
  );
}
