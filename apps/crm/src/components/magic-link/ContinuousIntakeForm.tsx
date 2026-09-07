'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { Client, IntakePacket, Prisma } from '@prisma/client';
import { CheckCircle2, Loader2, AlertTriangle, ListChecks, X, ChevronRight } from 'lucide-react';
import { Form01ClientIntake } from './Form01ClientIntake';
import { Form02Consent } from './Form02Consent';
import { DocumentUploads } from './DocumentUploads';
import { toast } from 'sonner';

import { saveIntakeProgress, submitForm01, submitForm02 } from '@/app/actions/intake';
import { submitMagicLinkPacket } from '@/app/magic-link/actions';
import { parsePacketFormData } from '@/lib/safeParseJson';
import { isClinicalFamilyCorrectionLoop, summarizeClinicalCorrectionStates } from '@/lib/clinicalReviewApprovals';
import { evaluateClinicalCorrectionSubmit } from '@/lib/magicLinkPacketSubmit';
import { ClientNotificationBell } from './ClientNotificationBell';

import './redesign.css';

const subscribeToClientMount = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const ALL_MACRO_SECTIONS = [
  { id: 'sec-a', label: 'Form 01: Client Intake' },
  { id: 'consent-1', label: 'Consent & Authorization' },
  { id: 'docs', label: 'Document Uploads' }
];

