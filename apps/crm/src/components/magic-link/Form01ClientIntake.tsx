import React, { useState, useRef, useEffect, useContext } from 'react';
import { SectionCard, AutoSaveInput, AutoSaveTextArea, AutoSaveSelect, AutoSaveRadio, AutoSaveCheckbox, AutoSaveDateInput, AutoSaveLanguageSelect, AdminReviewContext, FieldWrapper, ReadOnlyDisplay } from './FormUIHelpers';
import { AutoSaveAddressInput } from './AutoSaveAddressInput';
import type { IntakeAddressParts } from '@/lib/intakeAddressPrivacy';
import {
  User, Shield, Activity, Stethoscope,
  FileText, ClipboardList, Heart, Clock, AlertTriangle,
  CheckCircle2, XCircle,
  Users, Smile, PenLine, BadgeCheck
} from 'lucide-react';

type IntakeFormData = Record<string, string>;

type IntakeClientSummary = {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  insurancePayer?: string | null;
  memberId?: string | null;
  medicaidId?: string | null;
};

type IntakeFieldUpdate = string | Record<string, string>;
type IntakeFieldChange = (fieldId: IntakeFieldUpdate, value?: string | boolean | string[]) => unknown;

type Form01ClientIntakeProps = {
  formData: Record<string, unknown>;
  handleBlur?: IntakeFieldChange;
  client: object;
  readOnly?: boolean;
  isRejectionMode?: boolean;
  adminReviewMode?: boolean;
  rejectedFields?: string[];
  stagedRejections?: string[];
  onRejectField?: (fieldId: string) => void;
};

// ─────────────────────────────────────────────────────────
// Helpers for the read-only summary layout
// ─────────────────────────────────────────────────────────

function fmt24(val?: string): string {
  if (!val) return '';
  const [h24Str, mStr] = val.split(':');
  const h24 = parseInt(h24Str, 10);
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = (h24 % 12 || 12).toString();
  return `${h12}:${mStr} ${ampm}`;
}

function RoField({ label, value, mono = false }: { label: string; value?: unknown; mono?: boolean }) {
  const isEmpty = value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 font-mono">{label}</span>
      <span className={`text-sm font-semibold text-slate-800 break-words leading-snug ${mono ? 'font-mono' : ''}`}>
        {isEmpty
          ? <span className="text-slate-300 italic font-normal text-xs">—</span>
          : (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (Array.isArray(value) ? value.join(', ') : String(value)))
        }
      </span>
    </div>
  );
}

function RoSection({ icon, title, accent = '#EA580C', children }: {
  icon: React.ReactNode;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderLeft: `3px solid ${accent}` }} className="bg-white rounded-2xl border border-[#E2D5B7] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 bg-[#F9F5EC] border-b border-[#E2D5B7]">
        <span className="text-[#EA580C]">{icon}</span>
        <span className="font-bold text-slate-800 text-sm font-mono uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function RoGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className={`grid gap-x-6 gap-y-4 ${cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {children}
    </div>
  );
}

function RoDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      {label && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono whitespace-nowrap">{label}</span>}
      <div className="flex-1 h-px bg-[#E2D5B7]" />
    </div>
  );
}

