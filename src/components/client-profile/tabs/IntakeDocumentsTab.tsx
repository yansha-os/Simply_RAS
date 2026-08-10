'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Link as LinkIcon, FileText, CheckCircle, AlertTriangle, X, Check, Eye, LockOpen, FileCheck } from 'lucide-react';
import { generateMagicLink, sendToClinical, approveDocument, rejectDocument, rejectFormFieldsBulk, regenerateMagicLink, unlockPacket } from '@/app/(dashboard)/portal-case/actions';
import { Form01ClientIntake } from '@/components/magic-link/Form01ClientIntake';
import { Form02Consent } from '@/components/magic-link/Form02Consent';

export default function IntakeDocumentsTab({ client, isCaseCoordMode }: { client: any, isCaseCoordMode?: boolean }) {
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
  const [isPendingApprove, startApproveTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState('');

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rejectionDetails = packet?.rejectionDetails && typeof packet.rejectionDetails === 'object' ? packet.rejectionDetails : {};
  const formData = packet?.formData ? (typeof packet.formData === 'string' ? JSON.parse(packet.formData) : packet.formData) : {};

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

  const handleBulkRejectSubmit = async () => {
    const fields = stagedRejections.map(fieldId => ({ fieldId, reason: 'Admin requested changes to this field.' }));
    // Wait, rejectFormFieldsBulk was added to actions.ts. Need to import it!
    const { rejectFormFieldsBulk } = await import('@/app/(dashboard)/portal-case/actions');
    await rejectFormFieldsBulk(packet.id, fields);
    
    setPreviewDoc(null);
    setIsChangeMode(false);
    setStagedRejections([]);
    setShowSubmitConfirm(false);
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

  let parsedFormData: any = {};
  if (packet?.formData) {
    try {
      let parsed = typeof packet.formData === 'string' ? JSON.parse(packet.formData) : packet.formData;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      parsedFormData = parsed || {};
    } catch (e) {}
  }

  const allApproved = packet && 
    packet.intakeFormComplete && packet.consentFormComplete &&
    packet.insuranceCardFrontUploaded && packet.insuranceCardBackUploaded && 
    packet.diagnosticEvalUploaded && packet.physicianRxUploaded &&
    (!hasMedicaid || (packet.medicaidCardFrontUploaded && packet.medicaidCardBackUploaded)) &&
    (!hasIEP || packet.iepUploaded) &&
    (!hasCustodyDoc || packet.custodyDocsUploaded) &&
    (!hasPriorABA || packet.priorAbaRecordsUploaded);

  const DocumentRow = ({ title, dbKey, isComplete, isForm = false }: { title: string, dbKey: string, isComplete: boolean, isForm?: boolean }) => {
    const isRejected = rejectionDetails[dbKey];
    const isUploaded = dbKeyToFormKey[dbKey] ? !!parsedFormData[dbKeyToFormKey[dbKey]] : false;
    
    return (
      <div className="flex items-center justify-between text-sm p-2 hover:bg-white/5 rounded-lg transition-colors group">
        <button 
          onClick={() => setPreviewDoc({ key: dbKey, name: title })}
          className="flex-1 flex flex-col text-left group-hover:text-brand-blue-400 transition-colors py-1 cursor-pointer"
        >
          <span className="flex items-center text-zinc-300 font-medium">
            <FileText className="w-4 h-4 mr-3 text-zinc-500"/> {title}
          </span>
          {isRejected && (
            <span className="text-xs text-red-400 ml-7 mt-1 break-all pr-4">Rejected: {rejectionDetails[dbKey]}</span>
          )}
        </button>
        
        <div className="flex items-center space-x-2">
          {(() => {
            let hasRejects = false;
            if (isForm) {
              const form02Keys = ['cpt97151', 'cpt97153', 'cpt97155', 'cpt97156', 'cpt97157', 'cpt97158', 'cpt97154', 'photoInitial', 'cancelInitial', 'hipaaInitial', 'eSignInitial', 'sig1Name', 'sig1Date'];
              const isForm02 = dbKey === 'consentFormComplete';
              hasRejects = Object.keys(rejectionDetails).some(k => k.startsWith('formField_') && (isForm02 ? form02Keys.includes(k.replace('formField_', '')) : (!form02Keys.includes(k.replace('formField_', '')) && k.replace('formField_', '') !== 'globalInitials')));
            } else {
              hasRejects = isRejected;
            }

            if (hasRejects) {
              return (
                <span className="flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-red-500/10 text-red-500 border border-red-500/30">
                  CHANGES NEEDED
                </span>
              );
            }

            if (isComplete) {
              return (
                <span className="flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wider bg-green-500/10 text-green-400">
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> APPROVED
                </span>
              );
            }

            if (isUploaded) {
              return (
                <span className="flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[rgba(255,122,69,0.15)] text-[var(--dawn-hot)] border border-[rgba(255,122,69,0.3)]">
                  REVIEW NEEDED
                </span>
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
                  NOT STARTED
                </span>
              );
            }

            return (
            <>
              <button 
                onClick={() => setRejectDoc({ key: dbKey, name: title })}
                className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer hover:scale-110 active:scale-95"
                title="Reject Document"
              >
                <X className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setApproveDoc({ key: dbKey, name: title })}
                className="p-1.5 rounded-md text-zinc-500 hover:text-green-400 hover:bg-green-500/10 transition-all cursor-pointer hover:scale-110 active:scale-95"
                title="Approve Document"
              >
                <Check className="w-4 h-4" />
              </button>
            </>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 relative">
      
      {packet?.clientChangeRequested && (
        <div className="bg-brand-orange-500/10 border-l-4 border-brand-orange-500 p-4 rounded-r-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center text-brand-orange-500 font-bold mb-1">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Client Requested Access to Make Changes
              </div>
              <p className="text-zinc-300 text-sm">
                <span className="font-semibold text-white">Client Note:</span> {packet.clientChangeNotes}
              </p>
            </div>
            <Button onClick={() => unlockPacket(packet.id)} variant="secondary" className="bg-brand-orange-500/20 text-brand-orange-400 hover:bg-brand-orange-500/30 border border-brand-orange-500/50">
              <LockOpen className="w-4 h-4 mr-2" /> Unlock Packet
            </Button>
          </div>
        </div>
      )}

      {/* Approve Modal & Regeneration UI */}
      {!hasPacket && (
        <Card className="border-dashed bg-[var(--color-surface-hover)]">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <LinkIcon className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">No Intake Packet Generated</h3>
            <p className="text-sm text-slate-500 max-w-md mt-2 mb-6">
              Generate a secure Magic Link to send to the parent. They will use this link to fill out the 3 required forms and upload their 5 mandatory documents.
            </p>
            <form action={generateMagicLink}>
              <input type="hidden" name="clientId" value={client.id} />
              <Button type="submit" variant="primary">
                Generate Magic Link
              </Button>
            </form>
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
                      text = 'APPROVED';
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
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            
            {/* Magic Link Display */}
            {!isCaseCoordMode && (
              <div className="bg-zinc-900 border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-brand-blue-500/30 transition-colors">
                <div>
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Secure Parent Link</h4>
                  <p className="text-sm font-mono text-zinc-300 break-all select-all">http://localhost:3000/magic-link/{packet.magicLinkToken}</p>
                </div>
                <div className="flex items-center space-x-2">
                  {!['DOCS_APPROVED_INTAKE', 'CLINICAL_REVIEW_APPROVED', 'VOB_COMPLETED', 'PA_SUBMITTED', 'PA_APPROVED', 'ACTIVE'].includes(client.status) && (
                    <form action={regenerateMagicLink}>
                      <input type="hidden" name="packetId" value={packet.id} />
                      <input type="hidden" name="clientId" value={client.id} />
                      <Button 
                        type="submit"
                        variant="ghost" 
                        size="sm" 
                        className="text-zinc-400 hover:text-white"
                      >
                        Regenerate
                      </Button>
                    </form>
                  )}
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="shrink-0"
                    onClick={(e) => {
                      navigator.clipboard.writeText(`http://localhost:3000/magic-link/${packet.magicLinkToken}`);
                      const target = e.target as HTMLButtonElement;
                      const oldText = target.innerText;
                      target.innerText = 'Copied!';
                      setTimeout(() => { target.innerText = oldText; }, 2000);
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Required Forms</h4>
                <div className="space-y-1">
                  <DocumentRow title="Client Intake Form (Form 01)" dbKey="intakeFormComplete" isComplete={packet.intakeFormComplete} isForm={true} />
                  <DocumentRow title="Consent & Authorization (Form 02)" dbKey="consentFormComplete" isComplete={packet.consentFormComplete} isForm={true} />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Document Uploads</h4>
                <div className="space-y-1">
                  <DocumentRow title="Primary Insurance Card (Front)" dbKey="insuranceCardFrontUploaded" isComplete={packet.insuranceCardFrontUploaded} />
                  <DocumentRow title="Primary Insurance Card (Back)" dbKey="insuranceCardBackUploaded" isComplete={packet.insuranceCardBackUploaded} />
                  
                  {hasMedicaid && (
                    <>
                      <DocumentRow title="Medicaid Card (Front)" dbKey="medicaidCardFrontUploaded" isComplete={packet.medicaidCardFrontUploaded} />
                      <DocumentRow title="Medicaid Card (Back)" dbKey="medicaidCardBackUploaded" isComplete={packet.medicaidCardBackUploaded} />
                    </>
                  )}
                  
                  <DocumentRow title="Diagnostic Evaluation Report" dbKey="diagnosticEvalUploaded" isComplete={packet.diagnosticEvalUploaded} />
                  <DocumentRow title="Physician Referral / Prescription" dbKey="physicianRxUploaded" isComplete={packet.physicianRxUploaded} />
                  
                  {hasIEP && (
                    <DocumentRow title="IEP / IFSP" dbKey="iepUploaded" isComplete={packet.iepUploaded} />
                  )}
                  
                  {hasCustodyDoc && (
                    <DocumentRow title="Custody/Guardianship Order" dbKey="custodyDocsUploaded" isComplete={packet.custodyDocsUploaded} />
                  )}
                  
                  {hasPriorABA && (
                    <DocumentRow title="Prior ABA Records" dbKey="priorAbaRecordsUploaded" isComplete={packet.priorAbaRecordsUploaded} />
                  )}
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {mounted && createPortal(
        <>
          {/* Preview Modal */}
          {previewDoc && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
              <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-white/10 bg-zinc-950">
              <h3 className="font-semibold text-white flex items-center"><Eye className="w-5 h-5 mr-2 text-brand-blue-500"/> Preview: {previewDoc.name}</h3>
              
              <div className="flex items-center space-x-4">
                {(previewDoc.key === 'intakeFormComplete' || previewDoc.key === 'consentFormComplete') && (
                  <div className="flex items-center bg-white/5 rounded-lg p-1 space-x-2">
                    <button 
                      onClick={() => setIsChangeMode(false)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!isChangeMode ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
                    >
                      View Mode
                    </button>
                    <button 
                      onClick={() => setIsChangeMode(true)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isChangeMode ? 'bg-orange-500 text-black shadow' : 'text-zinc-400 hover:text-white'}`}
                    >
                      Request Changes Mode
                    </button>
                  </div>
                )}
                
                {isChangeMode && stagedRejections.length > 0 && (
                  <Button variant="danger" onClick={() => setShowSubmitConfirm(true)}>
                    Send {stagedRejections.length} Request(s)
                  </Button>
                )}
                
                {!isChangeMode && (
                  <div className="flex space-x-2">
                    {previewDoc.key !== 'intakeFormComplete' && previewDoc.key !== 'consentFormComplete' && (
                      <Button variant="danger" onClick={() => setRejectDoc(previewDoc)}>
                        Reject
                      </Button>
                    )}
                    <div className="relative group rounded-md">
                      <div className="absolute -inset-0.5 bg-green-500 rounded-md blur opacity-50 group-hover:opacity-100 transition duration-200"></div>
                      <Button variant="primary" className="relative bg-zinc-900 hover:bg-zinc-800 text-white font-bold tracking-wide border border-green-500/50" onClick={() => setShowApproveConfirm(true)}>
                        Approve
                      </Button>
                    </div>
                  </div>
                )}

                <div className="w-px h-6 bg-white/10 mx-2"></div>
                <button onClick={handleCloseModal} className="text-zinc-400 hover:text-white transition-colors p-1"><X className="w-6 h-6"/></button>
              </div>
            </div>
            
            {isChangeMode && (
              <div className="bg-orange-500/10 border-b border-orange-500/20 p-3 text-center">
                <p className="text-orange-400 text-sm font-medium flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  You are in Request Changes Mode. Click on any field to mark it for rejection. They will be wiped and sent back to the client.
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
                  const docData = parsedFormData[formKey];
                  
                  if (docData?.url) {
                    return (
                      <div className="w-full bg-white rounded-lg shadow-2xl overflow-hidden relative flex flex-col mt-4">
                        <div className="bg-zinc-100 border-b border-zinc-200 px-4 py-3 flex items-center justify-between text-zinc-600">
                          <div className="flex items-center text-sm font-medium">
                            <FileCheck className="w-4 h-4 mr-2 text-green-600" />
                            {docData.name}
                          </div>
                          <div className="text-xs font-mono">{docData.size}</div>
                        </div>
                        <div className="bg-zinc-200 p-4 flex items-center justify-center min-h-[50vh]">
                          {docData.type === 'application/pdf' ? (
                            <iframe src={docData.url} className="w-full h-[70vh] rounded shadow-inner" />
                          ) : (
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
                          <FileCheck className="w-4 h-4 mr-2 text-green-600" />
                          Document Securely Loaded
                        </div>
                        <div className="text-xs font-mono">{previewDoc.name}.pdf</div>
                      </div>
                      <div className="flex-1 bg-zinc-200/50 p-8 flex items-center justify-center relative">
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                        <div className="bg-white p-12 shadow-sm border border-zinc-200 rounded text-center w-full max-w-lg relative z-10 space-y-4">
                          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8" />
                          </div>
                          <h4 className="text-xl font-semibold text-zinc-800">File Received</h4>
                          <p className="text-sm text-zinc-500">The client uploaded this document via the secure magic link.</p>
                          <div className="mt-6 pt-6 border-t border-zinc-100 flex justify-center">
                            <div className="bg-zinc-50 border border-zinc-200 rounded px-4 py-2 text-xs font-mono text-zinc-400">
                              ID: {previewDoc.key.toUpperCase()}_{client.id.split('-')[0]}
                            </div>
                          </div>
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

      {/* Approve Modal */}
      {approveDoc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Approve {approveDoc.name}?</h3>
              <p className="text-sm text-zinc-400">Are you sure this document meets all compliance standards?</p>
              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="secondary" onClick={() => setApproveDoc(null)}>Cancel</Button>
                <Button variant="primary" onClick={() => {
                  approveDocument(packet.id, approveDoc.key, client.id);
                  setApproveDoc(null);
                  setPreviewDoc(null);
                }}>Confirm Approval</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectDoc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center"><AlertTriangle className="w-5 h-5 mr-2 text-red-500"/> Reject {rejectDoc.name}</h3>
              <p className="text-sm text-zinc-400">Why is this rejected? What needs to change? (The client will see this message).</p>
              <textarea 
                className="w-full text-sm border border-white/10 p-3 rounded-lg bg-zinc-950 text-white focus:border-red-500 outline-none transition-colors h-24 resize-none"
                placeholder="e.g. The insurance card is too blurry to read the Member ID."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="flex justify-end space-x-3 pt-2">
                <Button variant="secondary" onClick={() => { setRejectDoc(null); setRejectReason(''); }}>Cancel</Button>
                <Button variant="danger" disabled={!rejectReason.trim()} onClick={() => {
                  rejectDocument(packet.id, rejectDoc.key, client.id, rejectReason);
                  setRejectDoc(null);
                  setRejectReason('');
                  setPreviewDoc(null);
                }}>Reject Document</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirm (from preview modal) */}
      {showApproveConfirm && previewDoc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Approve {previewDoc.name}?</h3>
              <p className="text-sm text-zinc-400">Are you sure this form meets all compliance standards?</p>
              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="secondary" onClick={() => setShowApproveConfirm(false)}>Cancel</Button>
                <div className="relative group rounded-md">
                  <div className="absolute -inset-0.5 bg-green-500 rounded-md blur opacity-50 group-hover:opacity-100 transition duration-200"></div>
                  <Button variant="primary" disabled={isPendingApprove} className="relative bg-zinc-900 hover:bg-zinc-800 text-white font-bold tracking-wide border border-green-500/50" onClick={() => {
                    startApproveTransition(async () => {
                      await approveDocument(packet.id, previewDoc.key, client.id);
                      setShowApproveConfirm(false);
                      setPreviewDoc(null);
                    });
                  }}>{isPendingApprove ? 'Approving...' : 'Confirm Approval'}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discard Confirm */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Discard Changes?</h3>
              <p className="text-sm text-zinc-400">You have {stagedRejections.length} field(s) selected for rejection. Are you sure you want to discard these selections and close the form?</p>
              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>Keep Editing</Button>
                <Button variant="danger" onClick={() => {
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
          <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Send Changes Requested?</h3>
              <p className="text-sm text-zinc-400">You are about to wipe {stagedRejections.length} field(s) and bounce this form back to the client. The client will be notified to correct the wiped fields.</p>
              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="secondary" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
                <Button variant="danger" onClick={handleBulkRejectSubmit}>Confirm & Send</Button>
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
