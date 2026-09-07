'use client';

import React, { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  DownloadCloud,
  Eye,
  FileCheck,
  FileText,
  Loader2,
  PhoneCall,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  approvePaRequest,
  approveTreatmentPaRequest,
  completeVobAndCreds,
  denyPaRequest,
  submitPaRequest,
  submitTreatmentPaRequest,
} from '@/app/(dashboard)/portal-case/actions/billing';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import AuthUnitsPanel from '@/components/client-profile/tabs/AuthUnitsPanel';
import AuthUnitsLedgerPanel from '@/components/client-profile/tabs/AuthUnitsLedgerPanel';
import ReAuthT45Banner from '@/components/client-profile/tabs/ReAuthT45Banner';
import WeeklyBillableUnitGrid from '@/components/client-profile/tabs/WeeklyBillableUnitGrid';
import { canonicalDocumentReference } from '@/lib/documentReference';
import { DocumentPreviewModal } from '@/components/client-profile/DocumentPreviewModal';

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type BillingActionResult = { success: boolean; error?: string };
type ApprovalKind = 'ASSESSMENT' | 'TREATMENT';

export type BillingAuthSection = 'vob' | 'assessment_pa' | 'treatment_pa' | 'auth_units';

type PaRequestView = {
  id: string;
  type: string;
  status: string;
  vobCompleted?: boolean | null;
  providerCredentialed?: boolean | null;
  p2pResolved?: boolean | null;
  p2pNotes?: string | null;
  authNumber?: string | null;
  approvedUnits?: number | null;
  effectiveDate?: string | Date | null;
  expirationDate?: string | Date | null;
};

type BillingClient = {
  id: string;
  status: string;
  firstName?: string;
  lastName?: string;
  intakePacket?: {
    formData?: unknown;
    diagnosticEvalUploaded?: boolean | null;
    physicianRxUploaded?: boolean | null;
  } | null;
  paRequests?: PaRequestView[] | null;
};

function parseFormData(value: unknown): Record<string, unknown> {
  let parsed = value;
  try {
    // Some legacy packets were double-encoded. Decode at most twice.
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

function displayText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatAuthDate(value: unknown): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    // PA dates are calendar dates stored at UTC midnight.
    timeZone: 'UTC',
  });
}

function formatUnits(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US')
    : '—';
}

function approvalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function StepCircle({
  active,
  completed,
  number,
}: {
  active: boolean;
  completed: boolean;
  number: number;
}) {
  return (
    <div
      className={`z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
        completed
          ? 'bg-green-500 text-white'
          : active
            ? 'bg-brand-blue-500 text-white shadow-[0_0_15px_rgba(42,133,255,0.4)]'
            : 'border border-white/10 bg-zinc-800 text-zinc-500'
      }`}
    >
      {completed ? <Check className="h-5 w-5" /> : number}
    </div>
  );
}