function RoBadge({ value, trueColor = 'text-green-700 bg-green-50 border-green-200', falseColor = 'text-slate-500 bg-slate-50 border-slate-200' }: {
  value?: string | boolean | null;
  trueColor?: string;
  falseColor?: string;
}) {
  if (value === undefined || value === null || value === '') return <span className="text-slate-300 italic text-xs">—</span>;
  const isPositive = value === true || value === 'Yes' || String(value).startsWith('Yes');
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${isPositive ? trueColor : falseColor}`}>
      {isPositive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// Main read-only summary component
// ─────────────────────────────────────────────────────────

function Form01ReadOnlySummary({ formData, client }: { formData: IntakeFormData; client: IntakeClientSummary }) {
  const fd = formData;

  const hasMedicaid = fd['hasMedicaid'] && fd['hasMedicaid'] !== 'No' && fd['hasMedicaid'] !== 'Not Sure';
  const hasSecondPlan = fd['hasSecondPlan'] === 'Yes';
  const hasDiagnosis = fd['hasDiagnosis'] === 'Yes' || fd['hasDiagnosis'] === 'Evaluation Scheduled';
  const hasReferral = fd['hasReferral'] === 'Yes - Attached' || fd['hasReferral'] === 'Yes - Will Provide';
  const hasPriorABA = fd['hasPriorABA'] === 'Yes';
  const isHomeLocation = fd['prefLocation'] === 'Home';
  const hasPets = fd['hasPets'] === 'Yes';
  const custodyType = fd['custodyType'];

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const availDays = DAYS.filter(d => fd[`avail_${d}_from`] || fd[`avail_${d}_to`]);

  return (
    <div className="space-y-4 p-6 max-w-4xl mx-auto">

      {/* Locked Banner */}
      <div className="flex items-center gap-3 bg-[#FFF5ED] border border-[#FFD8C2] rounded-2xl px-5 py-3.5 shadow-sm">
        <BadgeCheck className="w-5 h-5 text-[#EA580C] flex-shrink-0" />
        <div>
          <p className="text-[#C2410C] font-bold text-sm">Form Submitted — Pending Clinic Review</p>
          <p className="text-slate-500 text-xs mt-0.5">This form is locked. Fields are shown in read-only mode.</p>
        </div>
      </div>

      {/* A. Child Information */}
      <RoSection icon={<User className="w-4 h-4" />} title="A. Child Information">
        <RoGrid>
          <RoField label="First Name" value={fd['childFirstName'] || client?.firstName} />
          <RoField label="Last Name" value={fd['childLastName'] || client?.lastName} />
          <RoField label="Middle Name" value={fd['childMiddleName']} />
          <RoField label="Preferred Name / Nickname" value={fd['preferredName']} />
          <RoField label="Date of Birth" value={fd['dob'] || client?.dateOfBirth?.split('T')[0]} />
          <RoField label="Sex Assigned at Birth" value={fd['sexAtBirth']} />
          <RoField label="Lives with Parents?" value={fd['childLivesWithParents'] !== undefined ? (fd['childLivesWithParents'] ? 'Yes' : 'No') : undefined} />
          {!fd['childLivesWithParents'] && <RoField label="Child's Home Address" value={fd['childAddress']} />}
          <RoField label="Primary Language" value={fd['primaryLang']} />
          <RoField label="Other Language(s)" value={fd['otherLang']} />
        </RoGrid>
        <RoDivider label="Medical &amp; History" />
        <RoGrid>
          <RoField label="Allergies" value={fd['allergies']} />
          <RoField label="Current Medications" value={fd['meds']} />
          <div className="sm:col-span-2"><RoField label="Medical Conditions" value={fd['medConditions']} /></div>
          <RoField label="History of Elopement" value={fd['elopement']} />
          <RoField label="Dietary Restrictions" value={fd['diet']} />
        </RoGrid>
      </RoSection>

      {/* B. Parent / Guardian Information */}
      <RoSection icon={<Users className="w-4 h-4" />} title="B. Parent / Guardian Information">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#EA580C] mb-3 font-mono">Guardian 1 — Primary Contact</p>
        <RoGrid>
          <RoField label="Full Name" value={fd['g1Name'] || [fd['g1FirstName'], fd['g1LastName']].filter(Boolean).join(' ') || client?.guardianName} />
          <RoField label="Relationship to Child" value={fd['g1Relation']} />
          <RoField label="Mobile Phone" value={fd['g1Phone'] || client?.guardianPhone} />
          <RoField label="Email Address" value={fd['g1Email'] || client?.guardianEmail} />
          <RoField label="Preferred Contact Method" value={fd['g1ContactPref']} />
          <RoField label="Best Times to Reach" value={fd['g1BestTimes']} />
          <div className="sm:col-span-2"><RoField label="Address" value={fd['g1Address']} /></div>
        </RoGrid>
        {(fd['g2FirstName'] || fd['g2Name']) && (
          <>
            <RoDivider label="Guardian 2 (Optional)" />
            <RoGrid>
              <RoField label="Full Name" value={fd['g2Name'] || [fd['g2FirstName'], fd['g2LastName']].filter(Boolean).join(' ')} />
              <RoField label="Relationship to Child" value={fd['g2Relation']} />
              <RoField label="Mobile Phone" value={fd['g2Phone']} />
              <RoField label="Email Address" value={fd['g2Email']} />
              {fd['g2Address'] && <div className="sm:col-span-2"><RoField label="Address" value={fd['g2Address']} /></div>}
            </RoGrid>
          </>
        )}
      </RoSection>

      {/* C. Legal Custody */}
      <RoSection icon={<Shield className="w-4 h-4" />} title="C. Legal Custody &amp; Guardianship">
        <RoGrid>
          <RoField label="Legal Custody Type" value={custodyType} />
          <RoField label="Custody Document Status" value={fd['custodyDocAttached']} />
          {custodyType && custodyType !== 'Both Parents' && (
            <div className="sm:col-span-2"><RoField label="Court-Ordered Custody Limits" value={fd['custodyLimits']} /></div>
          )}
          {fd['nonParentConsenter'] && (
            <div className="sm:col-span-2"><RoField label="Non-Parent Consenter" value={fd['nonParentConsenter']} /></div>
          )}
        </RoGrid>
      </RoSection>

      {/* D. Primary Insurance */}
      <RoSection icon={<FileText className="w-4 h-4" />} title="D. Primary Insurance">
        <RoGrid>
          <RoField label="Insurance Company" value={fd['priInsCompany'] || client?.insurancePayer} />
          <RoField label="Plan Name" value={fd['priInsPlan']} />
          <RoField label="Member ID" value={fd['priInsMemberId'] || client?.memberId} mono />
          <RoField label="Group Number" value={fd['priInsGroup']} mono />
        </RoGrid>
        <RoDivider label="Policyholder" />
        <RoGrid>
          <RoField label="Policyholder Name" value={fd['priInsHolderName'] || [fd['priInsHolderFirstName'], fd['priInsHolderLastName']].filter(Boolean).join(' ')} />
          <RoField label="Relationship to Child" value={fd['priInsHolderRel']} />
          <RoField label="Date of Birth" value={fd['priInsHolderDob']} />
          <RoField label="Coverage Effective Date" value={fd['priInsEffective']} />
          <RoField label="Member Services Phone" value={fd['priInsPhone']} />
          <RoField label="Employer" value={fd['priInsEmployer']} />
        </RoGrid>
      </RoSection>

      {/* E. Secondary Insurance */}
      <RoSection icon={<FileText className="w-4 h-4" />} title="E. Secondary Insurance" accent="#6366f1">
        <div className="mb-3">
          <span className="text-xs text-slate-600 font-semibold">Secondary Insurance: </span>
          <RoBadge value={fd['hasSecondPlan']} />
        </div>
        {hasSecondPlan && (
          <RoGrid>
            <RoField label="Insurance Company" value={fd['secInsCompany']} />
            <RoField label="Member ID" value={fd['secInsMemberId']} mono />
            <RoField label="Group Number" value={fd['secInsGroup']} mono />
            <RoField label="Coverage Effective Date" value={fd['secInsEffective']} />
          </RoGrid>
        )}
      </RoSection>

      {/* F. Medicaid */}
      <RoSection icon={<Activity className="w-4 h-4" />} title="F. Medicaid" accent="#0d9488">
        <div className="mb-3">
          <span className="text-xs text-slate-600 font-semibold">Medicaid: </span>
          <RoBadge value={fd['hasMedicaid']} />
        </div>
        {hasMedicaid && (
          <RoGrid>
            {fd['medicaidStateOther'] && <RoField label="State" value={fd['medicaidStateOther']} />}
            <RoField label="Medicaid ID / CIN" value={fd['medicaidId'] || client?.medicaidId} mono />
            <RoField label="MCO / Plan Name" value={fd['medicaidMCO']} />
            <RoField label="Ever Lapsed / Required Renewal?" value={fd['medicaidLapsed']} />
            {fd['medicaidRenewal'] && <RoField label="Renewal / Recertification Date" value={fd['medicaidRenewal']} />}
          </RoGrid>
        )}
      </RoSection>

      {/* G. PCP */}
      <RoSection icon={<Stethoscope className="w-4 h-4" />} title="G. Primary Care Physician (PCP)" accent="#2563eb">
        <RoGrid>
          <RoField label="PCP Name" value={fd['pcpName']} />
          <RoField label="Practice Name" value={fd['pcpPractice']} />
          <RoField label="Phone" value={fd['pcpPhone']} />
          <RoField label="Fax" value={fd['pcpFax']} />
          <div className="sm:col-span-2"><RoField label="Practice Address" value={fd['pcpAddress']} /></div>
          <RoField label="Most Recent Well Visit" value={fd['pcpLastVisit']} />
        </RoGrid>
      </RoSection>

      {/* H. Diagnosis */}
      <RoSection icon={<ClipboardList className="w-4 h-4" />} title="H. Diagnosis &amp; Diagnosing Provider" accent="#7c3aed">
        <div className="mb-3">
          <span className="text-xs text-slate-600 font-semibold">ASD Diagnosis: </span>
          <RoBadge value={fd['hasDiagnosis']} />
        </div>
        {hasDiagnosis && (
          <RoGrid>
            <div className="sm:col-span-2"><RoField label="Diagnosis (as written on report)" value={fd['diagnosisText']} /></div>
            <RoField label="Date of Initial Diagnosis" value={fd['dxInitialDate']} />
            <RoField label="Date of Most Recent Evaluation" value={fd['dxRecentDate']} />
            <RoField label="Diagnosing Provider" value={fd['dxProviderName']} />
            <RoField label="Credentials" value={fd['dxCredentials']} />
            <RoField label="Practice Name" value={fd['dxPractice']} />
            <RoField label="Phone" value={fd['dxPhone']} />
            {fd['dxCooccurring'] && <div className="sm:col-span-2"><RoField label="Co-Occurring Diagnoses" value={fd['dxCooccurring']} /></div>}
          </RoGrid>
        )}
        {fd['hasDiagnosis'] === 'Evaluation Scheduled' && fd['evalDate'] && (
          <RoField label="Scheduled Evaluation Date" value={fd['evalDate']} />
        )}
      </RoSection>

      {/* I. Referral */}
      <RoSection icon={<FileText className="w-4 h-4" />} title="I. Referral / Prescription for ABA" accent="#ea580c">
        <div className="mb-3">
          <span className="text-xs text-slate-600 font-semibold">Written Referral: </span>
          <RoBadge value={fd['hasReferral']} />
        </div>
        {hasReferral && (
          <RoGrid>
            <RoField label="Referring Provider" value={fd['referralProvider']} />
            <RoField label="Date of Referral" value={fd['referralDate']} />
            <RoField label="Referral Expires?" value={fd['referralExpires']} />
            {fd['referralExpires'] === 'Yes' && <RoField label="Expiration Date" value={fd['referralExpDate']} />}
          </RoGrid>
        )}
      </RoSection>

      {/* J. Current & Prior Services */}
      <RoSection icon={<Heart className="w-4 h-4" />} title="J. Current &amp; Prior Services" accent="#dc2626">
        <div className="mb-3">
          <span className="text-xs text-slate-600 font-semibold">Prior ABA Therapy: </span>
          <RoBadge value={fd['hasPriorABA']} />
        </div>
        {hasPriorABA && fd['priorABAInfo'] && (
          <div className="mb-4">
            <RoField label="Prior ABA Details" value={fd['priorABAInfo']} />
          </div>
        )}
        <RoDivider label="Current Services" />
        {fd['currentServices'] && Array.isArray(fd['currentServices']) && fd['currentServices'].length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {(fd['currentServices'] as string[]).map((s) => (
              <span key={s} className="text-xs font-bold px-3 py-1 rounded-full bg-[#FFF5ED] border border-[#FFD8C2] text-[#C2410C]">{s}</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-300 italic mb-4">No current services listed</p>
        )}
        <RoGrid>
          <RoField label="School / Program Name" value={fd['schoolName']} />
          <RoField label="Grade" value={fd['schoolGrade']} />
          <RoField label="IEP / IFSP Status" value={fd['hasIEP']} />
          {fd['serviceCoordinator'] && <div className="sm:col-span-2"><RoField label="Service Coordinator / Care Manager" value={fd['serviceCoordinator']} /></div>}
        </RoGrid>
      </RoSection>

      {/* K. Goals */}
      <RoSection icon={<Smile className="w-4 h-4" />} title="K. Goals &amp; Priorities" accent="#f59e0b">
        <div className="space-y-4">
          <RoField label="ABA Goals (in parent's own words)" value={fd['abaGoals']} />
          <RoField label="Unsafe / Challenging Behaviors" value={fd['unsafeBehaviors']} />
          <RoField label="Child's Interests (Activities, Toys, Foods)" value={fd['childInterests']} />
        </div>
      </RoSection>

      {/* L. Availability & Service Location */}
      <RoSection icon={<Clock className="w-4 h-4" />} title="L. Availability &amp; Service Location" accent="#0891b2">
        <div className="mb-4">
          <span className="text-xs text-slate-600 font-semibold">Preferred Location: </span>
          <span className="ml-1 text-sm font-bold text-slate-800">{fd['prefLocation'] || <span className="text-slate-300 italic font-normal text-xs">—</span>}</span>
        </div>
        {isHomeLocation && (
          <div className="bg-[#F9F5EC] rounded-xl border border-[#E2D5B7] p-4 mb-5">
            <RoGrid>
              <RoField label="Quiet Space Available?" value={fd['quietSpace']} />
              <RoField label="Pets in Home?" value={fd['hasPets']} />
              {hasPets && <RoField label="Pet Types" value={fd['petTypes']} />}
              <div className="sm:col-span-2"><RoField label="Others Typically Home During Session" value={fd['othersHome']} /></div>
            </RoGrid>
          </div>
        )}
        {availDays.length > 0 && (
          <>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-2">Weekly Availability</p>
            <div className="rounded-xl border border-[#E2D5B7] overflow-hidden">
              <div className="grid grid-cols-3 bg-[#F9F5EC] px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-500 font-mono border-b border-[#E2D5B7]">
                <span>Day</span><span>From</span><span>Until</span>
              </div>
              {availDays.map(day => (
                <div key={day} className="grid grid-cols-3 px-4 py-2.5 border-b border-[#E2D5B7]/60 last:border-0 hover:bg-[#FFFDF8] transition-colors">
                  <span className="text-sm font-bold text-slate-800">{day}</span>
                  <span className="text-sm text-slate-600 font-mono">{fmt24(fd[`avail_${day}_from`]) || '—'}</span>
                  <span className="text-sm text-slate-600 font-mono">{fmt24(fd[`avail_${day}_to`]) || '—'}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {availDays.length === 0 && (
          <p className="text-xs text-slate-300 italic">No availability entered</p>
        )}
      </RoSection>

      {/* M. Emergency Contacts */}
      <RoSection icon={<AlertTriangle className="w-4 h-4" />} title="M. Emergency Contacts" accent="#dc2626">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#EA580C] mb-3 font-mono">Contact 1</p>
        <RoGrid cols={3}>
          <RoField label="Name" value={fd['em1Name']} />
          <RoField label="Relationship" value={fd['em1Rel']} />
          <RoField label="Phone" value={fd['em1Phone']} />
        </RoGrid>
        {(fd['em2Name'] || fd['em2Phone']) && (
          <>
            <RoDivider label="Contact 2" />
            <RoGrid cols={3}>
              <RoField label="Name" value={fd['em2Name']} />
              <RoField label="Relationship" value={fd['em2Rel']} />
              <RoField label="Phone" value={fd['em2Phone']} />
            </RoGrid>
          </>
        )}
        <RoDivider />
        <RoGrid>
          <RoField label="Medical Decision Permission?" value={fd['emPermission']} />
          <RoField label="Preferred Hospital" value={fd['prefHospital']} />
        </RoGrid>
      </RoSection>

      {/* O. Attestation */}
      <RoSection icon={<PenLine className="w-4 h-4" />} title="O. Parent / Guardian Attestation" accent="#16a34a">
        <RoGrid>
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 font-mono mb-1">Attestation Agreed?</p>
            <RoBadge value={fd['attestationAgree']} trueColor="text-green-700 bg-green-50 border-green-200" falseColor="text-red-700 bg-red-50 border-red-200" />
          </div>
          <RoField label="Date Signed" value={fd['attestationDate']} />
        </RoGrid>
        {fd['attestationName'] && (
          <div className="mt-4">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 font-mono mb-2">Electronic Signature</p>
            <div className="bg-[#FFF5ED] border border-[#FFD8C2] rounded-2xl px-6 py-4 inline-block">
              <span className="text-[#EA580C] text-3xl" style={{ fontFamily: '"Dancing Script", cursive' }}>
                {fd['attestationName']}
              </span>
            </div>
          </div>
        )}
      </RoSection>

    </div>
  );
}

function SplitTimePicker({ value, onChange, hasError, fieldId }: { value?: string, onChange: (val: string) => void, hasError?: boolean, fieldId: string }) {
  const { readOnly, adminReviewMode } = useContext(AdminReviewContext);
  const [active, setActive] = useState<'HH' | 'MM' | 'AMPM' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  let h12 = '12';
  let min = '00';
  let ampm = 'PM';

  if (value) {
    const [h24Str, mStr] = value.split(':');
    const h24 = parseInt(h24Str, 10);
    min = mStr;
    ampm = h24 >= 12 ? 'PM' : 'AM';
    h12 = (h24 % 12 || 12).toString();
  }

  const handleChange = (newH12: string, newMin: string, newAmpm: string) => {
    let h24 = parseInt(newH12, 10);
    if (newAmpm === 'PM' && h24 !== 12) h24 += 12;
    if (newAmpm === 'AM' && h24 === 12) h24 = 0;
    const val24 = `${h24.toString().padStart(2, '0')}:${newMin}`;
    onChange(val24);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (readOnly && !adminReviewMode) {
    const displayValue = value ? `${h12}:${min} ${ampm}` : '';
    return <ReadOnlyDisplay label="Time" value={displayValue} />;
  }

  return (
    <FieldWrapper fieldId={fieldId}>
      <div ref={containerRef} className="relative inline-block w-full max-w-[200px]">
        <button
          type="button"
          onClick={() => setActive(active ? null : 'HH')}
          className={`flex items-center justify-center gap-1.5 bg-white border rounded-xl p-2 w-full hover:bg-[#F9F5EC] hover:border-orange-300 transition-all cursor-pointer shadow-xs ${hasError ? 'border-red-500 bg-red-50/50 ring-1 ring-red-500/20' : 'border-[#E2D5B7]'}`}
        >
          <span className={`text-slate-900 text-sm font-mono font-bold ${!value ? 'opacity-50' : ''} ${active === 'HH' ? 'text-[#EA580C] bg-orange-100 px-2 py-0.5 rounded-lg' : 'px-2'}`}>
            {value ? h12 : 'HH'}
          </span>
          <span className="text-slate-400 font-bold">:</span>
          <span className={`text-slate-900 text-sm font-mono font-bold ${!value ? 'opacity-50' : ''} ${active === 'MM' ? 'text-[#EA580C] bg-orange-100 px-2 py-0.5 rounded-lg' : 'px-2'}`}>
            {value ? min : 'MM'}
          </span>
          <div className="w-[1px] h-4 bg-slate-200 mx-1"></div>
          <span className={`font-bold text-sm ${!value ? 'opacity-50 text-[#EA580C]' : 'text-[#EA580C]'} ${active === 'AMPM' ? 'text-white bg-[#EA580C] px-2 py-0.5 rounded-lg' : 'px-2'}`}>
            {value ? ampm : '--'}
          </span>
        </button>

        {active === 'HH' && (
          <div className="absolute top-full left-0 mt-2 p-3 bg-white border border-[#E2D5B7] rounded-2xl shadow-2xl z-50 w-[200px] grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => {
              const hStr = h.toString();
              return (
                <button
                  key={`h-${h}`}
                  type="button"
                  onClick={() => {
                    handleChange(hStr, min, ampm);
                    setActive('MM');
                  }}
                  className={`text-sm py-1.5 rounded-xl hover:bg-[#F9F5EC] cursor-pointer ${hStr === h12 ? 'bg-[#EA580C] text-white font-bold' : 'text-slate-700'}`}
                >
                  {hStr}
                </button>
              );
            })}
          </div>
        )}

        {active === 'MM' && (
          <div className="absolute top-full left-0 mt-2 p-3 bg-white border border-[#E2D5B7] rounded-2xl shadow-2xl z-50 w-[200px] grid grid-cols-2 gap-2">
            {['00','15','30','45'].map(m => (
              <button
                key={`m-${m}`}
                type="button"
                onClick={() => {
                  handleChange(h12, m, ampm);
                  setActive('AMPM');
                }}
                className={`text-sm py-1.5 rounded-xl hover:bg-[#F9F5EC] cursor-pointer ${m === min ? 'bg-[#EA580C] text-white font-bold' : 'text-slate-700'}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {active === 'AMPM' && (
          <div className="absolute top-full left-0 mt-2 p-3 bg-white border border-[#E2D5B7] rounded-2xl shadow-2xl z-50 w-[120px] flex flex-col gap-2">
            {['AM', 'PM'].map(a => (
              <button
                key={`a-${a}`}
                type="button"
                onClick={() => {
                  handleChange(h12, min, a);
                  setActive(null);
                }}
                className={`text-sm py-1.5 rounded-xl hover:bg-[#F9F5EC] cursor-pointer ${a === ampm ? 'bg-[#EA580C] text-white font-bold' : 'text-slate-700'}`}
              >
                {a}
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

export function Form01ClientIntake({ formData: rawFormData, handleBlur = () => undefined, client: rawClient, readOnly, isRejectionMode = false, adminReviewMode = false, rejectedFields = [], stagedRejections = [], onRejectField = () => {} }: Form01ClientIntakeProps) {
  const formData = rawFormData as IntakeFormData;
  const client = rawClient as IntakeClientSummary;
  const [timeErrors, setTimeErrors] = useState<Record<string, string>>({});

  // Conditional UI booleans
  const custodyType = formData['custodyType'];
  const hasSecondPlan = formData['hasSecondPlan'] === 'Yes';
  const hasMedicaid = formData['hasMedicaid'] && formData['hasMedicaid'] !== 'No' && formData['hasMedicaid'] !== 'Not Sure';
  const hasMedicaidLapse = formData['medicaidLapsed'] === 'Yes';
  const hasDiagnosis = formData['hasDiagnosis'] === 'Yes' || formData['hasDiagnosis'] === 'Evaluation Scheduled';
  const hasReferral = formData['hasReferral'] === 'Yes - Attached' || formData['hasReferral'] === 'Yes - Will Provide';
  const hasPriorABA = formData['hasPriorABA'] === 'Yes';
  const isHomeLocation = formData['prefLocation'] === 'Home';
  const hasPets = formData['hasPets'] === 'Yes';

  const handleTimeChange = (day: string, fieldId: string, val: string) => {
    // Save to state first
    handleBlur(fieldId, val);

    // Validate the pair for this day
    const isFrom = fieldId.endsWith('_from');
    const fromId = isFrom ? fieldId : `avail_${day}_from`;
    const toId = isFrom ? `avail_${day}_to` : fieldId;

    // We get the other value from either the new val or formData
    const fromVal = isFrom ? val : formData[fromId];
    const toVal = isFrom ? formData[toId] : val;

    if (fromVal && toVal) {
      // Parse "HH:MM"
      const [fH, fM] = fromVal.split(':').map(Number);
      const [tH, tM] = toVal.split(':').map(Number);
      if (fH > tH || (fH === tH && fM >= tM)) {
        setTimeErrors(prev => ({ ...prev, [day]: 'End time must be after start time' }));
      } else {
        setTimeErrors(prev => {
          const next = { ...prev };
          delete next[day];
          return next;
        });
      }
    } else {
      setTimeErrors(prev => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
    }
  };

  // Pure read-only preview — render structured summary instead of the raw form
  if (readOnly && !adminReviewMode) {
    return <Form01ReadOnlySummary formData={formData} client={client} />;
  }

  return (

    <AdminReviewContext.Provider value={{
      adminReviewMode: adminReviewMode || false,
      isRejectionMode: isRejectionMode || false,
      readOnly: readOnly || false,
      rejectedFields: rejectedFields || [],
      stagedRejections: stagedRejections || [],
      onRejectField: onRejectField || (() => {})
    }}>
      <div className={`p-8 max-w-4xl mx-auto space-y-12 form-container`}>
        {readOnly && !adminReviewMode && (
          <div className="mb-6">
            <div className="bg-[#FFF5ED] border border-[#FFD8C2] rounded-2xl p-4 flex items-center gap-3 shadow-xs">
              <span className="text-[#EA580C] font-bold">🔒 Review Needed</span>
              <span className="text-slate-700 text-sm">This form has been submitted and is locked for clinic review.</span>
            </div>
          </div>
        )}
        {!readOnly && !adminReviewMode && isRejectionMode && (
          <div className="mb-6">
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3 shadow-xs">
              <span className="text-[#EA580C] font-bold">⚠️ Changes Needed</span>
              <span className="text-slate-700 text-sm">The clinic has requested changes to specific fields below. Please update them and re-submit this step.</span>
            </div>
          </div>
        )}
        {adminReviewMode && (
          <div className="mb-6">
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3 shadow-xs">
              <span className="text-[#EA580C] font-bold">🕵️ Admin Review Mode</span>
              <span className="text-slate-700 text-sm">Click on any field to reject it. It will be wiped and sent back to the client.</span>
            </div>
          </div>
        )}
        <div className="">
      {/* SECTION A */}
      <div id="sec-a">
        <SectionCard title="A. Child Information">
          <div>
            <div className="field-grid">
              <AutoSaveInput
                label="Child's First Name"
                fieldId="childFirstName"
                defaultValue={formData['childFirstName'] || client.firstName || (formData['childName'] ? formData['childName'].split(' ')[0] : '')}
                onBlur={(fid: string, val: string) => {
                  const last = formData['childLastName'] || client.lastName || '';
                  const full = [val, last].filter(Boolean).join(' ');
                  handleBlur({ [fid]: val, childName: full });
                }}
                required={true}
                placeholder="e.g. Liam"
              />
              <AutoSaveInput
                label="Child's Last Name"
                fieldId="childLastName"
                defaultValue={formData['childLastName'] || client.lastName || (formData['childName'] ? formData['childName'].split(' ').slice(1).join(' ') : '')}
                onBlur={(fid: string, val: string) => {
                  const first = formData['childFirstName'] || client.firstName || '';
                  const full = [first, val].filter(Boolean).join(' ');
                  handleBlur({ [fid]: val, childName: full });
                }}
                required={true}
                placeholder="e.g. Smith"
              />
            </div>
            <div className="field-grid">
              <AutoSaveInput
                label="Middle Name (Optional)"
                fieldId="childMiddleName"
                defaultValue={formData['childMiddleName']}
                onBlur={handleBlur}
                placeholder="e.g. James"
              />
              <AutoSaveInput
                label="Name your child goes by (Preferred / Nickname)"
                fieldId="preferredName"
                defaultValue={formData['preferredName']}
                onBlur={handleBlur}
                placeholder="e.g. LJ"
              />
            </div>
            <div className="field-grid">
              <AutoSaveDateInput label="Date of Birth" type="text" placeholder="MM/DD/YYYY" fieldId="dob" defaultValue={formData['dob'] || client.dateOfBirth?.split('T')[0]} onBlur={handleBlur} required={true} />
              <AutoSaveSelect label="Sex Assigned At Birth" fieldId="sexAtBirth" options={['Male', 'Female']} defaultValue={formData['sexAtBirth']} onBlur={handleBlur} required={true} />
            </div>
            <div className="my-2">
              <AutoSaveCheckbox
                label="Does the child live with their parents/guardians?"
                fieldId="childLivesWithParents"
                currentValue={formData['childLivesWithParents']}
                onChange={handleBlur}
              />
            </div>

            {!formData['childLivesWithParents'] && (
              <AutoSaveAddressInput
                  label="Child's Home Address"
                  fieldId="childAddress"
                  defaultValue={formData['childAddress']}
                  onBlur={handleBlur}
                  required={true}
                  onAddressSelect={(addr: IntakeAddressParts) => {
                    handleBlur({
                      childAddress: [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
                      childCity: addr.city,
                      childState: addr.state,
                      childZip: addr.zip
                    });
                  }}
                />
            )}
            <div className="field-grid">
              <AutoSaveLanguageSelect
                label="Primary Language Spoken at Home"
                fieldId="primaryLang"
                defaultValue={formData['primaryLang']}
                onBlur={handleBlur}
                required={true}
                placeholder="Select primary language..."
              />
              <AutoSaveLanguageSelect
                label="Other Languages Spoken at Home"
                fieldId="otherLang"
                defaultValue={formData['otherLang']}
                onBlur={handleBlur}
                allowNone={true}
                placeholder="Select other language (if any)..."
              />
            </div>
            <div style={{marginTop: '24px'}}>
              <h4>Medical & History</h4>
              <div className="field-grid">
                <AutoSaveTextArea label="Allergies (List or N/A)" fieldId="allergies" defaultValue={formData['allergies']} onBlur={handleBlur} />
                <AutoSaveTextArea label="Current Medications (List or N/A)" fieldId="meds" defaultValue={formData['meds']} onBlur={handleBlur} />
              </div>
              <div className="field-grid">
                <div className="span-2">
                  <AutoSaveTextArea label="Any Medical Conditions? (or N/A)" fieldId="medConditions" defaultValue={formData['medConditions']} onBlur={handleBlur} />
                </div>
              </div>
              <div className="field-grid">
                <AutoSaveRadio label="History of Elopement (Running/Wandering)?" fieldId="elopement" options={['Yes', 'No']} currentValue={formData['elopement']} onChange={handleBlur}  required={true} />
                <AutoSaveInput label="Dietary Restrictions (or N/A)" fieldId="diet" defaultValue={formData['diet']} onBlur={handleBlur} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION B */}
      <div id="sec-b" className="scroll-mt-10">
        <SectionCard title="B. Parent / Guardian Information">
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-4 border-l-2 border-[#EA580C] pl-3 font-mono">Guardian 1 (Primary Contact)</h4>
            <div className="field-grid">
              <AutoSaveInput
                label="Guardian 1 First Name"
                fieldId="g1FirstName"
                defaultValue={formData['g1FirstName'] || (client.guardianName ? client.guardianName.split(' ')[0] : (formData['g1Name'] ? formData['g1Name'].split(' ')[0] : ''))}
                onBlur={(fid: string, val: string) => {
                  const last = formData['g1LastName'] || (client.guardianName ? client.guardianName.split(' ').slice(1).join(' ') : '');
                  const full = [val, last].filter(Boolean).join(' ');
                  handleBlur({ [fid]: val, g1Name: full });
                }}
                required={true}
                placeholder="e.g. Sarah"
              />
              <AutoSaveInput
                label="Guardian 1 Last Name"
                fieldId="g1LastName"
                defaultValue={formData['g1LastName'] || (client.guardianName ? client.guardianName.split(' ').slice(1).join(' ') : (formData['g1Name'] ? formData['g1Name'].split(' ').slice(1).join(' ') : ''))}
                onBlur={(fid: string, val: string) => {
                  const first = formData['g1FirstName'] || (client.guardianName ? client.guardianName.split(' ')[0] : '');
                  const full = [first, val].filter(Boolean).join(' ');
                  handleBlur({ [fid]: val, g1Name: full });
                }}
                required={true}
                placeholder="e.g. Smith"
              />
              <AutoSaveInput label="Relationship to Child" fieldId="g1Relation" defaultValue={formData['g1Relation']} onBlur={handleBlur} placeholder="e.g. Mother, Father, Foster Parent" />
              <AutoSaveInput label="Mobile Phone" type="tel" fieldId="g1Phone" defaultValue={formData['g1Phone'] || client.guardianPhone} onBlur={handleBlur} required={true} placeholder="(555) 000-0000" />
              <AutoSaveInput label="Email Address" type="email" fieldId="g1Email" defaultValue={formData['g1Email'] || client.guardianEmail} onBlur={handleBlur} required={true} placeholder="parent@example.com" />
              <AutoSaveSelect label="Preferred Contact Method" fieldId="g1ContactPref" options={['Phone Call', 'Text Message', 'Email', 'Secure Portal']} defaultValue={formData['g1ContactPref']} onBlur={handleBlur} required={true} />
            </div>
            <AutoSaveAddressInput
              label="Parents Address"
              fieldId="g1Address"
              defaultValue={formData['g1Address']}
              onBlur={handleBlur}
              onAddressSelect={(addr: IntakeAddressParts) => {
                handleBlur('g1Address', [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', '));
              }}
            />
            <div className="mt-4">
              <AutoSaveInput label="Best Times to Reach You" fieldId="g1BestTimes" defaultValue={formData['g1BestTimes']} onBlur={handleBlur} placeholder="e.g. Weekdays after 4 PM" />
            </div>

            <div className="pt-6 mt-6 border-t border-[#E2D5B7]/60">
              <h4 className="text-sm font-bold text-slate-900 mb-4 border-l-2 border-[#EA580C] pl-3 font-mono">Guardian 2 (Optional)</h4>
              <div className="field-grid">
                <AutoSaveInput
                  label="Guardian 2 First Name"
                  fieldId="g2FirstName"
                  defaultValue={formData['g2FirstName'] || (formData['g2Name'] ? formData['g2Name'].split(' ')[0] : '')}
                  onBlur={(fid: string, val: string) => {
                    const last = formData['g2LastName'] || (formData['g2Name'] ? formData['g2Name'].split(' ').slice(1).join(' ') : '');
                    const full = [val, last].filter(Boolean).join(' ');
                    handleBlur({ [fid]: val, g2Name: full });
                  }}
                  placeholder="e.g. David"
                />
                <AutoSaveInput
                  label="Guardian 2 Last Name"
                  fieldId="g2LastName"
                  defaultValue={formData['g2LastName'] || (formData['g2Name'] ? formData['g2Name'].split(' ').slice(1).join(' ') : '')}
                  onBlur={(fid: string, val: string) => {
                    const first = formData['g2FirstName'] || (formData['g2Name'] ? formData['g2Name'].split(' ')[0] : '');
                    const full = [first, val].filter(Boolean).join(' ');
                    handleBlur({ [fid]: val, g2Name: full });
                  }}
                  placeholder="e.g. Smith"
                />
                <AutoSaveInput label="Relationship to Child" fieldId="g2Relation" defaultValue={formData['g2Relation']} onBlur={handleBlur} placeholder="e.g. Father, Step-parent" />
                <AutoSaveInput label="Mobile Phone" type="tel" fieldId="g2Phone" defaultValue={formData['g2Phone']} onBlur={handleBlur} placeholder="(555) 000-0000" />
                <AutoSaveInput label="Email Address" type="email" fieldId="g2Email" defaultValue={formData['g2Email']} onBlur={handleBlur} placeholder="parent2@example.com" />
              </div>
              <AutoSaveAddressInput
                label="Parents Address"
                fieldId="g2Address"
                defaultValue={formData['g2Address']}
                onBlur={handleBlur}
                onAddressSelect={(addr: IntakeAddressParts) => {
                  handleBlur('g2Address', [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', '));
                }}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION C */}
      <div id="sec-c" className="scroll-mt-10">
        <SectionCard title="C. Legal Custody & Guardianship">
          <div>
            <AutoSaveRadio
              label="Who has legal custody of the child?"
              fieldId="custodyType"
              options={['Both Parents', 'Mother Only', 'Father Only', 'Legal Guardian', 'Foster / Kinship Placement', 'Other']}
              currentValue={custodyType}
              onChange={handleBlur}
             required={true} />

            {custodyType && custodyType !== 'Both Parents' && (
              <div className="animate-in fade-in slide-in-from-top-4">
                <AutoSaveTextArea
                  label="If custody is shared or restricted, describe court-ordered limits:"
                  fieldId="custodyLimits"
                  defaultValue={formData['custodyLimits']}
                  onBlur={handleBlur}
                />
              </div>
            )}

            <AutoSaveInput
              label="If the person consenting is NOT a parent, Name & Relationship:"
              fieldId="nonParentConsenter"
              defaultValue={formData['nonParentConsenter']}
              onBlur={handleBlur}
            />

            <AutoSaveRadio
              label="Is there a custody order, guardianship order, or foster placement document?"
              fieldId="custodyDocAttached"
              options={['Yes — Attached', 'Yes — Will Provide', 'No']}
              currentValue={formData['custodyDocAttached']}
              onChange={handleBlur}
             required={true} />
          </div>
        </SectionCard>
      </div>

      {/* SECTION D */}
      <div id="sec-d" className="scroll-mt-10">
        <SectionCard title="D. Primary Insurance">
          <div>
            <div className="field-grid">
              <AutoSaveInput label="Insurance Company Name" fieldId="priInsCompany" defaultValue={formData['priInsCompany'] || client.insurancePayer} onBlur={handleBlur}  required={true} />
              <AutoSaveInput label="Plan Name (if shown)" fieldId="priInsPlan" defaultValue={formData['priInsPlan']} onBlur={handleBlur} />
              <AutoSaveInput label="Member ID (Exactly as printed)" fieldId="priInsMemberId" defaultValue={formData['priInsMemberId'] || client.memberId} onBlur={handleBlur}  required={true} />
              <AutoSaveInput label="Group Number" fieldId="priInsGroup" defaultValue={formData['priInsGroup']} onBlur={handleBlur} />
            </div>
            <div className="pt-4 border-t border-[#E2D5B7]/60">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Policyholder Details</h4>
              <div className="field-grid">
                <AutoSaveInput
                  label="Policyholder First Name"
                  fieldId="priInsHolderFirstName"
                  defaultValue={formData['priInsHolderFirstName'] || (formData['priInsHolderName'] ? formData['priInsHolderName'].split(' ')[0] : '')}
                  onBlur={(fid: string, val: string) => {
                    const last = formData['priInsHolderLastName'] || (formData['priInsHolderName'] ? formData['priInsHolderName'].split(' ').slice(1).join(' ') : '');
                    const full = [val, last].filter(Boolean).join(' ');
                    handleBlur({ [fid]: val, priInsHolderName: full });
                  }}
                  placeholder="e.g. Sarah"
                />
                <AutoSaveInput
                  label="Policyholder Last Name"
                  fieldId="priInsHolderLastName"
                  defaultValue={formData['priInsHolderLastName'] || (formData['priInsHolderName'] ? formData['priInsHolderName'].split(' ').slice(1).join(' ') : '')}
                  onBlur={(fid: string, val: string) => {
                    const first = formData['priInsHolderFirstName'] || (formData['priInsHolderName'] ? formData['priInsHolderName'].split(' ')[0] : '');
                    const full = [first, val].filter(Boolean).join(' ');
                    handleBlur({ [fid]: val, priInsHolderName: full });
                  }}
                  placeholder="e.g. Smith"
                />
                <AutoSaveDateInput label="Policyholder Date of Birth" type="text" placeholder="MM/DD/YYYY" fieldId="priInsHolderDob" defaultValue={formData['priInsHolderDob']} onBlur={handleBlur} />
                <AutoSaveInput label="Relationship to Child" fieldId="priInsHolderRel" defaultValue={formData['priInsHolderRel']} onBlur={handleBlur} placeholder="e.g. Mother, Father" />
                <AutoSaveDateInput label="Coverage Effective Date" type="text" placeholder="MM/DD/YYYY" fieldId="priInsEffective" defaultValue={formData['priInsEffective']} onBlur={handleBlur} />
                <AutoSaveInput label="Member Services Phone (on back of card)" type="tel" fieldId="priInsPhone" defaultValue={formData['priInsPhone']} onBlur={handleBlur} placeholder="(555) 000-0000" />
                <AutoSaveInput label="Employer (if plan is through work)" fieldId="priInsEmployer" defaultValue={formData['priInsEmployer']} onBlur={handleBlur} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION E */}
      <div id="sec-e" className="scroll-mt-10">
        <SectionCard title="E. Secondary Insurance">
          <div>
            <AutoSaveRadio
              label="Does the child have secondary insurance?"
              fieldId="hasSecondPlan"
              options={['Yes', 'No']}
              currentValue={formData['hasSecondPlan']}
              onChange={handleBlur}
             required={true} />
            {hasSecondPlan && (
              <div className="field-grid">
                <AutoSaveInput label="Insurance Company Name" fieldId="secInsCompany" defaultValue={formData['secInsCompany']} onBlur={handleBlur} />
                <AutoSaveInput label="Member ID" fieldId="secInsMemberId" defaultValue={formData['secInsMemberId']} onBlur={handleBlur} />
                <AutoSaveInput label="Group Number" fieldId="secInsGroup" defaultValue={formData['secInsGroup']} onBlur={handleBlur} />
                <AutoSaveDateInput label="Coverage Effective Date" type="text" placeholder="MM/DD/YYYY" fieldId="secInsEffective" defaultValue={formData['secInsEffective']} onBlur={handleBlur} />
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* SECTION F */}
      <div id="sec-f" className="scroll-mt-10">
        <SectionCard title="F. Medicaid">
          <div>
            <AutoSaveRadio
              label="Does your child have Medicaid?"
              fieldId="hasMedicaid"
              options={['Yes, New York', 'Yes, New Jersey', 'Yes, Other State', 'No', 'Not Sure']}
              currentValue={formData['hasMedicaid']}
              onChange={handleBlur}
             required={true} />

            {hasMedicaid && (
              <div className="space-y-6 pt-4 border-t border-[#E2D5B7]/60 animate-in fade-in slide-in-from-top-4">
                {formData['hasMedicaid'] === 'Yes, Other State' && (
                  <AutoSaveInput label="Which State?" fieldId="medicaidStateOther" defaultValue={formData['medicaidStateOther']} onBlur={handleBlur} />
                )}
                <div className="field-grid">
                  <AutoSaveInput label="Medicaid ID / CIN" fieldId="medicaidId" defaultValue={formData['medicaidId'] || client.medicaidId} onBlur={handleBlur} />
                  <AutoSaveInput label="MCO / Plan Name (e.g. Fidelis, Healthfirst)" fieldId="medicaidMCO" defaultValue={formData['medicaidMCO']} onBlur={handleBlur}  required={true} />
                </div>

                <AutoSaveRadio
                  label="Has your child's Medicaid ever lapsed or required renewal?"
                  fieldId="medicaidLapsed"
                  options={['Yes', 'No', 'Not Sure']}
                  currentValue={formData['medicaidLapsed']}
                  onChange={handleBlur}
                />

                {hasMedicaidLapse && (
                  <AutoSaveDateInput label="Renewal / Recertification Date, if known" placeholder="MM/DD/YYYY" fieldId="medicaidRenewal" defaultValue={formData['medicaidRenewal']} onBlur={handleBlur} className="w-1/2" />
                )}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* SECTION G */}
      <div id="sec-g" className="scroll-mt-10">
        <SectionCard title="G. Primary Care Physician (PCP)">
          <div>
            <p className="text-slate-600 text-sm mb-4 font-medium">Some plans require a PCP referral as a condition of coverage. We may also need to coordinate care.</p>
            <div className="field-grid">
              <AutoSaveInput label="PCP Name" fieldId="pcpName" defaultValue={formData['pcpName']} onBlur={handleBlur} />
              <AutoSaveInput label="Practice Name" fieldId="pcpPractice" defaultValue={formData['pcpPractice']} onBlur={handleBlur} />
              <AutoSaveInput label="Phone" type="tel" fieldId="pcpPhone" defaultValue={formData['pcpPhone']} onBlur={handleBlur} />
              <AutoSaveInput label="Fax" type="tel" fieldId="pcpFax" defaultValue={formData['pcpFax']} onBlur={handleBlur} />
            </div>
            <AutoSaveAddressInput
              label="Practice Address"
              fieldId="pcpAddress"
              defaultValue={formData['pcpAddress']}
              onBlur={handleBlur}
              onAddressSelect={(addr: IntakeAddressParts) => {
                handleBlur('pcpAddress', [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', '));
              }}
            />
            <AutoSaveDateInput label="Date of your child's most recent well visit" placeholder="MM/DD/YYYY" fieldId="pcpLastVisit" defaultValue={formData['pcpLastVisit']} onBlur={handleBlur} className="w-1/2" />
          </div>
        </SectionCard>
      </div>

      {/* SECTION H */}
      <div id="sec-h" className="scroll-mt-10">
        <SectionCard title="H. Diagnosis & Diagnosing Provider">
          <div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
              <p className="text-orange-950 text-sm font-medium">Insurance will not authorize ABA without a qualifying diagnosis from a qualified evaluator. If your child has not yet been formally diagnosed, tell us — we will help you find an evaluator. Please do not leave this blank.</p>
            </div>

            <AutoSaveRadio
              label="Has the child been diagnosed with Autism Spectrum Disorder (ASD)?"
              fieldId="hasDiagnosis"
              options={['Yes', 'No', 'Evaluation Scheduled']}
              currentValue={formData['hasDiagnosis']}
              onChange={handleBlur}
             required={true} />

            {formData['hasDiagnosis'] === 'Evaluation Scheduled' && (
              <AutoSaveDateInput label="Evaluation Date" placeholder="MM/DD/YYYY" fieldId="evalDate" defaultValue={formData['evalDate']} onBlur={handleBlur} className="w-1/2 animate-in fade-in" />
            )}

            {hasDiagnosis && (
              <div className="space-y-6 pt-4 border-t border-[#E2D5B7]/60 animate-in fade-in slide-in-from-top-4">
                <AutoSaveInput label="Diagnosis exactly as written on the report" fieldId="diagnosisText" defaultValue={formData['diagnosisText']} onBlur={handleBlur} />
                <div className="field-grid">
                  <AutoSaveDateInput label="Date of Initial Diagnosis" placeholder="MM/DD/YYYY" fieldId="dxInitialDate" defaultValue={formData['dxInitialDate']} onBlur={handleBlur} required={true} />
                  <AutoSaveDateInput label="Date of Most Recent Evaluation" placeholder="MM/DD/YYYY" fieldId="dxRecentDate" defaultValue={formData['dxRecentDate']} onBlur={handleBlur} required={true} />
                  <AutoSaveInput label="Diagnosing Provider's Full Name" fieldId="dxProviderName" defaultValue={formData['dxProviderName']} onBlur={handleBlur}  required={true} />
                  <AutoSaveInput label="Credentials (MD / DO / PhD / PsyD / NP)" fieldId="dxCredentials" defaultValue={formData['dxCredentials']} onBlur={handleBlur} />
                  <AutoSaveInput label="Practice Name" fieldId="dxPractice" defaultValue={formData['dxPractice']} onBlur={handleBlur} />
                  <AutoSaveInput label="Phone" type="tel" fieldId="dxPhone" defaultValue={formData['dxPhone']} onBlur={handleBlur} />
                </div>
                <AutoSaveInput label="Any additional (co-occurring) diagnoses — e.g. ADHD, Anxiety, Seizure Disorder — or N/A" fieldId="dxCooccurring" defaultValue={formData['dxCooccurring']} onBlur={handleBlur} />
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* SECTION I */}
      <div id="sec-i" className="scroll-mt-10">
        <SectionCard title="I. Referral / Prescription for ABA">
          <div>
            <AutoSaveRadio
              label="Do you have a written prescription or referral for ABA Therapy from a physician?"
              fieldId="hasReferral"
              options={['Yes - Attached', 'Yes - Will Provide', 'No']}
              currentValue={formData['hasReferral']}
              onChange={handleBlur}
             required={true} />

            {hasReferral && (
              <div className="space-y-6 pt-4 border-t border-[#E2D5B7]/60 animate-in fade-in slide-in-from-top-4">
                <div className="field-grid">
                  <AutoSaveInput label="Referring Provider Name" fieldId="referralProvider" defaultValue={formData['referralProvider']} onBlur={handleBlur}  required={true} />
                  <AutoSaveDateInput label="Date of Referral" placeholder="MM/DD/YYYY" fieldId="referralDate" defaultValue={formData['referralDate']} onBlur={handleBlur}  required={true} />
                </div>

                <AutoSaveRadio
                  label="Does the referral expire?"
                  fieldId="referralExpires"
                  options={['Yes', 'No', 'Not Sure']}
                  currentValue={formData['referralExpires']}
                  onChange={handleBlur}
                 required={true} />

                {formData['referralExpires'] === 'Yes' && (
                  <AutoSaveDateInput label="Expiration Date" placeholder="MM/DD/YYYY" fieldId="referralExpDate" defaultValue={formData['referralExpDate']} onBlur={handleBlur} className="w-1/2 animate-in fade-in" required={true} />
                )}

                <div className="bg-[#FFF5ED] border border-[#FFD8C2] rounded-2xl p-5 mt-6 shadow-xs">
                  <p className="text-[#C2410C] text-sm font-bold mb-2 font-mono uppercase tracking-wider">Note for NY Medicaid Referrals</p>
                  <p className="text-slate-700 text-xs leading-relaxed font-medium">
                    NY Medicaid will not approve ABA unless the referral is signed by a physician, psychologist, or nurse practitioner AND contains all of the following: <br/>
                    • Patient&apos;s age &amp; diagnosis (with date of initial diagnosis)<br/>
                    • Co-morbidities &amp; symptom severity<br/>
                    • Statement confirming patient requires ABA services<br/>
                    • A DSM-5 Diagnostic Checklist
                  </p>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* SECTION J */}
      <div id="sec-j" className="scroll-mt-10">
        <SectionCard title="J. Current & Prior Services">
          <div>
            <AutoSaveRadio
              label="Has the child received ABA Therapy in the past?"
              fieldId="hasPriorABA"
              options={['Yes', 'No']}
              currentValue={formData['hasPriorABA']}
              onChange={handleBlur}
             required={true} />
            {hasPriorABA && (
              <AutoSaveTextArea label="If yes — Provider Name, Dates, and Reason Services Ended" fieldId="priorABAInfo" defaultValue={formData['priorABAInfo']} onBlur={handleBlur} className="animate-in fade-in" />
            )}

            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1 font-mono">Current Services (Check all that apply)</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {['Speech', 'Occupational Therapy', 'Physical Therapy', 'Counseling', 'Early Intervention', 'CPSE / CSE', 'None'].map(srv => {
                  const currentServices = formData['currentServices'] as unknown as string[] | undefined;
                  const isChecked = (currentServices || []).includes(srv);
                  return (
                    <label
                      key={srv}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-[#FFF5ED] border-[#EA580C] text-slate-900 font-bold shadow-xs'
                          : 'bg-white border-[#E2D5B7] text-slate-700 hover:bg-[#F9F5EC]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-[#EA580C] w-4 h-4 cursor-pointer"
                        checked={isChecked}
                        onChange={(e) => {
                          const current = currentServices || [];
                          const updated = e.target.checked ? [...current, srv] : current.filter((x: string) => x !== srv);
                          handleBlur('currentServices', updated);
                        }}
                      />
                      <span className="text-xs font-semibold">{srv}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="field-grid">
              <AutoSaveInput label="School or Program Name" fieldId="schoolName" defaultValue={formData['schoolName']} onBlur={handleBlur} />
              <AutoSaveInput label="Grade" fieldId="schoolGrade" defaultValue={formData['schoolGrade']} onBlur={handleBlur} />
            </div>

            <AutoSaveRadio
              label="Does your child have an IEP or IFSP?"
              fieldId="hasIEP"
              options={['Yes — Attached', 'Yes — Will Provide', 'No']}
              currentValue={formData['hasIEP']}
              onChange={handleBlur}
             required={true} />

            <AutoSaveInput label="Does your child have a Service Coordinator or Care Manager? Name & Agency, or N/A" fieldId="serviceCoordinator" defaultValue={formData['serviceCoordinator']} onBlur={handleBlur} />
          </div>
        </SectionCard>
      </div>

      {/* SECTION K */}
      <div id="sec-k" className="scroll-mt-10">
        <SectionCard title="K. Goals & Priorities">
          <div>
            <p className="text-slate-600 text-sm mb-4 font-medium">In your own words: what would you most like ABA to help your child with? There are no wrong answers.</p>
            <AutoSaveTextArea label="Goals" fieldId="abaGoals" defaultValue={formData['abaGoals']} onBlur={handleBlur} />
            <AutoSaveTextArea label="Are there behaviors that are unsafe for your child or others? Please describe, or write N/A." fieldId="unsafeBehaviors" defaultValue={formData['unsafeBehaviors']} onBlur={handleBlur} />
            <AutoSaveTextArea label="What does your child enjoy? (Activities, toys, foods, characters, music)" fieldId="childInterests" defaultValue={formData['childInterests']} onBlur={handleBlur} />
          </div>
        </SectionCard>
      </div>

      {/* SECTION L */}
      <div id="sec-l" className="scroll-mt-10">
        <SectionCard title="L. Availability & Service Location">
          <div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
              <p className="text-orange-950 text-sm font-medium">Please be specific. &quot;Afternoons&quot; is not enough for us to match a therapist. &quot;Monday, Wednesday, Friday, 3:30-6:30 PM&quot; lets us start scheduling immediately.</p>
            </div>

            <AutoSaveRadio
              label="Where are you looking to receive ABA Services?"
              fieldId="prefLocation"
              options={['Home', 'Community / Daycare / School', 'Clinic', 'Other']}
              currentValue={formData['prefLocation']}
              onChange={handleBlur}
             required={true} />

            {isHomeLocation && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-4 bg-[#F9F5EC] p-6 rounded-2xl border border-[#E2D5B7] my-6">
                <AutoSaveRadio label="Is there a quiet space available?" fieldId="quietSpace" options={['Yes', 'No']} currentValue={formData['quietSpace']} onChange={handleBlur}  required={true} />

                <div className="flex gap-4 items-center">
                  <AutoSaveRadio label="Any pets in the home?" fieldId="hasPets" options={['Yes', 'No']} currentValue={formData['hasPets']} onChange={handleBlur}  required={true} />
                  {hasPets && (
                    <div className="flex-1 mt-4">
                      <AutoSaveInput label="Type(s)" fieldId="petTypes" defaultValue={formData['petTypes']} onBlur={handleBlur} />
                    </div>
                  )}
                </div>

                <AutoSaveInput label="Who else is typically home during session times?" fieldId="othersHome" defaultValue={formData['othersHome']} onBlur={handleBlur}  required={true} />
              </div>
            )}

            <div className="mt-8 border border-[#E2D5B7] rounded-2xl overflow-hidden bg-white shadow-xs">
              <div className="grid grid-cols-3 gap-1 bg-[#F9F5EC] p-4 text-xs font-bold text-slate-600 uppercase tracking-widest border-b border-[#E2D5B7] font-mono">
                <div>Day</div>
                <div>Available From</div>
                <div>Available Until</div>
              </div>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                const fIdFrom = `avail_${day}_from`;
                const fIdTo = `avail_${day}_to`;
                return (
                  <div key={day} className={`p-3 border-b border-[#E2D5B7]/60 hover:bg-[#F9F5EC]/50 transition-colors ${timeErrors[day] ? 'bg-red-50/50' : ''}`}>
                    <div className="grid grid-cols-3 gap-4 items-center">
                      <div className="text-sm text-slate-800 font-bold pl-2">{day}</div>
                      <SplitTimePicker
                        value={formData[fIdFrom]}
                        onChange={(val) => handleTimeChange(day, fIdFrom, val)}
                        hasError={!!timeErrors[day]}
                        fieldId={fIdFrom}
                      />
                      <SplitTimePicker
                        value={formData[fIdTo]}
                        onChange={(val) => handleTimeChange(day, fIdTo, val)}
                        hasError={!!timeErrors[day]}
                        fieldId={fIdTo}
                      />
                    </div>
                    {timeErrors[day] && <div className="text-red-600 text-xs mt-2 pl-2 font-medium">{timeErrors[day]}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION M */}
      <div id="sec-m" className="scroll-mt-10">
        <SectionCard title="M. Emergency Contacts">
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-4 border-l-2 border-[#EA580C] pl-3 font-mono">Contact 1</h4>
            <div className="field-grid three">
              <AutoSaveInput label="Name" fieldId="em1Name" defaultValue={formData['em1Name']} onBlur={handleBlur}  required={true} />
              <AutoSaveInput label="Relationship" fieldId="em1Rel" defaultValue={formData['em1Rel']} onBlur={handleBlur} />
              <AutoSaveInput label="Phone" type="tel" fieldId="em1Phone" defaultValue={formData['em1Phone']} onBlur={handleBlur}  required={true} />
            </div>

            <h4 className="text-sm font-bold text-slate-900 mb-4 mt-6 border-l-2 border-[#EA580C] pl-3 font-mono">Contact 2</h4>
            <div className="field-grid three">
              <AutoSaveInput label="Name" fieldId="em2Name" defaultValue={formData['em2Name']} onBlur={handleBlur} />
              <AutoSaveInput label="Relationship" fieldId="em2Rel" defaultValue={formData['em2Rel']} onBlur={handleBlur} />
              <AutoSaveInput label="Phone" type="tel" fieldId="em2Phone" defaultValue={formData['em2Phone']} onBlur={handleBlur} />
            </div>

            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <AutoSaveRadio
                label="Do these contacts have permission to make medical decisions or schedule appointments on your behalf in your absence?"
                fieldId="emPermission"
                options={['Yes', 'No']}
                currentValue={formData['emPermission']}
                onChange={handleBlur}
               required={true} />
              <div className="mt-6">
                <AutoSaveInput label="Preferred Hospital, if any" fieldId="prefHospital" defaultValue={formData['prefHospital']} onBlur={handleBlur} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION O */}
      <div id="sec-o" className="scroll-mt-10">
        <SectionCard title="O. Parent / Guardian Attestation">
          <div className="space-y-8">
            <p className="text-slate-700 text-sm leading-relaxed mb-6 bg-[#F9F5EC] p-6 rounded-2xl border border-[#E2D5B7] font-medium">
              I certify that the information I have provided on this form is true, accurate, and complete to the best of my knowledge. I understand that Rise &amp; Shine ABA will rely on this information to verify insurance coverage and request authorization for services, and that inaccurate information may delay or prevent my child from receiving care. <br/><br/>
              I understand that I must notify Rise &amp; Shine ABA promptly if my child&apos;s insurance, address, contact information, custody arrangement, or medical status changes.
            </p>

            <AutoSaveCheckbox
              label="I agree to the attestation statement above."
              fieldId="attestationAgree"
              currentValue={formData['attestationAgree']}
              onChange={handleBlur}
             required={true} />

            <div className="mt-10">
              <h4 className="font-bold text-slate-500 text-xs uppercase tracking-widest mb-3 ml-1 font-mono">Digital Signature</h4>
              <div className={`w-full h-40 bg-white border border-[#E2D5B7] rounded-3xl flex items-center justify-center shadow-xs group transition-colors ${!formData['attestationName'] ? 'missing' : 'border-[#EA580C]/50 bg-[#FFF5ED]/30'}`}>
                {formData['attestationName'] ? (
                   <span className="text-[#EA580C] text-5xl opacity-90" style={{ fontFamily: '"Dancing Script", cursive' }}>{formData['attestationName']}</span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-6 mt-6">
                <AutoSaveInput
                  label="Printed Name (Acts as Signature)"
                  fieldId="attestationName"
                  defaultValue={formData['attestationName']}
                  onBlur={(id: string, val: string) => {
                    if (val && !formData['attestationDate']) {
                      handleBlur({ attestationName: val, attestationDate: new Date().toLocaleDateString() });
                    } else {
                      handleBlur(id, val);
                    }
                  }}
                  required={true}
                />
                <div className="field">
                  <label>Date Signed</label>
                  <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl p-3 text-slate-700 text-sm font-mono flex items-center h-[46px]">
                    {formData['attestationDate'] || (formData['attestationName'] ? new Date().toLocaleDateString() : 'Pending Signature')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      </div>
    </div>
    </AdminReviewContext.Provider>
  );
}
