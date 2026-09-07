import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { CheckCircle2, X, Eye, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import { SectionCard } from './FormUIHelpers';
import { toast } from 'sonner';

type DocumentUploadsProps = {
  formData: Record<string, unknown>;
  handleBlur: (fieldId: string, value: unknown) => unknown;
  rejectionDetails?: Record<string, string | undefined>;
  isRejectionMode?: boolean;
};

type UploadWidgetProps = {
  label: string;
  description?: string;
  fieldId: string;
  required: boolean;
  currentValue: unknown;
  onChange: (fieldId: string, value: unknown) => unknown;
  rejectionReason?: string;
  isRejectionMode: boolean;
};

type UploadedDocument = {
  name?: string;
  size?: string;
  type?: string;
  url?: string;
};

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function DocumentUploads({
  formData,
  handleBlur,
  rejectionDetails = {},
  isRejectionMode = false,
}: DocumentUploadsProps) {

  // Conditional logic for required/optional docs based on Form 01
  const hasMedicaid = Boolean(
    formData['hasMedicaid'] &&
      formData['hasMedicaid'] !== 'No' &&
      formData['hasMedicaid'] !== 'Not Sure'
  );
  const hasIEP = formData['hasIEP'] === 'Yes — Attached' || formData['hasIEP'] === 'Yes — Will Provide';
  const hasCustodyDoc = formData['custodyDocAttached'] === 'Yes — Attached' || formData['custodyDocAttached'] === 'Yes — Will Provide';
  const hasPriorABA = formData['hasPriorABA'] === 'Yes';

  // Form 02 signature acts as the "document" for Form 02
  const form02Signed = !!formData['sig1Name'];

  return (
    <div id="docs" className="scroll-mt-10">
      <SectionCard title="Required Documents">
        <p className="text-slate-600 text-sm mb-6 font-medium">Please upload clear photos or PDFs of the following documents. These are required for insurance authorization.</p>

        <div className="space-y-4">
          <UploadWidget
            label="1a. Primary Insurance Card (Front)"
            fieldId="docInsuranceFront"
            required={true}
            currentValue={formData['docInsuranceFront']}
            onChange={handleBlur}
            rejectionReason={rejectionDetails['insuranceCardFrontUploaded']}
            isRejectionMode={isRejectionMode}
          />

          <UploadWidget
            label="1b. Primary Insurance Card (Back)"
            fieldId="docInsuranceBack"
            required={true}
            currentValue={formData['docInsuranceBack']}
            onChange={handleBlur}
            rejectionReason={rejectionDetails['insuranceCardBackUploaded']}
            isRejectionMode={isRejectionMode}
          />

          {hasMedicaid && (
            <>
              <UploadWidget
                label="2a. Medicaid Card / Benefit Card (Front)"
                fieldId="docMedicaidFront"
                required={true}
                currentValue={formData['docMedicaidFront']}
                onChange={handleBlur}
                rejectionReason={rejectionDetails['medicaidCardFrontUploaded']}
                isRejectionMode={isRejectionMode}
              />
              <UploadWidget
                label="2b. Medicaid Card / Benefit Card (Back)"
                fieldId="docMedicaidBack"
                required={true}
                currentValue={formData['docMedicaidBack']}
                onChange={handleBlur}
                rejectionReason={rejectionDetails['medicaidCardBackUploaded']}
                isRejectionMode={isRejectionMode}
              />
            </>
          )}

          <UploadWidget
            label="3. Diagnostic Evaluation Report (DSM-5 / autism diagnosis)"
            description="The full evaluation report from the diagnosing provider."
            fieldId="docEval"
            required={true}
            currentValue={formData['docEval']}
            onChange={handleBlur}
            rejectionReason={rejectionDetails['diagnosticEvalUploaded']}
            isRejectionMode={isRejectionMode}
          />

          <UploadWidget
            label="4. Physician Referral or Prescription for ABA"
            fieldId="docReferral"
            required={true}
            currentValue={formData['docReferral']}
            onChange={handleBlur}
            rejectionReason={rejectionDetails['physicianRxUploaded']}
            isRejectionMode={isRejectionMode}
          />

          {hasIEP && (
            <UploadWidget
              label="5. IEP / IFSP (School Plan)"
              fieldId="docIEP"
              required={true}
              currentValue={formData['docIEP']}
              onChange={handleBlur}
              rejectionReason={rejectionDetails['iepUploaded']}
              isRejectionMode={isRejectionMode}
            />
          )}

          {hasCustodyDoc && (
            <UploadWidget
              label="6. Legal Custody, Guardianship, or Foster Placement Order"
              fieldId="docCustody"
              required={true}
              currentValue={formData['docCustody']}
              onChange={handleBlur}
              rejectionReason={rejectionDetails['custodyDocsUploaded']}
              isRejectionMode={isRejectionMode}
            />
          )}

          {hasPriorABA && (
            <UploadWidget
              label="7. Prior ABA records or treatment plan"
              fieldId="docPriorABA"
              required={true}
              currentValue={formData['docPriorABA']}
              onChange={handleBlur}
              rejectionReason={rejectionDetails['priorAbaRecordsUploaded']}
              isRejectionMode={isRejectionMode}
            />
          )}

          {/* Item 8: Form 02 Signature (Auto-completed) */}
          <div className={`doc-item ${form02Signed ? 'uploaded' : 'missing'}`} style={{cursor: 'default'}}>
            <div className="doc-icon">
              {form02Signed ? (
                <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-xs">
                  <CheckCircle2 size={16} />
                </div>
              ) : '↑'}
            </div>
            <div className="flex-1">
              <div className="doc-title">
                8. Form 02: Consent & Authorization
                <span className="req-badge">REQUIRED</span>
              </div>
              <div className="doc-desc">
                {form02Signed ? "Auto-completed: You have digitally signed Form 02." : "Pending: Complete the signature section in Form 02 above."}
              </div>
            </div>
          </div>

        </div>
      </SectionCard>
    </div>
  );
}

/**
 * Plain-language upload errors for parents. The API returns specific
 * messages for auth/validation problems; storage/server problems
 * (e.g. bucket not created yet) come back generic and get friendly copy.
 */
function friendlyUploadError(status: number, serverMessage?: string): string {
  if (status === 401 || status === 403) {
    return serverMessage && !/unauthorized/i.test(serverMessage)
      ? serverMessage
      : 'We could not verify your secure link. Please reopen the link from your email or text, or message your care coordinator for a new one.';
  }
  if (status === 400) {
    return serverMessage || 'That file could not be accepted. Please upload a PDF, JPEG, or PNG smaller than 5MB.';
  }
  if (serverMessage === 'Storage is not configured') {
    return 'Document uploads are temporarily unavailable. Your answers are still saved — please try again later or message your care coordinator.';
  }
  return 'We could not upload your file right now. Please try again in a moment — if it keeps failing, message your care coordinator. Your other answers are safe.';
}

function DocumentPreviewModal({
  isOpen,
  onClose,
  docFile,
  label,
}: {
  isOpen: boolean;
  onClose: () => void;
  docFile: UploadedDocument | null;
  label: string;
}) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || !docFile) return null;

  const url = docFile.url || '';
  const isImage =
    docFile.type?.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(docFile.name || '') ||
    /\.(jpg|jpeg|png|webp|gif|svg)/i.test(url);

  const isPdf =
    docFile.type === 'application/pdf' ||
    /\.pdf$/i.test(docFile.name || '') ||
    /\.pdf/i.test(url);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white border-2 border-[#E2D5B7] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col my-auto relative animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#F9F5EC] border-b border-[#E2D5B7] shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
            <div className="w-8 h-8 rounded-xl bg-orange-100/70 border border-orange-200 text-[#EA580C] flex items-center justify-center shrink-0">
              {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-900 font-heading truncate">{label}</h3>
              <p className="text-[11px] text-slate-500 font-mono truncate">
                {docFile.name || 'Uploaded Document'} {docFile.size ? `· ${docFile.size}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E2D5B7] hover:border-orange-400 text-slate-700 hover:text-[#EA580C] text-xs font-bold font-mono transition shadow-2xs"
                title="Open in new window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open File</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Preview */}
        <div className="p-4 overflow-y-auto flex-1 flex items-center justify-center min-h-[300px] max-h-[70vh] bg-slate-950/5">
          {url ? (
            isImage ? (
              <div className="w-full flex items-center justify-center p-2">
                <Image
                  src={url}
                  alt={docFile.name || label}
                  width={1600}
                  height={1200}
                  unoptimized
                  className="max-h-[65vh] max-w-full w-auto object-contain rounded-xl shadow-md border border-[#E2D5B7] bg-white"
                />
              </div>
            ) : isPdf ? (
              <iframe
                src={url}
                title={docFile.name || label}
                className="w-full h-[65vh] rounded-xl border border-[#E2D5B7] bg-white shadow-inner"
              />
            ) : (
              <div className="text-center py-12 px-4">
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-800 mb-1">{docFile.name}</p>
                <p className="text-xs text-slate-500 mb-4">Preview not directly available in-line for this file type.</p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-xl text-xs font-bold shadow-sm transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Download / View Document</span>
                </a>
              </div>
            )
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-slate-500 italic">No direct file URL available for preview.</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-[#F9F5EC] border-t border-[#E2D5B7] flex items-center justify-between shrink-0">
          <span className="text-[11px] font-mono text-slate-500">
            {isImage ? '🖼️ Photo Document' : isPdf ? '📄 PDF Document' : '📁 Document File'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// UI Helper for Upload
function UploadWidget({
  label,
  description,
  fieldId,
  required,
  currentValue,
  onChange,
  rejectionReason,
  isRejectionMode,
}: UploadWidgetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const uploadedDocument =
    currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? (currentValue as UploadedDocument)
      : null;
  const isUploaded = Boolean(uploadedDocument);
  // Only docs the team did NOT reject are locked during a fix-and-resubmit pass;
  // a re-uploaded rejected doc stays editable so a wrong file can be replaced.
  const isLocked = isRejectionMode && isUploaded && !rejectionReason;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadError(null);
      if (file.size > 5 * 1024 * 1024) {
        const msg = 'This file is larger than 5MB. Please take a smaller photo or compress the PDF and try again.';
        setUploadError(msg);
        toast.error(msg);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        const msg = 'Only PDF, JPEG, and PNG files are accepted. Please try a photo or PDF instead.';
        setUploadError(msg);
        toast.error(msg);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const pathParts = window.location.pathname.split('/');
        const headers: Record<string, string> = {};
        if (pathParts[1] === 'magic-link' && pathParts[2]) {
          // Scope metadata must remain outside multipart so the API can
          // authorize this device-bound link before reading any body bytes.
          headers['x-magic-link-token'] = pathParts[2];
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers,
          body: formData
        });

        let data: Record<string, unknown> | null = null;
        try {
          const responseBody: unknown = await res.json();
          data =
            responseBody &&
            typeof responseBody === 'object' &&
            !Array.isArray(responseBody)
              ? (responseBody as Record<string, unknown>)
              : null;
        } catch {
          data = null;
        }

        if (!res.ok) {
          const msg = friendlyUploadError(res.status, typeof data?.error === 'string' ? data.error : undefined);
          setUploadError(msg);
          toast.error(msg);
          return;
        }

        if (!data || typeof data.url !== 'string') {
          const msg = 'The server returned an invalid document reference. Please try again.';
          setUploadError(msg);
          toast.error(msg);
          return;
        }

        onChange(fieldId, {
          name: typeof data.name === 'string' ? data.name : file.name,
          size: typeof data.size === 'string' ? data.size : '',
          type: typeof data.type === 'string' ? data.type : file.type,
          url: data.url
        });
      } catch (err) {
        console.error('Failed to upload', err);
        const msg = 'We could not reach the server. Please check your internet connection and try again.';
        setUploadError(msg);
        toast.error(msg);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(fieldId, null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };


  const isMissing = required && !isUploaded;

  // Parent-facing per-document status (intake-workflow-map row badges,
  // reworded in plain language): rejected → changes needed; uploaded →
  // received (in review); locked in a fix pass → approved; else pending.
  let statusBadge: { label: string; className: string; pulse?: boolean };
  if (rejectionReason && !isUploaded) {
    statusBadge = {
      label: 'Changes Needed',
      className: 'bg-red-50 text-red-700 border border-red-200 shadow-xs',
      pulse: true,
    };
  } else if (rejectionReason && isUploaded) {
    statusBadge = {
      label: 'Waiting for review',
      className: 'bg-amber-50 text-amber-800 border border-amber-200 shadow-xs',
    };
  } else if (isLocked) {
    statusBadge = {
      label: 'Approved',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs',
    };
  } else if (isUploaded) {
    statusBadge = {
      label: 'Received',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs',
    };
  } else {
    statusBadge = {
      label: 'Not Uploaded Yet',
      className: 'bg-[#F9F5EC] text-slate-500 border border-[#E2D5B7]',
    };
  }

  // The tile doubles as the upload trigger. A real <button> would nest the
  // remove <button> (invalid HTML), so the tile only becomes a button —
  // role, tab stop, key handlers — while it is actionable; once a file is
  // uploaded the remove button is the sole interactive control.
  const isActionable = !isUploaded && !isLocked && !isUploading;
  const triggerUpload = () => {
    if (isActionable) fileInputRef.current?.click();
  };

  return (
    <div
      role={isActionable ? 'button' : undefined}
      tabIndex={isActionable ? 0 : undefined}
      aria-label={isActionable ? `Upload document: ${label}` : undefined}
      aria-busy={isUploading || undefined}
      onClick={triggerUpload}
      onKeyDown={(e) => {
        if (isActionable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          triggerUpload();
        }
      }}
      className={`doc-item ${isUploaded ? 'uploaded' : ''} ${isMissing ? 'missing' : ''} ${isLocked ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''} ${isActionable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white' : ''}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,image/jpeg,image/png"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="doc-icon">
        {isUploading ? (
          <div className="animate-spin w-4 h-4 border-2 border-[#EA580C] border-t-transparent rounded-full" />
        ) : isUploaded ? (
          <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-xs">
            <CheckCircle2 size={16} />
          </div>
        ) : '↑'}
      </div>

      <div className="flex-1">
        <div className="doc-title flex-wrap">
          {label}
          {required ? <span className="req-badge">REQUIRED</span> : <span className="opt-badge">OPTIONAL</span>}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${statusBadge.className}`}>
            {statusBadge.pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}
            {statusBadge.label}
          </span>
        </div>

        {isUploading ? (
          <div className="doc-desc text-[#EA580C]">
            Uploading document...
          </div>
        ) : isUploaded ? (
          <div className="doc-desc">
            <span className="text-emerald-700 font-bold">{uploadedDocument?.name}</span> ({uploadedDocument?.size})
          </div>
        ) : (
          <div className="doc-desc">
            {description || 'Tap to select PDF or image file.'}
          </div>
        )}
        {rejectionReason && !isUploaded && (
          <div className="mt-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200">
            <strong>What needs to change:</strong> {rejectionReason}
          </div>
        )}
        {rejectionReason && isUploaded && (
          <div className="mt-2 text-sm text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-200">
            Submitted — waiting for Clinical Support to review. Previous note: {rejectionReason}
          </div>
        )}
        {uploadError && !isUploading && (
          <div role="alert" className="mt-2 text-sm text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
            {uploadError}
          </div>
        )}
      </div>

      {isUploaded && !isUploading && (
        <div className="flex items-center gap-2 shrink-0">
          {uploadedDocument?.url && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPreviewOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E2D5B7] hover:border-orange-400 text-slate-700 hover:text-[#EA580C] text-xs font-bold font-mono transition shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              title="Preview uploaded document"
              aria-label={`Preview uploaded file for ${label}`}
            >
              <Eye className="w-3.5 h-3.5 text-orange-500" />
              <span>Preview</span>
            </button>
          )}

          {!isLocked && (
            <button
              type="button"
              onClick={clearFile}
              className="shrink-0 p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              title="Remove file"
              aria-label={`Remove uploaded file for ${label}`}
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>
      )}

      {/* Document Preview Modal */}
      {isPreviewOpen && (
        <DocumentPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          docFile={uploadedDocument}
          label={label}
        />
      )}
    </div>
  );
}