export default function BillingAuthTab({
  client,
  section,
}: {
  client: BillingClient;
  section?: BillingAuthSection;
}) {
  const paRequest = client.paRequests?.find((pa) => pa.type === 'ASSESSMENT');
  const hasVob = Boolean(paRequest?.vobCompleted);
  const hasCred = Boolean(paRequest?.providerCredentialed);
  const preChecksComplete = hasVob && hasCred;
  const formData = parseFormData(client.intakePacket?.formData);
  const paStatus = paRequest?.status || 'NOT_STARTED';

  const [vobChecked, setVobChecked] = useState(hasVob);
  const [credChecked, setCredChecked] = useState(hasCred);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [showTxDenyModal, setShowTxDenyModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showTxApproveModal, setShowTxApproveModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [authRefreshKey, setAuthRefreshKey] = useState(0);
  
  const [paSubmittedConfirm, setPaSubmittedConfirm] = useState(false);
  
  const [isPending, startTransition] = useTransition();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );

  const txPaRequest = client.paRequests?.find((pa) => pa.type === 'TREATMENT');
  const txPaStatus = txPaRequest?.status || 'NOT_STARTED';
  const showTxPa = [
    'REPORT_ASSEMBLED',
    'TX_PA_SUBMITTED',
    'TX_PA_APPROVED',
    'STAFFING_PENDING',
    'ACTIVE',
    'DISCHARGED',
  ].includes(client.status);
  const isTxPaSubmitted = ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL', 'APPROVED'].includes(txPaStatus);

  // Form state for Approval
  const [authNumber, setAuthNumber] = useState('');
  const [units, setUnits] = useState('');
  const [effective, setEffective] = useState('');
  const [expiration, setExpiration] = useState('');
  
  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<{ key: string, name: string } | null>(null);
  
  // Collapse state for Assessment PA
  const [isAssessmentExpanded, setIsAssessmentExpanded] = useState(paStatus !== 'APPROVED');
  const [txSubmitConfirmed, setTxSubmitConfirmed] = useState(false);

  const insurancePayer = displayText(formData.insurancePayer);
  const memberId = displayText(formData.insuranceMemberId);
  const hasMedicaid = formData.hasMedicaid === 'Yes' || formData.hasMedicaid === true;
  const medicaidId = displayText(formData.medicaidId);
  const insuranceFrontUrl = canonicalDocumentReference(formData.docInsuranceFront, client.id);
  const insuranceBackUrl = canonicalDocumentReference(formData.docInsuranceBack, client.id);
  const medicaidFrontUrl = canonicalDocumentReference(formData.docMedicaidFront, client.id);
  const medicaidBackUrl = canonicalDocumentReference(formData.docMedicaidBack, client.id);
  const evalUrl = canonicalDocumentReference(formData.docEval, client.id);
  const referralUrl = canonicalDocumentReference(formData.docReferral, client.id);
  const previewValue = previewDoc ? formData[previewDoc.key] : null;
  const previewUrl = canonicalDocumentReference(previewValue, client.id);

  const isPaSubmitted = ['SUBMITTED', 'DENIED_CLERICAL', 'DENIED_CLINICAL', 'APPROVED'].includes(paStatus);

  const showAll = !section;
  const vobOnly = section === 'vob';
  const assessmentOnly = section === 'assessment_pa';
  const showVobSection = showAll || vobOnly;
  const showAssessmentPaSection = showAll || assessmentOnly;
  const showTreatmentPaSection = showAll || section === 'treatment_pa';
  const showAuthUnitsSection = showAll || section === 'auth_units';
  const showInsuranceSnapshot = showVobSection;
  const showAssessmentVobStep = showVobSection;
  const showAssessmentSubmitSteps = showAssessmentPaSection;
  const evalOnFile =
    Boolean(evalUrl) || Boolean(client.intakePacket?.diagnosticEvalUploaded);
  const referralOnFile =
    Boolean(referralUrl) || Boolean(client.intakePacket?.physicianRxUploaded);
  const documentsPresent = evalOnFile && referralOnFile;

  useEffect(() => {
    if (!mounted) return;
    const open =
      showDenyModal || showTxDenyModal || showApproveModal || showTxApproveModal;
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isPending) return;
      setShowDenyModal(false);
      setShowTxDenyModal(false);
      setShowApproveModal(false);
      setShowTxApproveModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    mounted,
    showDenyModal,
    showTxDenyModal,
    showApproveModal,
    showTxApproveModal,
    isPending,
  ]);

  const showActionError = (message: string) => {
    setActionError(message);
    toast.error(message);
  };

  const runBillingAction = (
    action: () => Promise<BillingActionResult>,
    successMessage: string,
    onSuccess?: () => void,
  ) => {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.success) {
          setAuthRefreshKey((key) => key + 1);
          toast.success(successMessage);
          onSuccess?.();
          return;
        }
        showActionError(result?.error || 'The billing action could not be completed.');
      } catch (cause) {
        showActionError(
          cause instanceof Error && cause.message
            ? cause.message
            : 'The billing action could not be completed.',
        );
      }
    });
  };

  const resetApprovalFields = () => {
    setAuthNumber('');
    setUnits('');
    setEffective('');
    setExpiration('');
  };

  const openApproval = (kind: ApprovalKind) => {
    setActionError(null);
    resetApprovalFields();
    if (kind === 'ASSESSMENT') setShowApproveModal(true);
    else setShowTxApproveModal(true);
  };

  const closeApproval = (kind: ApprovalKind) => {
    if (kind === 'ASSESSMENT') setShowApproveModal(false);
    else setShowTxApproveModal(false);
    setActionError(null);
    resetApprovalFields();
  };

  const handleApprovalSubmit = (kind: ApprovalKind) => {
    const request = kind === 'ASSESSMENT' ? paRequest : txPaRequest;
    if (!request?.id) {
      showActionError(`${kind === 'ASSESSMENT' ? 'Assessment' : 'Treatment'} PA request not found.`);
      return;
    }

    const parsedUnits = Number(units);
    const effectiveDate = approvalDate(effective);
    const expirationDate = approvalDate(expiration);
    if (!authNumber.trim()) {
      showActionError('Authorization number is required.');
      return;
    }
    if (!Number.isInteger(parsedUnits) || parsedUnits <= 0) {
      showActionError('Approved units must be a whole number greater than zero.');
      return;
    }
    if (!effectiveDate || !expirationDate) {
      showActionError('Enter valid effective and expiration dates.');
      return;
    }
    if (expirationDate < effectiveDate) {
      showActionError('Expiration date cannot be before the effective date.');
      return;
    }

    const payload = {
      authNumber: authNumber.trim(),
      approvedUnits: parsedUnits,
      effectiveDate,
      expirationDate,
    };
    runBillingAction(
      () =>
        kind === 'ASSESSMENT'
          ? approvePaRequest(request.id, payload)
          : approveTreatmentPaRequest(request.id, payload),
      `${kind === 'ASSESSMENT' ? 'Assessment' : 'Treatment'} authorization saved.`,
      () => closeApproval(kind),
    );
  };

  const handleDeny = (
    request: { id?: string } | null | undefined,
    isClinical: boolean,
    kind: ApprovalKind,
  ) => {
    if (!request?.id) {
      showActionError(`${kind === 'ASSESSMENT' ? 'Assessment' : 'Treatment'} PA request not found.`);
      return;
    }
    runBillingAction(
      () => denyPaRequest(request.id!, isClinical),
      `${kind === 'ASSESSMENT' ? 'Assessment' : 'Treatment'} ${
        isClinical ? 'clinical' : 'clerical'
      } denial logged.`,
      () => {
        if (kind === 'ASSESSMENT') setShowDenyModal(false);
        else setShowTxDenyModal(false);
        setActionError(null);
      },
    );
  };

  const handleVobSubmit = () => {
    if (!vobChecked || !credChecked) {
      showActionError('Please verify both eligibility and credentialing before continuing.');
      return;
    }
    runBillingAction(
      () => completeVobAndCreds(client.id),
      'VOB and credentialing recorded. Open Assessment PA to submit 97151.',
    );
  };

  return (
    <div className="space-y-10 [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed">

      {actionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.08)]"
        >
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss billing error"
            className="shrink-0 rounded-md p-1 text-red-300 transition hover:bg-red-500/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showAuthUnitsSection && (
      <>
      <ReAuthT45Banner
        clientId={client.id}
        clientName={[client.firstName, client.lastName].filter(Boolean).join(' ') || 'Client'}
      />

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange-400">
              Authorization intelligence
            </p>
            <h2 className="mt-1 font-heading text-lg font-semibold text-white">
              Units, ledgers &amp; weekly billables
            </h2>
          </div>
        </div>

        <AuthUnitsPanel clientId={client.id} refreshKey={authRefreshKey} />

        <WeeklyBillableUnitGrid clientId={client.id} />

        <AuthUnitsLedgerPanel clientId={client.id} />
      </section>
      </>
      )}

      {(showVobSection || showAssessmentPaSection || showTreatmentPaSection) && (
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-blue-400">
              {vobOnly
                ? 'Billing · VOB'
                : assessmentOnly
                  ? 'Billing · Assessment PA'
                  : 'Prior authorization'}
            </p>
            <h2 className="mt-1 font-heading text-lg font-semibold text-white">
              {vobOnly
                ? 'Verification of Benefits'
                : assessmentOnly
                  ? 'CPT 97151 authorization'
                  : 'Insurance snapshot & PA tracker'}
            </h2>
            {vobOnly && (
              <p className="mt-1 max-w-xl text-sm text-zinc-400">
                Confirm eligibility in RAS, then mark VOB complete. Assessment PA is the next tab
                — Clinical Support schedules 97151 only after that PA is approved.
              </p>
            )}
            {assessmentOnly && (
              <p className="mt-1 max-w-xl text-sm text-zinc-400">
                Submit and record the 97151 payer decision here. VOB must already be complete.
              </p>
            )}
          </div>
        </div>

      {/* Insurance Snapshot */}
      {showInsuranceSnapshot && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-white/10 bg-zinc-900/50 shadow-sm transition-all duration-300 hover:border-brand-orange-500/30 hover:shadow-2xl">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Primary Insurance</p>
              <h4 className={insurancePayer ? 'font-semibold text-white' : 'font-medium text-zinc-500'}>
                {insurancePayer ?? 'Payer not provided'}
              </h4>
              <p className={`mt-1 font-mono text-sm ${memberId ? 'text-brand-blue-400' : 'text-zinc-600'}`}>
                {memberId ?? 'Member ID not provided'}
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={!insuranceFrontUrl}
                aria-label={insuranceFrontUrl ? 'Preview primary insurance card front' : 'Primary insurance card front not uploaded'}
                className="h-auto flex-1 py-1 text-xs disabled:cursor-not-allowed"
                onClick={() => setPreviewDoc({ key: 'docInsuranceFront', name: 'Primary Insurance (Front)' })}
              >
                <Eye className="w-3 h-3 mr-1" /> Front
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!insuranceBackUrl}
                aria-label={insuranceBackUrl ? 'Preview primary insurance card back' : 'Primary insurance card back not uploaded'}
                className="h-auto flex-1 py-1 text-xs disabled:cursor-not-allowed"
                onClick={() => setPreviewDoc({ key: 'docInsuranceBack', name: 'Primary Insurance (Back)' })}
              >
                <Eye className="w-3 h-3 mr-1" /> Back
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasMedicaid ? (
          <Card className="border-white/10 bg-zinc-900/50 shadow-sm transition-all duration-300 hover:border-brand-orange-500/30 hover:shadow-2xl">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Medicaid</p>
                <h4 className="font-semibold text-white">Reported by family</h4>
                <p className={`mt-1 font-mono text-sm ${medicaidId ? 'text-brand-orange-400' : 'text-zinc-600'}`}>
                  {medicaidId ?? 'Medicaid ID not provided'}
                </p>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!medicaidFrontUrl}
                  aria-label={medicaidFrontUrl ? 'Preview Medicaid card front' : 'Medicaid card front not uploaded'}
                  className="h-auto flex-1 py-1 text-xs disabled:cursor-not-allowed"
                  onClick={() => setPreviewDoc({ key: 'docMedicaidFront', name: 'Medicaid (Front)' })}
                >
                  <Eye className="w-3 h-3 mr-1" /> Front
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!medicaidBackUrl}
                  aria-label={medicaidBackUrl ? 'Preview Medicaid card back' : 'Medicaid card back not uploaded'}
                  className="h-auto flex-1 py-1 text-xs disabled:cursor-not-allowed"
                  onClick={() => setPreviewDoc({ key: 'docMedicaidBack', name: 'Medicaid (Back)' })}
                >
                  <Eye className="w-3 h-3 mr-1" /> Back
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-white/10 shadow-sm bg-zinc-900/50 flex items-center justify-center opacity-50">
            <p className="text-zinc-500 text-sm">No Medicaid Reported</p>
          </Card>
        )}
      </div>
      )}

      {(showAssessmentVobStep || showAssessmentSubmitSteps) && (
      <Card className="border-white/10 shadow-sm w-full relative overflow-hidden">
        {paStatus === 'APPROVED' && (
          <div className="absolute top-0 left-0 w-1 bg-green-500 h-full z-20"></div>
        )}
        
        <CardHeader 
          className={`pb-4 border-b border-white/5 bg-zinc-950/50 ${paStatus === 'APPROVED' ? 'cursor-pointer hover:bg-zinc-900 transition-colors' : ''}`}
          role={paStatus === 'APPROVED' ? 'button' : undefined}
          tabIndex={paStatus === 'APPROVED' ? 0 : undefined}
          aria-expanded={paStatus === 'APPROVED' ? isAssessmentExpanded : undefined}
          aria-controls={paStatus === 'APPROVED' ? 'assessment-authorization-details' : undefined}
          onClick={() => {
            if (paStatus === 'APPROVED') setIsAssessmentExpanded((expanded) => !expanded);
          }}
          onKeyDown={(event) => {
            if (
              paStatus === 'APPROVED' &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              event.preventDefault();
              setIsAssessmentExpanded((expanded) => !expanded);
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-white flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-brand-blue-500" />
                {vobOnly
                  ? 'Eligibility & credentialing'
                  : 'Assessment PA — CPT 97151'}
                {paStatus === 'APPROVED' && (
                  <span className="text-[10px] font-bold border px-2.5 py-1 rounded-md tracking-wider uppercase bg-green-500/10 border-green-500/30 text-green-400">
                    APPROVED
                  </span>
                )}
              </CardTitle>
              <p className="text-sm text-zinc-400 mt-1">
                {vobOnly
                  ? 'Call the payer, confirm coverage and PA requirements, then record VOB in RAS.'
                  : 'Submit 97151 to the payer, then log approval or denial in this tab.'}
              </p>
            </div>
            {paStatus === 'APPROVED' && (
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white pointer-events-none">
                {isAssessmentExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </Button>
            )}
          </div>
        </CardHeader>
        
        {isAssessmentExpanded && (
        <CardContent
          id="assessment-authorization-details"
          className="p-8 animate-in slide-in-from-top-4 fade-in duration-300"
        >
          <div className="relative border-l-2 border-white/10 ml-4 space-y-12">
            
            {/* STEP 1: VOB & Credentialing */}
            {showAssessmentVobStep && (
            <div className="relative pl-8">
              <div className="absolute -left-[17px] top-0 bg-zinc-950 py-2">
                <StepCircle number={1} active={!preChecksComplete} completed={preChecksComplete} />
              </div>
              
              <div className={`bg-zinc-900 border ${preChecksComplete ? 'border-green-500/20' : 'border-white/10'} p-5 rounded-xl transition-all`}>
                <h3 className="text-base font-semibold text-white mb-4 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-2 text-zinc-400" />
                  Eligibility & Credentialing Check
                </h3>
                
                <div className="space-y-4">
                  <label className={`flex items-start space-x-3 group ${hasVob ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-blue-500 focus:ring-brand-blue-500 focus:ring-offset-zinc-900" 
                      checked={vobChecked}
                      onChange={(e) => setVobChecked(e.target.checked)}
                      disabled={hasVob}
                    />
                    <div>
                      <p className={`text-sm font-medium ${vobChecked ? 'text-zinc-300' : 'text-zinc-400'} group-hover:text-white transition-colors`}>
                        Verify Eligibility & Benefits (VOB) Completed
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">Called payer to confirm active coverage and PA requirements for 97151.</p>
                    </div>
                  </label>

                  <label className={`flex items-start space-x-3 group ${hasCred ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-blue-500 focus:ring-brand-blue-500 focus:ring-offset-zinc-900" 
                      checked={credChecked}
                      onChange={(e) => setCredChecked(e.target.checked)}
                      disabled={hasCred}
                    />
                    <div>
                      <p className={`text-sm font-medium ${credChecked ? 'text-zinc-300' : 'text-zinc-400'} group-hover:text-white transition-colors`}>
                        Provider Credentialed & Group-Linked
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">Confirmed the assessing BCBA is in-network and linked to our tax ID.</p>
                    </div>
                  </label>

                  {!preChecksComplete && (
                    <div className="pt-2">
                      <Button 
                        variant="primary" 
                        disabled={isPending || preChecksComplete}
                        onClick={handleVobSubmit}
                        className={`w-full mt-2 font-bold shadow-lg transition-all duration-300 ${
                          (vobChecked && credChecked && !preChecksComplete)
                            ? 'bg-green-500 hover:bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.4)] text-white hover:scale-[1.02] active:scale-[0.98]' 
                            : 'hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      >
                        {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Record VOB &amp; credentialing
                      </Button>
                    </div>
                  )}
                  {preChecksComplete && vobOnly && (
                    <p className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                      VOB is recorded. Switch to the Assessment PA tab to submit CPT 97151.
                    </p>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* STEP 2: Submit PA */}
            {showAssessmentSubmitSteps && !preChecksComplete && assessmentOnly && (
              <div className="relative pl-8">
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Complete the VOB / Benefits tab first. Assessment PA submit unlocks after VOB
                  is recorded.
                </div>
              </div>
            )}

            {showAssessmentSubmitSteps && (
            <div className={`relative pl-8 transition-opacity duration-300 ${!preChecksComplete ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              <div className="absolute -left-[17px] top-0 bg-zinc-950 py-2">
                <StepCircle number={assessmentOnly ? 1 : 2} active={preChecksComplete && !isPaSubmitted} completed={paStatus === 'APPROVED'} />
              </div>
              
              <div className={`bg-zinc-900 border ${paStatus === 'DENIED_CLERICAL' || paStatus === 'DENIED_CLINICAL' ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} p-5 rounded-xl`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2 flex items-center">
                      <FileCheck className="w-4 h-4 mr-2 text-zinc-400" />
                      Submit PA Request — CPT 97151
                    </h3>
                    <p className="text-sm text-zinc-400 max-w-lg mb-4">
                      Submit the initial assessment authorization request via the payer portal or phone. Include the diagnostic eval and referral.
                    </p>
                    
                    <div className="flex gap-2 mb-4">
                      {evalUrl ? (
                        <a 
                          href={evalUrl}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
                        >
                          <DownloadCloud className="w-3.5 h-3.5 mr-1.5" /> Diagnostic Eval
                        </a>
                      ) : (
                        <span className="inline-flex items-center text-xs bg-zinc-800/50 text-zinc-500 px-3 py-1.5 rounded-md border border-zinc-700/50 cursor-not-allowed">
                          <DownloadCloud className="w-3.5 h-3.5 mr-1.5 opacity-50" /> No Eval Found
                        </span>
                      )}
                      
                      {referralUrl ? (
                        <a 
                          href={referralUrl}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
                        >
                          <DownloadCloud className="w-3.5 h-3.5 mr-1.5" /> Physician Referral
                        </a>
                      ) : (
                        <span className="inline-flex items-center text-xs bg-zinc-800/50 text-zinc-500 px-3 py-1.5 rounded-md border border-zinc-700/50 cursor-not-allowed">
                          <DownloadCloud className="w-3.5 h-3.5 mr-1.5 opacity-50" /> No Referral Found
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {(paStatus === 'DENIED_CLERICAL' || (paStatus === 'DENIED_CLINICAL' && !paRequest?.p2pResolved)) && (
                    <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-md text-xs font-bold uppercase flex items-center">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                      {paStatus.replace('_', ' ')}
                    </div>
                  )}
                  {paStatus === 'DENIED_CLINICAL' && paRequest?.p2pResolved && (
                    <div className="flex flex-col items-end gap-2">
                      <div className="bg-green-500/20 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-md text-xs font-bold uppercase flex items-center">
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                        P2P RESOLVED BY BCBA
                      </div>
                    </div>
                  )}
                </div>

                {paStatus === 'DENIED_CLINICAL' && paRequest?.p2pResolved && paRequest.p2pNotes && (
                  <div className="mt-4 bg-zinc-950 border-l-2 border-brand-blue-500 p-3 rounded-r-lg">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">BCBA P2P Resolution Notes</p>
                    <p className="text-sm text-zinc-300 italic">
                      &ldquo;{paRequest.p2pNotes}&rdquo;
                    </p>
                  </div>
                )}

                {(!isPaSubmitted || paStatus.includes('DENIED')) && paStatus !== 'APPROVED' && (() => {
                  const isSubmitReady = paSubmittedConfirm;

                  return (
                    <div className="mt-4 border-t border-white/5 pt-4">
                      {!documentsPresent && (
                        <p
                          role="status"
                          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Diagnostic eval or physician referral is missing from the packet preview.
                          You can still mark submitted if you already sent 97151 to the payer.
                        </p>
                      )}
                      <label
                        className={`mb-4 flex items-start space-x-3 group ${
                          paStatus === 'DENIED_CLINICAL' && !paRequest?.p2pResolved
                            ? 'cursor-not-allowed'
                            : 'cursor-pointer'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-blue-500 focus:ring-brand-blue-500 focus:ring-offset-zinc-900" 
                          checked={paSubmittedConfirm}
                          onChange={(e) => setPaSubmittedConfirm(e.target.checked)}
                          disabled={
                            paStatus === 'DENIED_CLINICAL' && !paRequest?.p2pResolved
                          }
                        />
                        <div>
                          <p className={`text-sm font-medium ${paSubmittedConfirm ? 'text-zinc-300' : 'text-zinc-400'} group-hover:text-white transition-colors`}>
                            I confirm the 97151 authorization request has been submitted to the payer.
                          </p>
                        </div>
                      </label>

                      <Button 
                        variant="primary" 
                        disabled={
                          isPending ||
                          !isSubmitReady ||
                          (paStatus === 'DENIED_CLINICAL' && !paRequest?.p2pResolved)
                        }
                        onClick={() => {
                          runBillingAction(
                            () => submitPaRequest(client.id),
                            'Assessment PA request submitted.',
                          );
                        }}
                        className={`w-full mt-2 font-bold shadow-lg transition-all duration-300 ${
                          isSubmitReady
                            ? 'bg-green-500 hover:bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.4)] text-white hover:scale-[1.02] active:scale-[0.98]' 
                            : 'hover:scale-[1.02] active:scale-[0.98]'
                        } ${paStatus.includes('DENIED') && isSubmitReady ? '!bg-orange-500 hover:!bg-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.4)]' : ''}`}
                      >
                        {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {paStatus.includes('DENIED') ? 'Resubmit PA Request' : 'Mark as Submitted'}
                      </Button>
                    </div>
                  );
                })()}

                {paStatus === 'SUBMITTED' && (
                  <div className="flex items-center text-brand-blue-400 text-sm font-medium bg-brand-blue-500/10 p-3 rounded-lg border border-brand-blue-500/20">
                    <CheckCircle className="w-4 h-4 mr-2" /> PA Submitted. Awaiting Decision...
                  </div>
                )}
              </div>
            </div>
            )}

            {/* STEP 3: Decision & Finalize */}
            {showAssessmentSubmitSteps && (
            <div className={`relative pl-8 transition-opacity duration-300 ${paStatus !== 'SUBMITTED' && paStatus !== 'APPROVED' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              <div className="absolute -left-[17px] top-0 bg-zinc-950 py-2">
                <StepCircle number={assessmentOnly ? 2 : 3} active={paStatus === 'SUBMITTED'} completed={paStatus === 'APPROVED'} />
              </div>
              
              <div className={`bg-zinc-900 border ${paStatus === 'APPROVED' ? 'border-green-500/30 bg-green-500/5' : 'border-white/10'} p-5 rounded-xl`}>
                
                {paStatus !== 'APPROVED' || !paRequest ? (
                  <>
                    <h3 className="text-base font-semibold text-white mb-2 flex items-center">
                      <PhoneCall className="w-4 h-4 mr-2 text-zinc-400" />
                      Decision Received
                    </h3>
                    <p className="text-sm text-zinc-400 mb-5">
                      Record the payer&apos;s decision for the submitted authorization.
                    </p>
                    <div className="flex space-x-3">
                      <Button
                        variant="danger"
                        disabled={isPending}
                        onClick={() => {
                          setActionError(null);
                          setShowDenyModal(true);
                        }}
                      >
                        Log Denial
                      </Button>
                      <Button
                        disabled={isPending}
                        className="bg-green-600 hover:bg-green-700 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                        onClick={() => openApproval('ASSESSMENT')}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" /> Log Approval
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-base font-semibold text-green-400 flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Authorization Approved
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 bg-zinc-950 p-4 rounded-lg border border-white/5">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Auth Number</div>
                        <div className="font-mono text-zinc-200">{displayText(paRequest.authNumber) ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Approved Units</div>
                        <div className="font-mono text-zinc-200">
                          {formatUnits(paRequest.approvedUnits)}
                          {typeof paRequest.approvedUnits === 'number' ? ' units' : ''}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Effective Date</div>
                        <div className="font-mono text-zinc-200">{formatAuthDate(paRequest.effectiveDate)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Expiration Date</div>
                        <div className="font-mono text-zinc-200">{formatAuthDate(paRequest.expirationDate)}</div>
                      </div>
                    </div>
                  </>
                )}
                
              </div>
            </div>
            )}

          </div>
        </CardContent>
        )}
      </Card>
      )}

      {/* Denial Modal */}
      {showAssessmentSubmitSteps && showDenyModal && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => {
            if (!isPending) {
              setShowDenyModal(false);
              setActionError(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-denial-title"
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
            <h3 id="assessment-denial-title" className="text-lg font-semibold text-white flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-500 mr-2" /> Log Authorization Denial
            </h3>
            <button
              type="button"
              aria-label="Close"
              disabled={isPending}
              className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white cursor-pointer disabled:cursor-not-allowed"
              onClick={() => {
                setShowDenyModal(false);
                setActionError(null);
              }}
            >
              <X className="h-4 w-4" />
            </button>
            </div>
            <p className="text-sm text-zinc-400">What type of denial did the payer issue? This will reset the PA to require resubmission.</p>
            {actionError && (
              <p aria-live="polite" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {actionError}
              </p>
            )}
            
            <div className="grid grid-cols-1 gap-3 pt-2">
              <Button 
                variant="secondary" 
                disabled={isPending}
                className="justify-start h-auto py-3 text-left border-red-500/20 hover:border-red-500 hover:bg-red-500/10"
                onClick={() => handleDeny(paRequest, false, 'ASSESSMENT')}
              >
                <div>
                  <div className="font-bold text-red-400">Clerical Denial</div>
                  <div className="text-xs text-zinc-500 mt-1">Typo, wrong member ID, missing modifier. Easy to fix and resubmit.</div>
                </div>
              </Button>

              <Button 
                variant="secondary" 
                disabled={isPending}
                className="justify-start h-auto py-3 text-left border-orange-500/20 hover:border-orange-500 hover:bg-orange-500/10"
                onClick={() => handleDeny(paRequest, true, 'ASSESSMENT')}
              >
                <div>
                  <div className="font-bold text-orange-400">Clinical Denial</div>
                  <div className="text-xs text-zinc-500 mt-1">Lack of medical necessity. Requires Peer-to-Peer review.</div>
                </div>
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="ghost"
                disabled={isPending}
                onClick={() => {
                  setShowDenyModal(false);
                  setActionError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showTreatmentPaSection && showTxDenyModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="treatment-denial-title"
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <h3 id="treatment-denial-title" className="text-lg font-semibold text-white flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-500 mr-2" /> Log Treatment PA Denial
            </h3>
            <p className="text-sm text-zinc-400">What type of denial did the payer issue? This will reset the PA to require resubmission.</p>
            {actionError && (
              <p aria-live="polite" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {actionError}
              </p>
            )}
            
            <div className="grid grid-cols-1 gap-3 pt-2">
              <Button 
                variant="secondary" 
                disabled={isPending}
                className="justify-start h-auto py-3 text-left border-red-500/20 hover:border-red-500 hover:bg-red-500/10"
                onClick={() => handleDeny(txPaRequest, false, 'TREATMENT')}
              >
                <div>
                  <div className="font-bold text-red-400">Clerical Denial</div>
                  <div className="text-xs text-zinc-500 mt-1">Typo, wrong member ID, missing modifier. Easy to fix and resubmit.</div>
                </div>
              </Button>

              <Button 
                variant="secondary" 
                disabled={isPending}
                className="justify-start h-auto py-3 text-left border-orange-500/20 hover:border-orange-500 hover:bg-orange-500/10"
                onClick={() => handleDeny(txPaRequest, true, 'TREATMENT')}
              >
                <div>
                  <div className="font-bold text-orange-400">Clinical Denial</div>
                  <div className="text-xs text-zinc-500 mt-1">Lack of medical necessity. Requires Peer-to-Peer review.</div>
                </div>
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="ghost"
                disabled={isPending}
                onClick={() => {
                  setShowTxDenyModal(false);
                  setActionError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ---------------- TREATMENT PA SECTION ---------------- */}
      {showTreatmentPaSection && showTxPa && (
        <Card className="border-white/10 shadow-sm w-full relative overflow-hidden mt-6">
          {txPaStatus === 'APPROVED' && (
            <div className="absolute top-0 left-0 w-1 bg-brand-green-500 h-full z-20"></div>
          )}
          
          <CardHeader className="pb-4 border-b border-white/5 bg-zinc-950/50">
            <div>
              <CardTitle className="text-lg text-white flex items-center gap-3">
                <FileCheck className="w-5 h-5 text-brand-orange-500" /> Prior Authorization — Treatment
                {txPaStatus === 'APPROVED' && (
                  <span className="text-[10px] font-bold border px-2.5 py-1 rounded-md tracking-wider uppercase bg-green-500/10 border-green-500/30 text-green-400">
                    APPROVED
                  </span>
                )}
              </CardTitle>
              <p className="text-sm text-zinc-400 mt-1">Submit the Treatment Plan for CPT 97153, 97155, 97156.</p>
            </div>
          </CardHeader>
          
          <CardContent className="p-8">
            <div className="relative border-l-2 border-white/10 ml-4 space-y-12">
              
              {/* STEP 1: Submit PA */}
              <div className="relative pl-8">
                <div className="absolute -left-[17px] top-0 bg-zinc-950 py-2">
                  <StepCircle number={1} active={!isTxPaSubmitted} completed={isTxPaSubmitted} />
                </div>
                
                <div className={`bg-zinc-900 border ${txPaStatus === 'DENIED_CLERICAL' || txPaStatus === 'DENIED_CLINICAL' ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} p-5 rounded-xl`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-semibold text-white mb-1">Submit Treatment PA</h3>
                      <p className="text-sm text-zinc-400">The BCBA has completed the Treatment Plan. Submit to payer.</p>
                      {txPaStatus === 'SUBMITTED' && (
                        <div className="mt-3 flex items-center text-sm font-medium text-brand-orange-400 bg-brand-orange-500/10 px-3 py-1.5 rounded w-fit border border-brand-orange-500/20">
                          <Clock className="w-4 h-4 mr-2" /> Pending Payer Decision
                        </div>
                      )}
                    </div>
                    
                    {(txPaStatus === 'DENIED_CLERICAL' || (txPaStatus === 'DENIED_CLINICAL' && !txPaRequest?.p2pResolved)) && (
                      <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-md text-xs font-bold uppercase flex items-center mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                        {txPaStatus.replace('_', ' ')}
                      </div>
                    )}
                    {txPaStatus === 'DENIED_CLINICAL' && txPaRequest?.p2pResolved && (
                      <div className="bg-green-500/20 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-md text-xs font-bold uppercase flex items-center mb-2">
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                        P2P RESOLVED
                      </div>
                    )}

                    {(!isTxPaSubmitted || txPaStatus.includes('DENIED')) && txPaStatus !== 'APPROVED' && (
                      <div className="mt-4">
                          <div className="mb-4">
                            <a
                              href={`/api/generate-report/${client.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex cursor-pointer items-center justify-center rounded-md border border-brand-blue-500/30 px-3 py-2 text-sm font-medium text-brand-blue-400 transition-all duration-300 hover:bg-brand-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-400"
                            >
                              <FileText className="w-4 h-4 mr-2" /> Download Assembled Packet (PDF)
                            </a>
                          </div>
                          
                          <label
                            className={`mb-4 flex items-start space-x-3 group ${
                              txPaStatus === 'DENIED_CLINICAL' && !txPaRequest?.p2pResolved
                                ? 'cursor-not-allowed'
                                : 'cursor-pointer'
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-brand-blue-500 focus:ring-brand-blue-500 focus:ring-offset-zinc-900" 
                              checked={txSubmitConfirmed}
                              onChange={(e) => setTxSubmitConfirmed(e.target.checked)}
                              disabled={txPaStatus === 'DENIED_CLINICAL' && !txPaRequest?.p2pResolved}
                            />
                            <div>
                              <p className={`text-sm font-medium ${txSubmitConfirmed ? 'text-zinc-300' : 'text-zinc-400'} group-hover:text-white transition-colors`}>
                                Confirmed: I have successfully submitted the Treatment PA to the payer via portal/fax.
                              </p>
                            </div>
                          </label>
                          <Button 
                          onClick={() => {
                            runBillingAction(
                              () => submitTreatmentPaRequest(client.id),
                              'Treatment PA request submitted.',
                            );
                          }} 
                          variant="primary" 
                          size="sm"
                          disabled={isPending || !txSubmitConfirmed || (txPaStatus === 'DENIED_CLINICAL' && !txPaRequest?.p2pResolved)}
                          className={`w-full font-bold py-2 transition-all duration-300 ${
                            txSubmitConfirmed 
                              ? 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] cursor-pointer hover:scale-[1.02]' 
                              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          }`}
                        >
                          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {txPaStatus.includes('DENIED') ? 'Resubmit PA Request' : 'Mark as Submitted'}
                        </Button>
                      </div>
                    )}
                  </div>

                  {txPaStatus === 'DENIED_CLINICAL' && txPaRequest?.p2pResolved && txPaRequest.p2pNotes && (
                    <div className="mt-4 bg-zinc-950 border-l-2 border-brand-blue-500 p-3 rounded-r-lg">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">BCBA P2P Resolution Notes</p>
                      <p className="text-sm text-zinc-300 italic">
                        &ldquo;{txPaRequest.p2pNotes}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 2: Approval */}
              <div className={`relative pl-8 transition-opacity duration-300 ${!isTxPaSubmitted ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <div className="absolute -left-[17px] top-0 bg-zinc-950 py-2">
                  <StepCircle number={2} active={isTxPaSubmitted && txPaStatus !== 'APPROVED'} completed={txPaStatus === 'APPROVED'} />
                </div>
                
                <div className={`bg-zinc-900 border ${txPaStatus === 'APPROVED' ? 'border-green-500/20' : 'border-white/10'} p-5 rounded-xl`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-semibold text-white mb-1">Authorization Outcome</h3>
                      <p className="text-sm text-zinc-400">Record the approval details (97153, 97155, 97156).</p>
                    </div>
                    
                    {txPaStatus !== 'APPROVED' && txPaStatus !== 'DENIED_CLERICAL' && txPaStatus !== 'DENIED_CLINICAL' && (
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                          onClick={() => {
                            setActionError(null);
                            setShowTxDenyModal(true);
                          }}
                        >
                          Log Denial
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending}
                          className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                          onClick={() => openApproval('TREATMENT')}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" /> Log Approval
                        </Button>
                      </div>
                    )}
                  </div>

                  {txPaStatus === 'APPROVED' && txPaRequest && (
                    <div className="mt-4 bg-zinc-950 rounded-lg p-4 grid grid-cols-2 gap-4 border border-white/5">
                      <div>
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Auth Number</p>
                        <p className="text-white font-mono text-sm mt-0.5">
                          {displayText(txPaRequest.authNumber) ?? '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Approved Units</p>
                        <p className="text-white font-mono text-sm mt-0.5">
                          {formatUnits(txPaRequest.approvedUnits)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Effective Date</p>
                        <p className="text-zinc-300 text-sm mt-0.5">
                          {formatAuthDate(txPaRequest.effectiveDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-zinc-500 font-bold">Expiration Date</p>
                        <p className="text-zinc-300 text-sm mt-0.5">
                          {formatAuthDate(txPaRequest.expirationDate)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
            </div>
          </CardContent>
        </Card>
      )}

      </section>
      )}

      {/* Assessment approval modal */}
      {showAssessmentSubmitSteps && showApproveModal && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => {
            if (!isPending) closeApproval('ASSESSMENT');
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-approval-title"
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
            <h3 id="assessment-approval-title" className="text-lg font-semibold text-white flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" /> Log Authorization Approval
            </h3>
            <button
              type="button"
              aria-label="Close"
              disabled={isPending}
              className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white cursor-pointer disabled:cursor-not-allowed"
              onClick={() => closeApproval('ASSESSMENT')}
            >
              <X className="h-4 w-4" />
            </button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">Enter the authorization details provided by the payer.</p>
            {actionError && (
              <p aria-live="polite" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {actionError}
              </p>
            )}
            
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleApprovalSubmit('ASSESSMENT');
              }}
              className="space-y-4"
            >
              
              <div className="space-y-1">
                <label htmlFor="assessment-auth-number" className="text-xs font-semibold text-zinc-400 uppercase">
                  Auth Number
                </label>
                <input
                  id="assessment-auth-number"
                  required
                  disabled={isPending}
                  type="text"
                  autoComplete="off"
                  value={authNumber}
                  onChange={e => setAuthNumber(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-white outline-none focus:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              
              <div className="space-y-1">
                <label htmlFor="assessment-approved-units" className="text-xs font-semibold text-zinc-400 uppercase">
                  Approved Units (97151)
                </label>
                <input
                  id="assessment-approved-units"
                  required
                  disabled={isPending}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={units}
                  onChange={e => setUnits(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-white outline-none focus:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="assessment-effective-date" className="text-xs font-semibold text-zinc-400 uppercase">
                    Effective Date
                  </label>
                  <input
                    id="assessment-effective-date"
                    required
                    disabled={isPending}
                    type="date"
                    value={effective}
                    onChange={e => setEffective(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-zinc-300 outline-none focus:border-green-500 [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="assessment-expiration-date" className="text-xs font-semibold text-zinc-400 uppercase">
                    Expiration Date
                  </label>
                  <input
                    id="assessment-expiration-date"
                    required
                    disabled={isPending}
                    type="date"
                    min={effective || undefined}
                    value={expiration}
                    onChange={e => setExpiration(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-zinc-300 outline-none focus:border-green-500 [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => closeApproval('ASSESSMENT')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={isPending}
                  className="bg-green-600 hover:bg-green-700 text-white disabled:cursor-not-allowed"
                >
                  Save Authorization
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* TX Approval Modal */}
      {showTreatmentPaSection && showTxApproveModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="treatment-approval-title"
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <h3 id="treatment-approval-title" className="text-lg font-semibold text-white flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" /> Log Treatment PA Approval
            </h3>
            <p className="text-sm text-zinc-400 mb-4">Enter the authorization details provided by the payer for 97153, 97155, 97156.</p>
            {actionError && (
              <p aria-live="polite" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {actionError}
              </p>
            )}
            
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleApprovalSubmit('TREATMENT');
              }}
              className="space-y-4"
            >
              
              <div className="space-y-1">
                <label htmlFor="treatment-auth-number" className="text-xs font-semibold text-zinc-400 uppercase">
                  Auth Number
                </label>
                <input
                  id="treatment-auth-number"
                  required
                  disabled={isPending}
                  type="text"
                  autoComplete="off"
                  value={authNumber}
                  onChange={e => setAuthNumber(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-white outline-none focus:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              
              <div className="space-y-1">
                <label htmlFor="treatment-approved-units" className="text-xs font-semibold text-zinc-400 uppercase">
                  Total Approved Units
                </label>
                <input
                  id="treatment-approved-units"
                  required
                  disabled={isPending}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={units}
                  onChange={e => setUnits(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-white outline-none focus:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="treatment-effective-date" className="text-xs font-semibold text-zinc-400 uppercase">
                    Effective Date
                  </label>
                  <input
                    id="treatment-effective-date"
                    required
                    disabled={isPending}
                    type="date"
                    value={effective}
                    onChange={e => setEffective(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-zinc-300 outline-none focus:border-green-500 [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="treatment-expiration-date" className="text-xs font-semibold text-zinc-400 uppercase">
                    Expiration Date
                  </label>
                  <input
                    id="treatment-expiration-date"
                    required
                    disabled={isPending}
                    type="date"
                    min={effective || undefined}
                    value={expiration}
                    onChange={e => setExpiration(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-md p-2 text-zinc-300 outline-none focus:border-green-500 [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => closeApproval('TREATMENT')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={isPending}
                  className="bg-green-600 hover:bg-green-700 text-white disabled:cursor-not-allowed"
                >
                  Save Authorization
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <DocumentPreviewModal
        isOpen={Boolean(showInsuranceSnapshot && previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.name ?? ''}
        titleId="document-preview-title"
        breadcrumbLabel="Insurance Snapshot"
        url={previewUrl}
      />
    </div>
  );
}