const FIELD_METADATA: Record<string, { label: string; macroId: string; sectionId?: string }> = {
  // Form 01
  childFirstName: { label: "Child's First Name", macroId: 'sec-a', sectionId: 'sec-a' },
  childLastName: { label: "Child's Last Name", macroId: 'sec-a', sectionId: 'sec-a' },
  childName: { label: "Child's Full Legal Name", macroId: 'sec-a', sectionId: 'sec-a' },
  dob: { label: "Child's Date of Birth", macroId: 'sec-a', sectionId: 'sec-a' },
  sexAtBirth: { label: "Sex Assigned At Birth", macroId: 'sec-a', sectionId: 'sec-a' },
  childAddress: { label: "Child's Home Address", macroId: 'sec-a', sectionId: 'sec-a' },
  primaryLang: { label: "Primary Language Spoken at Home", macroId: 'sec-a', sectionId: 'sec-a' },
  elopement: { label: "History of Elopement (Running/Wandering)", macroId: 'sec-a', sectionId: 'sec-a' },
  g1FirstName: { label: "Guardian 1 First Name", macroId: 'sec-a', sectionId: 'sec-b' },
  g1LastName: { label: "Guardian 1 Last Name", macroId: 'sec-a', sectionId: 'sec-b' },
  g1Name: { label: "Guardian 1 Full Name", macroId: 'sec-a', sectionId: 'sec-b' },
  g1Phone: { label: "Guardian 1 Mobile Phone", macroId: 'sec-a', sectionId: 'sec-b' },
  g1Email: { label: "Guardian 1 Email Address", macroId: 'sec-a', sectionId: 'sec-b' },
  g1ContactPref: { label: "Guardian 1 Preferred Contact Method", macroId: 'sec-a', sectionId: 'sec-b' },
  custodyType: { label: "Legal Custody & Guardianship", macroId: 'sec-a', sectionId: 'sec-c' },
  custodyDocAttached: { label: "Custody Order / Document Status", macroId: 'sec-a', sectionId: 'sec-c' },
  priInsCompany: { label: "Primary Insurance Company Name", macroId: 'sec-a', sectionId: 'sec-d' },
  priInsMemberId: { label: "Primary Insurance Member ID", macroId: 'sec-a', sectionId: 'sec-d' },
  hasSecondPlan: { label: "Secondary Insurance Status", macroId: 'sec-a', sectionId: 'sec-e' },
  hasMedicaid: { label: "Medicaid Status", macroId: 'sec-a', sectionId: 'sec-f' },
  medicaidMCO: { label: "Medicaid MCO / Plan Name", macroId: 'sec-a', sectionId: 'sec-f' },
  hasDiagnosis: { label: "Autism Spectrum Disorder (ASD) Diagnosis", macroId: 'sec-a', sectionId: 'sec-h' },
  dxInitialDate: { label: "Date of Initial Diagnosis", macroId: 'sec-a', sectionId: 'sec-h' },
  dxRecentDate: { label: "Date of Most Recent Evaluation", macroId: 'sec-a', sectionId: 'sec-h' },
  dxProviderName: { label: "Diagnosing Provider Full Name", macroId: 'sec-a', sectionId: 'sec-h' },
  dxPracticeName: { label: "Diagnosing Practice Name", macroId: 'sec-a', sectionId: 'sec-h' },
  hasReferral: { label: "Written Prescription / Referral for ABA", macroId: 'sec-a', sectionId: 'sec-i' },
  referralProvider: { label: "Referring Provider Name", macroId: 'sec-a', sectionId: 'sec-i' },
  referralDate: { label: "Date of Referral", macroId: 'sec-a', sectionId: 'sec-i' },
  referralExpires: { label: "Referral Expiration Status", macroId: 'sec-a', sectionId: 'sec-i' },
  referralExpDate: { label: "Referral Expiration Date", macroId: 'sec-a', sectionId: 'sec-i' },
  hasPriorABA: { label: "Prior ABA Therapy Status", macroId: 'sec-a', sectionId: 'sec-j' },
  hasIEP: { label: "School IEP / IFSP Status", macroId: 'sec-a', sectionId: 'sec-k' },
  prefLocation: { label: "Preferred Service Location", macroId: 'sec-a', sectionId: 'sec-l' },
  quietSpace: { label: "Quiet Space for Therapy", macroId: 'sec-a', sectionId: 'sec-l' },
  hasPets: { label: "Household Pets Confirmation", macroId: 'sec-a', sectionId: 'sec-l' },
  othersHome: { label: "Others in Home Confirmation", macroId: 'sec-a', sectionId: 'sec-l' },
  em1Name: { label: "Emergency Contact 1 Full Name", macroId: 'sec-a', sectionId: 'sec-m' },
  em1Phone: { label: "Emergency Contact 1 Phone", macroId: 'sec-a', sectionId: 'sec-m' },
  emPermission: { label: "Emergency Medical Permission", macroId: 'sec-a', sectionId: 'sec-m' },
  attestationAgree: { label: "Form 01 Legal Certification Checkbox", macroId: 'sec-a', sectionId: 'sec-n' },
  attestationName: { label: "Attestation Electronic Signature Name", macroId: 'sec-a', sectionId: 'sec-n' },
  attestationDate: { label: "Attestation Date", macroId: 'sec-a', sectionId: 'sec-n' },

  // Form 02
  sig1Name: { label: "Consent Form Digital Signature", macroId: 'consent-1', sectionId: 'consent-1' },
  cpt97151: { label: "CPT 97151 Assessment Service Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  cpt97153: { label: "CPT 97153 1:1 ABA Service Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  cpt97155: { label: "CPT 97155 BCBA Supervision Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  cpt97156: { label: "CPT 97156 Parent Guidance Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  cpt97154: { label: "CPT 97154 Group ABA Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  locHome: { label: "Home Location Consent", macroId: 'consent-1', sectionId: 'consent-1' },
  locClinic: { label: "Clinic Location Consent", macroId: 'consent-1', sectionId: 'consent-1' },
  locCommunity: { label: "Community Location Consent", macroId: 'consent-1', sectionId: 'consent-1' },
  locSchool: { label: "School Location Consent", macroId: 'consent-1', sectionId: 'consent-1' },
  mediaClinical: { label: "Clinical Video/Photo Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  mediaTraining: { label: "Staff Training Media Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  mediaPhotos: { label: "Profile Photo Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  mediaMarketing: { label: "Marketing Media Consent", macroId: 'consent-1', sectionId: 'consent-1' },
  mediaObservation: { label: "Observation Glass Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  hipaaAck: { label: "HIPAA Notice of Privacy Practices", macroId: 'consent-1', sectionId: 'consent-1' },
  phiInsurance: { label: "PHI Release to Insurance", macroId: 'consent-1', sectionId: 'consent-1' },
  phiBilling: { label: "PHI Release to Billing Clearinghouse", macroId: 'consent-1', sectionId: 'consent-1' },
  phiPcp: { label: "PHI Coordination with PCP", macroId: 'consent-1', sectionId: 'consent-1' },
  phiDiagnosing: { label: "PHI Coordination with Diagnosing Provider", macroId: 'consent-1', sectionId: 'consent-1' },
  phiSchool: { label: "PHI Coordination with School / District", macroId: 'consent-1', sectionId: 'consent-1' },
  phiOtherTherapies: { label: "PHI Coordination with Other Providers", macroId: 'consent-1', sectionId: 'consent-1' },
  aobInitial: { label: "Assignment of Benefits (AOB) Agreement", macroId: 'consent-1', sectionId: 'consent-1' },
  attendanceInitial: { label: "Attendance Policy Initial", macroId: 'consent-1', sectionId: 'consent-1' },
  commPhone: { label: "Phone Call Communication Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  commSms: { label: "SMS Text Messaging Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  commEmail: { label: "Email Communication Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  commPortal: { label: "Portal Message Authorization", macroId: 'consent-1', sectionId: 'consent-1' },
  emergencyInitial: { label: "Emergency Medical Treatment Acknowledgment", macroId: 'consent-1', sectionId: 'consent-1' },
  eSignInitial: { label: "Electronic Signature Disclosure", macroId: 'consent-1', sectionId: 'consent-1' },
  telehealthOption: { label: "Telehealth Consent Choice (Accept or Decline)", macroId: 'consent-1', sectionId: 'consent-1' },

  // Docs
  docInsuranceFront: { label: "Insurance Card (Front Side Upload)", macroId: 'docs', sectionId: 'docs' },
  docInsuranceBack: { label: "Insurance Card (Back Side Upload)", macroId: 'docs', sectionId: 'docs' },
  docMedicaidFront: { label: "Medicaid Card (Front Side Upload)", macroId: 'docs', sectionId: 'docs' },
  docMedicaidBack: { label: "Medicaid Card (Back Side Upload)", macroId: 'docs', sectionId: 'docs' },
  docEval: { label: "Comprehensive ASD Diagnostic Evaluation", macroId: 'docs', sectionId: 'docs' },
  docReferral: { label: "Written Referral / Prescription for ABA", macroId: 'docs', sectionId: 'docs' },
  docIEP: { label: "School IEP / IFSP Document", macroId: 'docs', sectionId: 'docs' },
  docCustody: { label: "Legal Custody / Guardianship Document", macroId: 'docs', sectionId: 'docs' },
  docPriorABA: { label: "Prior ABA Treatment Records", macroId: 'docs', sectionId: 'docs' },
};

/** Parent-friendly labels for rejectionDetails document keys (intake-workflow-map). */
const REJECTION_DOC_LABELS: Record<string, string> = {
  insuranceCardFrontUploaded: 'Insurance card (front)',
  insuranceCardBackUploaded: 'Insurance card (back)',
  medicaidCardFrontUploaded: 'Medicaid card (front)',
  medicaidCardBackUploaded: 'Medicaid card (back)',
  diagnosticEvalUploaded: 'Diagnostic evaluation report',
  physicianRxUploaded: 'Physician referral / prescription',
  iepUploaded: 'IEP / IFSP (school plan)',
  custodyDocsUploaded: 'Custody / guardianship document',
  priorAbaRecordsUploaded: 'Prior ABA records',
  intakeFormComplete: 'Client intake form',
  consentFormComplete: 'Consent & authorization form',
};

export function ContinuousIntakeForm({ packet, client }: { packet: IntakePacket; client: Client }) {
  const router = useRouter();
  const [isSubmitting, startTransition] = React.useTransition();
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    try {
      // Handles plain, stringified, and double-stringified rows without throwing
      const parsed = parsePacketFormData(packet.formData);
      const parsedChildName =
        typeof parsed['childName'] === 'string' ? parsed['childName'] : '';

      // Inject default client values if they are completely missing from the parsed form data
      if (parsed['childFirstName'] === undefined) {
        parsed['childFirstName'] = client.firstName || parsedChildName.split(' ')[0] || '';
      }
      if (parsed['childLastName'] === undefined) {
        parsed['childLastName'] = client.lastName || parsedChildName.split(' ').slice(1).join(' ');
      }
      if (parsed['childName'] === undefined) {
        parsed['childName'] = `${client.firstName || ''} ${client.lastName || ''}`.trim();
      }
      if (parsed['dob'] === undefined && client.dateOfBirth) {
        parsed['dob'] = new Date(client.dateOfBirth).toISOString().split('T')[0];
      }
      if (parsed['g1FirstName'] === undefined && client.guardianName) {
        parsed['g1FirstName'] = client.guardianName.split(' ')[0] || '';
      }
      if (parsed['g1LastName'] === undefined && client.guardianName) {
        parsed['g1LastName'] = client.guardianName.split(' ').slice(1).join(' ') || '';
      }
      if (parsed['g1Name'] === undefined && client.guardianName) {
        parsed['g1Name'] = client.guardianName;
      }
      if (parsed['g1Phone'] === undefined && client.guardianPhone) {
        parsed['g1Phone'] = client.guardianPhone;
      }
      if (parsed['g1Email'] === undefined && client.guardianEmail) {
        parsed['g1Email'] = client.guardianEmail;
      }
      if (parsed['priInsCompany'] === undefined && client.insurancePayer) {
        parsed['priInsCompany'] = client.insurancePayer;
      }
      if (parsed['priInsMemberId'] === undefined && client.memberId) {
        parsed['priInsMemberId'] = client.memberId;
      }

      return parsed;
    } catch {
      return {};
    }
  });

  const formDataRef = React.useRef(formData);
  React.useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const rejectionDetails =
    packet?.rejectionDetails && typeof packet.rejectionDetails === 'object' && !Array.isArray(packet.rejectionDetails)
      ? (packet.rejectionDetails as Record<string, string>)
      : {};
  const rejectedFieldsList = Object.keys(rejectionDetails)
    .filter(k => k.startsWith('formField_'))
    .map(k => k.replace('formField_', ''));

  const form02FieldKeys = [
    'cpt97151', 'cpt97153', 'cpt97155', 'cpt97156', 'cpt97157', 'cpt97158', 'cpt97154',
    'photoInitial', 'cancelInitial', 'hipaaInitial', 'eSignInitial', 'sig1Name', 'sig1Date'
  ];
  const hasForm02Rejected = rejectedFieldsList.some(f => form02FieldKeys.includes(f));
  const hasForm01Rejected = rejectedFieldsList.some(f => !form02FieldKeys.includes(f) && f !== 'globalInitials');

  const hasDocsRejected = Object.keys(rejectionDetails).length > rejectedFieldsList.length;

  const clinicalCorrectionLoop = isClinicalFamilyCorrectionLoop({
    clientStatus: client.status,
    packetStatus: packet.status,
    rejectionDetails,
  });
  const correctionSummary = summarizeClinicalCorrectionStates(formData, rejectionDetails);
  const isCorrectionPass =
    Object.keys(rejectionDetails).length > 0 &&
    (packet.status === 'PENDING_CLIENT_SUBMISSION' || clinicalCorrectionLoop);
  const isRejectionMode = isCorrectionPass && correctionSummary.hasAwaitingFamily;

  const MACRO_SECTIONS = ALL_MACRO_SECTIONS.filter(sec => {
    if (!isCorrectionPass) return true;
    if (sec.id === 'sec-a') return hasForm01Rejected;
    if (sec.id === 'consent-1') return hasForm02Rejected;
    if (sec.id === 'docs') return hasDocsRejected;
    return false;
  });

  const [activeMacro, setActiveMacro] = useState(MACRO_SECTIONS[0]?.id || 'sec-a');

  // Track submission states to lock forms
  // If packet is pending client submission, forms might be locked if not rejected
  const isPending = packet.status === 'PENDING_CLIENT_SUBMISSION' || clinicalCorrectionLoop;
  const [isForm1Submitted, setIsForm1Submitted] = useState(!isPending && packet.intakeFormComplete);
  const [isForm2Submitted, setIsForm2Submitted] = useState(!isPending && packet.consentFormComplete);

  // Surface autosave failures (expired link, device mismatch, network) once —
  // not on every blur — so parents don't fill a whole form that isn't saving.
  const lastSaveErrorRef = React.useRef<string | null>(null);

  const handleBlur = async (fieldId: string | Record<string, string>, value?: unknown) => {
    let updated: Record<string, unknown>;

    if (typeof fieldId === 'string') {
      updated = { ...formDataRef.current, [fieldId]: value };
    } else {
      updated = { ...formDataRef.current, ...fieldId };
    }

    formDataRef.current = updated;
    setFormData(updated);

    try {
      const res = await saveIntakeProgress(packet.id, updated as Prisma.InputJsonObject);
      if (res && res.success === false) {
        const msg = typeof res.error === 'string'
          ? res.error
          : 'We could not save your progress. Please check your connection and try again.';
        if (lastSaveErrorRef.current !== msg) {
          lastSaveErrorRef.current = msg;
          toast.error(msg);
        }
      } else {
        lastSaveErrorRef.current = null;
      }
    } catch (e) {
      console.error(e);
      const msg = 'We could not save your progress. Please check your connection and try again.';
      if (lastSaveErrorRef.current !== msg) {
        lastSaveErrorRef.current = msg;
        toast.error(msg);
      }
    }
  };

  const getForm01RequiredFields = () => {
    const req = [
      'childName', 'dob', 'sexAtBirth', 'primaryLang', 'elopement',
      'g1Name', 'g1Phone', 'g1Email', 'g1ContactPref',
      'custodyType', 'custodyDocAttached',
      'priInsCompany', 'priInsMemberId', 'hasSecondPlan', 'hasMedicaid',
      'hasDiagnosis', 'hasReferral', 'hasPriorABA', 'hasIEP',
      'prefLocation', 'em1Name', 'em1Phone', 'emPermission',
      'attestationAgree', 'attestationName', 'attestationDate'
    ];
    if (!formData['childLivesWithParents']) req.push('childAddress');
    if (formData['hasMedicaid'] === 'Yes') req.push('medicaidMCO');
    if (formData['hasDiagnosis'] === 'Yes') req.push('dxInitialDate', 'dxRecentDate', 'dxProviderName', 'dxPracticeName');
    if (formData['hasReferral'] === 'Yes') req.push('referralProvider', 'referralDate', 'referralExpires');
    if (formData['hasReferral'] === 'Yes' && formData['referralExpires'] === 'Yes') req.push('referralExpDate');
    if (formData['prefLocation'] === 'Home') req.push('quietSpace', 'hasPets', 'othersHome');
    return req;
  };

  const form01Req = getForm01RequiredFields();
  const form01TotalCount = form01Req.length;
  const form01CompletedCount = form01Req.filter(f => !!formData[f]).length;
  const form01Complete = form01CompletedCount === form01TotalCount;

  const getForm02RequiredFields = () => {
    const req = [
      'sig1Name',
      'cpt97151', 'cpt97153', 'cpt97155', 'cpt97156', 'cpt97154',
      'locHome', 'locClinic', 'locCommunity', 'locSchool',
      'mediaClinical', 'mediaTraining', 'mediaPhotos', 'mediaMarketing', 'mediaObservation',
      'hipaaAck', 'phiInsurance', 'phiBilling', 'phiPcp', 'phiDiagnosing', 'phiSchool', 'phiOtherTherapies',
      'aobInitial', 'attendanceInitial',
      'commPhone', 'commSms', 'commEmail', 'commPortal',
      'emergencyInitial', 'eSignInitial'
    ];
    return req;
  };

  const form02Req = getForm02RequiredFields();
  const form02TotalCount = form02Req.length + 1; // +1 for Telehealth Consent OR Decline
  const form02CompletedCount = form02Req.filter(f => !!formData[f]).length + (formData['telehealthConsent'] || formData['telehealthDecline'] ? 1 : 0);
  const form02Complete = form02CompletedCount === form02TotalCount;

  const hasMedicaid = formData['hasMedicaid'] && formData['hasMedicaid'] !== 'No' && formData['hasMedicaid'] !== 'Not Sure';
  const hasCustodyDoc = formData['custodyDocAttached'] === 'Yes — Attached' || formData['custodyDocAttached'] === 'Yes — Will Provide';
  const hasIEP = formData['hasIEP'] === 'Yes — Attached' || formData['hasIEP'] === 'Yes — Will Provide';
  const hasPriorABA = formData['hasPriorABA'] === 'Yes';

  let docsTotalCount = 5; // docInsuranceFront, docInsuranceBack, docEval, docReferral, sig1Name (Form 02)
  let docsCompletedCount = [
    !!formData['docInsuranceFront'],
    !!formData['docInsuranceBack'],
    !!formData['docEval'],
    !!formData['docReferral'],
    !!formData['sig1Name']
  ].filter(Boolean).length;

  if (hasMedicaid) { docsTotalCount += 2; if (!!formData['docMedicaidFront']) docsCompletedCount++; if (!!formData['docMedicaidBack']) docsCompletedCount++; }
  if (hasIEP) { docsTotalCount++; if (!!formData['docIEP']) docsCompletedCount++; }
  if (hasCustodyDoc) { docsTotalCount++; if (!!formData['docCustody']) docsCompletedCount++; }
  if (hasPriorABA) { docsTotalCount++; if (!!formData['docPriorABA']) docsCompletedCount++; }

  const docsComplete = docsCompletedCount === docsTotalCount;

  const clinicalCorrectionEval = clinicalCorrectionLoop
    ? evaluateClinicalCorrectionSubmit(formData, rejectionDetails)
    : null;
  const overallComplete = clinicalCorrectionEval
    ? clinicalCorrectionEval.complete
    : form01Complete && form02Complete && docsComplete;

  const [isWhatsLeftOpen, setIsWhatsLeftOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWhatsLeftOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const form01Missing = clinicalCorrectionEval
    ? clinicalCorrectionEval.missingForm01
    : form01Req.filter(f => {
    if (f === 'childName') {
      return !formData['childName'] && (!formData['childFirstName'] || !formData['childLastName']);
    }
    if (f === 'g1Name') {
      return !formData['g1Name'] && (!formData['g1FirstName'] || !formData['g1LastName']);
    }
    return !formData[f];
  });

  const form02Missing = clinicalCorrectionEval
    ? clinicalCorrectionEval.missingForm02
    : (() => {
        const missing = form02Req.filter(f => !formData[f]);
        if (!formData['telehealthConsent'] && !formData['telehealthDecline']) {
          missing.push('telehealthOption');
        }
        return missing;
      })();

  const docsMissing: string[] = clinicalCorrectionEval
    ? clinicalCorrectionEval.missingDocs
    : (() => {
        const missing: string[] = [];
        if (!formData['docInsuranceFront']) missing.push('docInsuranceFront');
        if (!formData['docInsuranceBack']) missing.push('docInsuranceBack');
        if (!formData['docEval']) missing.push('docEval');
        if (!formData['docReferral']) missing.push('docReferral');
        if (!formData['sig1Name']) missing.push('sig1Name');
        if (hasMedicaid) {
          if (!formData['docMedicaidFront']) missing.push('docMedicaidFront');
          if (!formData['docMedicaidBack']) missing.push('docMedicaidBack');
        }
        if (hasIEP && !formData['docIEP']) missing.push('docIEP');
        if (hasCustodyDoc && !formData['docCustody']) missing.push('docCustody');
        if (hasPriorABA && !formData['docPriorABA']) missing.push('docPriorABA');
        return missing;
      })();

  const activeMissingList =
    activeMacro === 'sec-a' ? form01Missing :
    activeMacro === 'consent-1' ? form02Missing :
    docsMissing;

  const handleJumpToField = (fieldKey: string) => {
    const meta = FIELD_METADATA[fieldKey] || { label: fieldKey, macroId: activeMacro };
    setIsWhatsLeftOpen(false);

    if (activeMacro !== meta.macroId) {
      setActiveMacro(meta.macroId);
    }

    setTimeout(() => {
      let target = document.getElementById(`intake-${fieldKey}`) ||
                   document.querySelector(`[name="${fieldKey}"]`) ||
                   document.getElementById(fieldKey);

      if (!target && meta.sectionId) {
        target = document.getElementById(meta.sectionId);
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if ('focus' in target && typeof (target as HTMLElement).focus === 'function') {
          (target as HTMLElement).focus();
        }
        target.classList.add('ring-4', 'ring-[#EA580C]', 'ring-offset-2', 'transition-all', 'duration-300');
        setTimeout(() => {
          target?.classList.remove('ring-4', 'ring-[#EA580C]', 'ring-offset-2');
        }, 2500);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 150);
  };

  const getStatus = (id: string) => {
    if (clinicalCorrectionEval) {
      if (id === 'sec-a') return clinicalCorrectionEval.missingForm01.length === 0;
      if (id === 'consent-1') return clinicalCorrectionEval.missingForm02.length === 0;
      if (id === 'docs') return clinicalCorrectionEval.missingDocs.length === 0;
      return false;
    }
    if (id === 'sec-a') return form01Complete;
    if (id === 'consent-1') return form02Complete;
    if (id === 'docs') return docsComplete;
    return false;
  };

  const getCompletedCount = () => {
    return [form01Complete, form02Complete, docsComplete].filter(Boolean).length;
  };

  // Final submit goes through the server-validated magic-link action:
  // it re-checks every required field/document, wipes rejectionDetails,
  // and flips the packet to SUBMITTED.
  const handleFinalSubmit = async () => {
    const res = await submitMagicLinkPacket(packet.id, formDataRef.current as Prisma.InputJsonObject);
    if (res.success) {
      router.replace('?success=true');
    } else {
      toast.error(
        typeof res.error === 'string'
          ? res.error
          : 'We could not submit your packet. Please try again.'
      );
    }
  };

  const handleNext = () => {
    const currentIndex = MACRO_SECTIONS.findIndex(s => s.id === activeMacro);
    if (currentIndex < MACRO_SECTIONS.length - 1) {
      setActiveMacro(MACRO_SECTIONS[currentIndex + 1].id);
      window.scrollTo({ top: 0 });
    }
  };
  const handlePrev = () => {
    const currentIndex = MACRO_SECTIONS.findIndex(s => s.id === activeMacro);
    if (currentIndex > 0) {
      setActiveMacro(MACRO_SECTIONS[currentIndex - 1].id);
      window.scrollTo({ top: 0 });
    }
  };

  // Mobile progress tracking
  const activeIndex = MACRO_SECTIONS.findIndex(s => s.id === activeMacro);
  const isLastSection = activeIndex === MACRO_SECTIONS.length - 1;
  const progressPercent = ((getCompletedCount()) / 3) * 100;
  const savedGuardianName = typeof formData['g1Name'] === 'string' ? formData['g1Name'] : '';
  const guardianDisplayName = savedGuardianName || client.guardianName || 'Loading...';

  return (
    <div className="magic-link-wrapper">
      {/* Mobile-only Sticky Interactive Navigation Bar that follows scroll */}
      <div className="md:hidden sticky top-0 z-40 px-3 py-2.5 bg-[#FFFDF8]/95 backdrop-blur-md border-b border-[#E2D5B7] shadow-xs">
        {/* Interactive Tab Switcher Buttons & Notification Bell */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 p-1 bg-[#F9F5EC] border border-[#E2D5B7]/80 rounded-2xl">
            {MACRO_SECTIONS.map((sec) => {
              const isActive = activeMacro === sec.id;
              const isDone = getStatus(sec.id);
              let shortLabel = '1. Intake';
              if (sec.id === 'consent-1') shortLabel = '2. Consent';
              if (sec.id === 'docs') shortLabel = '3. Uploads';

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setActiveMacro(sec.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#EA580C] to-amber-500 text-white shadow-sm'
                      : isDone
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-300/80 hover:bg-emerald-100/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  {isDone && !isActive ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : null}
                  <span className="truncate">{shortLabel}</span>
                </button>
              );
            })}
          </div>

          <ClientNotificationBell
            token={packet.magicLinkToken ?? undefined}
            clientId={client.id}
            onNavigate={(url) => {
              if (url.includes('docs')) {
                setActiveMacro('docs');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else if (url.includes('consent')) {
                setActiveMacro('consent-1');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else if (url.includes('sec-a')) {
                setActiveMacro('sec-a');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          />
        </div>

        {/* Progress & Missing Indicator Bar */}
        <div className="flex items-center justify-between text-[10.5px] font-mono font-bold mt-2 px-1 text-slate-500">
          <span className="text-[#EA580C] uppercase tracking-wider">
            {MACRO_SECTIONS[activeIndex]?.label?.split(':')[0] || 'STEP'}
          </span>
          <div className="flex items-center gap-2">
            {activeMissingList.length > 0 && (
              <button
                type="button"
                onClick={() => setIsWhatsLeftOpen(true)}
                className="text-[#EA580C] hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <span>⚠️ {activeMissingList.length} left</span>
              </button>
            )}
            <span className="text-slate-400">·</span>
            <span>{getCompletedCount()} / 3 done</span>
          </div>
        </div>
        <div className="h-1 bg-[#E2D5B7]/50 rounded-full mt-1.5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#FF7A45] to-[#EA580C] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="wrap" id="frame">
        <div className="hero relative">
          <div className="hidden sm:flex absolute top-4 right-4 items-center gap-2">
            <ClientNotificationBell
              token={packet.magicLinkToken ?? undefined}
              clientId={client.id}
              onNavigate={(url) => {
                if (url.includes('docs')) {
                  setActiveMacro('docs');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (url.includes('consent')) {
                  setActiveMacro('consent-1');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (url.includes('sec-a')) {
                  setActiveMacro('sec-a');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            />
          </div>

          <h1>Secure Intake Portal</h1>
          <div className="for">
            CHILD: {(client.firstName + ' ' + client.lastName).toUpperCase()} &nbsp;|&nbsp; PARENT: {guardianDisplayName.toUpperCase()}
          </div>
          <div className="sub">Please answer every question — your progress saves automatically as you go.</div>
        </div>

        {isRejectionMode && (
          <div className="mx-auto mb-8 max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-100 text-red-600">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-bold text-red-950">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />
                  A few updates are needed
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
                  Our team reviewed your packet and needs the items below fixed or re-uploaded.
                  Everything else is locked and safe — when you&apos;re done, tap <strong className="text-slate-900 font-bold">Submit Updates</strong>.
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {Object.entries(rejectionDetails)
                .filter(([key]) => correctionSummary.awaitingFamilyKeys.includes(key))
                .map(([key, reason]) => {
                const label = key.startsWith('formField_')
                  ? 'Form answer'
                  : REJECTION_DOC_LABELS[key] || 'Document';
                return (
                  <li key={key} className="flex items-start gap-2.5 rounded-xl border border-red-200/80 bg-white px-3.5 py-2.5 shadow-xs">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    <div className="min-w-0 text-[13px] leading-relaxed">
                      <span className="font-bold text-red-700">{label}:</span>{' '}
                      <span className="text-slate-700">{typeof reason === 'string' && reason.trim() ? reason : 'Please review and update this item.'}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {clinicalCorrectionLoop && !isRejectionMode && correctionSummary.hasNeedsCssReview && (
          <div className="mx-auto mb-8 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-100 text-amber-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-amber-950">Submitted — waiting for Clinical Support</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
                  Your new file is on file. Tap <strong className="text-slate-900 font-bold">Submit Updates</strong> if you have not sent it yet; otherwise Clinical Support will review it shortly.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="layout">
          {/* Desktop rail */}
          <div className="rail glass">
            <div className="rail-title">Intake Progress</div>
            <div className="rail-overall">{form01CompletedCount}/{form01TotalCount} · {form02CompletedCount}/{form02TotalCount} · {docsCompletedCount}/{docsTotalCount} complete</div>

            {MACRO_SECTIONS.map((sec, idx) => {
              const isActive = activeMacro === sec.id;
              const isComplete = getStatus(sec.id);

              let completedCount = 0;
              let totalCount = 1;
              if (sec.id === 'sec-a') { completedCount = form01CompletedCount; totalCount = form01TotalCount; }
              if (sec.id === 'consent-1') { completedCount = form02CompletedCount; totalCount = form02TotalCount; }
              if (sec.id === 'docs') { completedCount = docsCompletedCount; totalCount = docsTotalCount; }

              const progressPct = (completedCount / totalCount) * 100;

              let stepClass = "rail-step";
              if (isComplete) stepClass += " done";
              else if (isActive) stepClass += " active";

              return (
                <div key={sec.id} className={stepClass} onClick={() => { setActiveMacro(sec.id); window.scrollTo({ top: 0 }); }}>
                  <div className="rail-step-top">
                    <div className="rail-dot">
                      {isComplete ? (
                        <div className="w-[18px] h-[18px] rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-xs">
                          <CheckCircle2 size={12} />
                        </div>
                      ) : ''}
                    </div>
                    <div>
                      <div className="rail-label">Step {idx + 1}</div>
                      <div className="rail-name">{sec.label}</div>
                    </div>
                  </div>
                  <div className="rail-progress">
                    <div style={{ width: `${progressPct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Main content */}
          <div>
            {activeMacro === 'sec-a' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Form01ClientIntake
                  formData={formData}
                  handleBlur={handleBlur}
                  client={client}
                  readOnly={isForm1Submitted}
                  isRejectionMode={isRejectionMode}
                  rejectedFields={rejectedFieldsList}
                />
                <div className="step-nav flex items-center justify-between gap-3 flex-wrap">
                  <div></div> {/* Spacer */}
                  <div className="flex items-center gap-3">
                    {form01Missing.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsWhatsLeftOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#FFF5ED] border border-[#FFD8C2] text-[#EA580C] hover:bg-orange-100 hover:border-orange-300 font-bold text-xs sm:text-sm transition cursor-pointer shadow-xs"
                      >
                        <ListChecks className="w-4 h-4 text-[#EA580C] shrink-0" />
                        <span>Click to see what&apos;s left ({form01Missing.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={(isLastSection ? !overallComplete : (form01CompletedCount < form01TotalCount)) || isSubmitting}
                      onClick={() => startTransition(async () => {
                        if (!isForm1Submitted) {
                          if (form01CompletedCount < form01TotalCount) return;

                          // Default any missing optional fields to "N/A"
                          const form01AllFields = [
                            'childName', 'childPrefName', 'dob', 'sexAtBirth',
                            'childAddress', 'childCity', 'childState', 'childZip',
                            'primaryLang', 'otherLanguages', 'elopement',
                            'g1Name', 'g1Rel', 'g1Phone', 'g1Email', 'g1Address', 'g1ContactPref',
                            'g2Name', 'g2Rel', 'g2Phone', 'g2Email', 'g2Address',
                            'custodyType', 'custodyDocAttached',
                            'priInsCompany', 'priInsMemberId', 'priInsGroup', 'priInsHolderName', 'priInsHolderDob', 'priInsHolderRel',
                            'hasSecondPlan', 'secInsCompany', 'secInsMemberId', 'secInsGroup', 'secInsHolderName', 'secInsHolderDob', 'secInsHolderRel',
                            'hasMedicaid', 'medicaidId', 'medicaidMco',
                            'hasDiagnosis', 'diagnosisName', 'diagnosingProvider', 'diagnosisDate',
                            'hasReferral', 'referringProvider',
                            'hasPriorABA', 'priorAbaProvider', 'priorAbaDates',
                            'hasIEP', 'schoolName', 'schoolDistrict',
                            'currentServices', 'pediatricianName', 'pediatricianPhone'
                          ];

                          const updatedFormData = { ...formData };
                          form01AllFields.forEach(field => {
                            const val = updatedFormData[field];
                            if (!val || (typeof val === 'string' && val.trim() === '')) {
                              updatedFormData[field] = 'N/A';
                            }
                          });
                          setFormData(updatedFormData);
                          formDataRef.current = updatedFormData;
                          const res = await submitForm01(packet.id, updatedFormData as Prisma.InputJsonObject);
                          if (res && res.success === false) {
                            toast.error(typeof res.error === 'string' ? res.error : 'We could not save Form 01. Please try again.');
                            return;
                          }
                          setIsForm1Submitted(true);
                        }

                        if (isLastSection) {
                          if (overallComplete) {
                            await handleFinalSubmit();
                          }
                        } else {
                          handleNext();
                        }
                      })}
                      className="btn btn-primary cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      {form01CompletedCount < form01TotalCount ? 'Complete Form 01 to continue' : (isLastSection ? 'Submit Updates' : 'Continue to Consent →')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeMacro === 'consent-1' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Form02Consent
                  formData={formData}
                  handleBlur={handleBlur}
                  client={client}
                  readOnly={isForm2Submitted}
                  isRejectionMode={isRejectionMode}
                  rejectedFields={rejectedFieldsList}
                />
                <div className="step-nav flex items-center justify-between gap-3 flex-wrap">
                  {activeIndex > 0 && <button type="button" onClick={handlePrev} className="btn btn-ghost cursor-pointer">← Back</button>}
                  {activeIndex === 0 && <div></div>}
                  <div className="flex items-center gap-3">
                    {form02Missing.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsWhatsLeftOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#FFF5ED] border border-[#FFD8C2] text-[#EA580C] hover:bg-orange-100 hover:border-orange-300 font-bold text-xs sm:text-sm transition cursor-pointer shadow-xs"
                      >
                        <ListChecks className="w-4 h-4 text-[#EA580C] shrink-0" />
                        <span>Click to see what&apos;s left ({form02Missing.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={(isLastSection ? !overallComplete : (form02CompletedCount < form02TotalCount)) || isSubmitting}
                      onClick={() => startTransition(async () => {
                        if (!isForm2Submitted) {
                          if (form02CompletedCount < form02TotalCount) return;
                          const res = await submitForm02(packet.id, formDataRef.current as Prisma.InputJsonObject);
                          if (res && res.success === false) {
                            toast.error(typeof res.error === 'string' ? res.error : 'We could not save the consent form. Please try again.');
                            return;
                          }
                          setIsForm2Submitted(true);
                        }
                        if (isLastSection) {
                          if (overallComplete) {
                            await handleFinalSubmit();
                          }
                        } else {
                          handleNext();
                        }
                      })}
                      className="btn btn-primary cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      {form02CompletedCount < form02TotalCount ? 'Complete Consent to continue' : (isLastSection ? 'Submit Updates' : 'Continue to Uploads →')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeMacro === 'docs' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <DocumentUploads formData={formData} handleBlur={handleBlur} rejectionDetails={rejectionDetails} isRejectionMode={isRejectionMode} />
                <div className="step-nav flex items-center justify-between gap-3 flex-wrap">
                  {activeIndex > 0 && <button type="button" onClick={handlePrev} className="btn btn-ghost cursor-pointer">← Back</button>}
                  {activeIndex === 0 && <div></div>}
                  <div className="flex items-center gap-3">
                    {docsMissing.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsWhatsLeftOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#FFF5ED] border border-[#FFD8C2] text-[#EA580C] hover:bg-orange-100 hover:border-orange-300 font-bold text-xs sm:text-sm transition cursor-pointer shadow-xs"
                      >
                        <ListChecks className="w-4 h-4 text-[#EA580C] shrink-0" />
                        <span>Click to see what&apos;s left ({docsMissing.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!overallComplete || isSubmitting}
                      onClick={() => {
                        if (!overallComplete) return;
                        startTransition(async () => {
                          await handleBlur('sig1Date', new Date().toISOString());
                          await handleFinalSubmit();
                        });
                      }}
                      className="btn btn-primary cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      {overallComplete ? (isCorrectionPass ? 'Submit Updates' : 'Submit Secure Packet') : 'Complete sections to submit'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* What's Left to Complete Modal */}
      {isWhatsLeftOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setIsWhatsLeftOpen(false)}
        >
          <div
            className="bg-white border-2 border-orange-400/80 rounded-2xl p-6 shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col my-auto relative animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E2D5B7] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFF5ED] border border-[#FFD8C2] text-[#EA580C] flex items-center justify-center font-bold">
                  <ListChecks className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-heading">What&apos;s Left to Complete</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Click any item below to jump directly to that required field
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWhatsLeftOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Missing Items Summary Badge */}
            <div className="my-3 px-3.5 py-2.5 bg-[#FFF5ED] border border-[#FFD8C2] rounded-xl flex items-center justify-between text-xs font-mono shrink-0">
              <span className="text-slate-700 font-medium">
                {activeMissingList.length === 0 ? '✓ Current section is complete!' : `⚠️ ${activeMissingList.length} required field${activeMissingList.length === 1 ? '' : 's'} remaining in this section`}
              </span>
              {activeMissingList.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleJumpToField(activeMissingList[0])}
                  className="text-[#EA580C] hover:underline font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Jump to Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Missing Items List */}
            <div className="overflow-y-auto pr-1 space-y-2 flex-1 my-2 divide-y divide-slate-100">
              {activeMissingList.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-2 font-bold text-lg">
                    ✓
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">All required fields completed!</h4>
                  <p className="text-xs text-slate-500 mt-1">You are ready to proceed to the next step.</p>
                </div>
              ) : (
                activeMissingList.map((key, idx) => {
                  const meta = FIELD_METADATA[key] || { label: key, macroId: activeMacro };
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleJumpToField(key)}
                      className="w-full text-left p-3 rounded-xl bg-white hover:bg-[#FFF5ED] border border-[#E2D5B7]/60 hover:border-orange-400 transition flex items-center justify-between group cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                        <div className="w-6 h-6 rounded-lg bg-orange-100/60 text-[#EA580C] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#EA580C] transition-colors truncate">
                            {meta.label}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#EA580C] bg-[#FFF5ED] px-2.5 py-1 rounded-lg shrink-0 group-hover:bg-[#EA580C] group-hover:text-white transition-colors">
                        <span>Fill Out</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#E2D5B7] flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsWhatsLeftOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
              {activeMissingList.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleJumpToField(activeMissingList[0])}
                  className="px-4 py-2 bg-gradient-to-r from-[#EA580C] to-amber-500 hover:from-[#C2410C] hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>Jump to Missing Field</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// The UI Helpers were moved to FormUIHelpers.tsx
