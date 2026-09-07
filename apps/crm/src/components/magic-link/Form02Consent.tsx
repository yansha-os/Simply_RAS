import React from 'react';
import { SectionCard, AutoSaveInput, AdminReviewContext } from './FormUIHelpers';
import { InitialBlock } from './InitialBlock';
import {
  FileSignature, CheckCircle2, XCircle, BadgeCheck,
  MapPin, Camera, Lock, DollarSign, PenLine,
  Stethoscope, ClipboardList
} from 'lucide-react';

type ConsentFormData = Record<string, string>;

type ConsentClientSummary = {
  guardianName?: string | null;
};

type ConsentFieldChange = (
  fieldId: string | Record<string, string>,
  value?: unknown,
) => unknown;

type Form02ConsentProps = {
  formData: Record<string, unknown>;
  handleBlur?: ConsentFieldChange;
  client: object;
  readOnly?: boolean;
  isRejectionMode?: boolean;
  adminReviewMode?: boolean;
  rejectedFields?: string[];
  stagedRejections?: string[];
  onRejectField?: (fieldId: string) => void;
};

// ─────────────────────────────────────────────────────────
// Read-only helpers (mirrors Form 01 pattern)
// ─────────────────────────────────────────────────────────

function RoSection02({ icon, title, accent = '#EA580C', children }: {
  icon: React.ReactNode; title: string; accent?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ borderLeft: `3px solid ${accent}` }} className="bg-white rounded-2xl border border-[#E2D5B7] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 bg-[#F9F5EC] border-b border-[#E2D5B7]">
        <span style={{ color: accent }}>{icon}</span>
        <span className="font-bold text-slate-800 text-sm font-mono uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/** Single initialed-item row */
function InitRow({ label, value, description }: { label: string; value?: unknown; description?: string }) {
  // InitialBlock stores { initials, timestamp } — extract the initials string
  const initials = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'initials' in value && typeof value.initials === 'string'
      ? value.initials
      : undefined;
  const signed = !!initials;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#E2D5B7]/50 last:border-0">
      <div className="mt-0.5 shrink-0">
        {signed
          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
          : <XCircle className="w-4 h-4 text-slate-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {signed && (
        <span className="shrink-0 text-xs font-bold font-mono text-[#EA580C] bg-[#FFF5ED] border border-[#FFD8C2] px-2 py-0.5 rounded-full">
          {initials}
        </span>
      )}
    </div>
  );
}

/** A simple key/value field for the signature section */
function RoField02({ label, value, cursive = false }: { label: string; value?: string; cursive?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 font-mono">{label}</span>
      {value
        ? <span className={`text-slate-800 font-semibold leading-snug ${cursive ? 'text-2xl' : 'text-sm'}`}
            style={cursive ? { fontFamily: '"Dancing Script", cursive', color: '#EA580C' } : {}}>
            {value}
          </span>
        : <span className="text-slate-300 italic font-normal text-xs">—</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main read-only summary
// ─────────────────────────────────────────────────────────

function Form02ReadOnlySummary({ formData }: { formData: ConsentFormData }) {
  const fd = formData;
  const hasMedicaid = fd['hasMedicaid'] && fd['hasMedicaid'] !== 'No' && fd['hasMedicaid'] !== 'Not Sure';
  const sigDate = fd['sig1Date'] ? new Date(fd['sig1Date'] as string).toLocaleDateString() : undefined;

  return (
    <div className="space-y-4 p-6 max-w-4xl mx-auto">

      {/* Locked banner */}
      <div className="flex items-center gap-3 bg-[#FFF5ED] border border-[#FFD8C2] rounded-2xl px-5 py-3.5 shadow-sm">
        <BadgeCheck className="w-5 h-5 text-[#EA580C] flex-shrink-0" />
        <div>
          <p className="text-[#C2410C] font-bold text-sm">Form Submitted — Pending Clinic Review</p>
          <p className="text-slate-500 text-xs mt-0.5">This consent form is locked. Fields are shown in read-only mode.</p>
        </div>
      </div>

      {/* Master initials */}
      <div className="bg-white rounded-2xl border border-[#E2D5B7] shadow-sm px-5 py-4 flex items-center gap-4">
        <PenLine className="w-4 h-4 text-[#EA580C] shrink-0" />
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400 font-mono mb-0.5">Master Initials</p>
          <p className="text-slate-800 font-bold text-xl font-mono">{fd['globalInitials'] || '—'}</p>
        </div>
      </div>

      {/* 1. Consent for Assessment & Treatment */}
      <RoSection02 icon={<Stethoscope className="w-4 h-4" />} title="1. Consent for Assessment & Treatment">
        <InitRow label="CPT 97151: Behavior Identification Assessment" value={fd['cpt97151']}
          description="Consent to initial and ongoing behavioral assessments to determine medical necessity." />
        <InitRow label="CPT 97153: Adaptive Behavior Treatment by Protocol" value={fd['cpt97153']}
          description="Consent to direct 1:1 ABA therapy provided by an RBT or Behavior Interventionist." />
        <InitRow label="CPT 97155: Protocol Modification" value={fd['cpt97155']}
          description="Consent to adaptive behavior treatment with protocol modification by a qualified clinician." />
        <InitRow label="CPT 97156: Family Adaptive Behavior Treatment Guidance" value={fd['cpt97156']}
          description="Consent to caregiver training sessions with a BCBA." />
        <InitRow label="CPT 97154 / 97158: Group Adaptive Behavior Treatment" value={fd['cpt97154']}
          description="Consent to group therapy or social skills groups when clinically appropriate." />
      </RoSection02>

      {/* 2 & 3. Service Location & Telehealth */}
      <RoSection02 icon={<MapPin className="w-4 h-4" />} title="2. Service Locations & 3. Telehealth" accent="#2563eb">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-3">Authorized Locations</p>
        <InitRow label="Home" value={fd['locHome']} />
        <InitRow label="Clinic / Center" value={fd['locClinic']} />
        <InitRow label="Community (e.g., Parks, Stores)" value={fd['locCommunity']} />
        <InitRow label="School / Daycare (Requires facility approval)" value={fd['locSchool']} />
        <div className="pt-3 mt-3 border-t border-[#E2D5B7]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-3">Telehealth</p>
          <InitRow label="I CONSENT to telehealth services" value={fd['telehealthConsent']} />
          <InitRow label="I DECLINE telehealth services" value={fd['telehealthDecline']}
            description="All services must be in-person." />
        </div>
      </RoSection02>

      {/* 4 & 5. Media & HIPAA */}
      <RoSection02 icon={<Camera className="w-4 h-4" />} title="4. Media & 5. HIPAA Notice" accent="#7c3aed">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-3">Recording, Photography & Observation</p>
        <InitRow label="Clinical Recording" value={fd['mediaClinical']}
          description="Consent to record sessions for BCBA review and clinical quality." />
        <InitRow label="Training Recording" value={fd['mediaTraining']}
          description="Consent to use recordings internally to train staff." />
        <InitRow label="Internal Photos" value={fd['mediaPhotos']}
          description="Consent for staff to take photos for internal profile use." />
        <InitRow label="Marketing Use" value={fd['mediaMarketing']}
          description="Consent to use non-identifying media for marketing materials." />
        <InitRow label="Student Observation" value={fd['mediaObservation']}
          description="Consent for clinical students to observe sessions." />
        <div className="pt-3 mt-3 border-t border-[#E2D5B7]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-3">HIPAA Privacy Notice</p>
          <InitRow label="I acknowledge receipt of the HIPAA Notice of Privacy Practices." value={fd['hipaaAck']} />
        </div>
      </RoSection02>

      {/* 6. PHI Disclosures */}
      <RoSection02 icon={<Lock className="w-4 h-4" />} title="6. Authorization to Disclose PHI" accent="#0d9488">
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Authorization to share child&apos;s Protected Health Information with the following parties:
        </p>
        <InitRow label="Health Insurance Plan / Administrators" value={fd['phiInsurance']} />
        <InitRow label="Third-Party Billing Vendors" value={fd['phiBilling']} />
        <InitRow label="Primary Care Physician (PCP)" value={fd['phiPcp']} />
        <InitRow label="Diagnosing Provider" value={fd['phiDiagnosing']} />
        <InitRow label="School / Early Intervention Program" value={fd['phiSchool']} />
        <InitRow label="Other Therapy Providers (Speech, OT, PT)" value={fd['phiOtherTherapies']} />
        {(fd['phiAdd1Name'] || fd['phiAdd1Initial']) && (
          <div className="pt-3 mt-3 border-t border-[#E2D5B7]">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-2">Additional Entity 1</p>
            <div className="grid grid-cols-2 gap-4 mb-2">
              <RoField02 label="Name" value={fd['phiAdd1Name']} />
              <RoField02 label="Purpose" value={fd['phiAdd1Purpose']} />
            </div>
            <InitRow label="Authorize Disclosures to Entity 1" value={fd['phiAdd1Initial']} />
          </div>
        )}
        {(fd['phiAdd2Name'] || fd['phiAdd2Initial']) && (
          <div className="pt-3 mt-3 border-t border-[#E2D5B7]">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-2">Additional Entity 2</p>
            <div className="grid grid-cols-2 gap-4 mb-2">
              <RoField02 label="Name" value={fd['phiAdd2Name']} />
              <RoField02 label="Purpose" value={fd['phiAdd2Purpose']} />
            </div>
            <InitRow label="Authorize Disclosures to Entity 2" value={fd['phiAdd2Initial']} />
          </div>
        )}
      </RoSection02>

      {/* 7, 8, 9. Financial, Billing & Policies */}
      <RoSection02 icon={<DollarSign className="w-4 h-4" />} title="7–9. Financial, Billing & Policies" accent="#dc2626">
        <div className="mb-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-2">7. Assignment of Benefits</p>
          {hasMedicaid ? (
            <p className="text-xs text-slate-500 bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl px-3 py-2 mb-3">
              Medicaid coverage confirmed — Rise & Shine ABA accepts Medicaid rate as payment in full.
            </p>
          ) : (
            <p className="text-xs text-slate-500 bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl px-3 py-2 mb-3">
              Insurance remits payment directly to Rise & Shine ABA. Parent responsible for copay/deductible/non-covered charges.
            </p>
          )}
          <InitRow label="I agree to the Assignment of Benefits" value={fd['aobInitial']} />
        </div>
        <div className="pt-3 mt-3 border-t border-[#E2D5B7]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-2">9. Attendance & Cancellation Policy</p>
          <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl overflow-hidden mb-3">
            <div className="grid grid-cols-2 border-b border-[#E2D5B7] px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-500 font-mono bg-white/50">
              <span>Event</span><span>Consequence</span>
            </div>
            <div className="grid grid-cols-2 px-4 py-2.5 border-b border-[#E2D5B7]/60 text-sm">
              <span className="text-slate-700">No-Show / Cancel &lt;24h</span>
              <span className="text-[#EA580C] font-bold">$50 Fee</span>
            </div>
            <div className="grid grid-cols-2 px-4 py-2.5 text-sm">
              <span className="text-slate-700">Attendance below 80%</span>
              <span className="text-slate-700 font-semibold">Risk of Discharge</span>
            </div>
          </div>
          <InitRow label="I have read and agree to the Attendance Policy" value={fd['attendanceInitial']} />
        </div>
      </RoSection02>

      {/* 10–14. Final Acknowledgments */}
      <RoSection02 icon={<ClipboardList className="w-4 h-4" />} title="10–14. Final Acknowledgments" accent="#0891b2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono mb-3">10. Communication Preferences</p>
        <InitRow label="Phone Calls" value={fd['commPhone']} />
        <InitRow label="SMS Text Messages (Standard rates apply; unencrypted)" value={fd['commSms']} />
        <InitRow label="Email (Unencrypted)" value={fd['commEmail']} />
        <InitRow label="Secure Patient Portal" value={fd['commPortal']} />
        <div className="pt-3 mt-3 border-t border-[#E2D5B7]">
          <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl px-4 py-3 mb-3 space-y-1.5">
            <p className="text-xs text-slate-600"><strong>11. Mandated Reporting:</strong> All clinical staff are mandated reporters of suspected child abuse or neglect.</p>
            <p className="text-xs text-slate-600"><strong>13. Rights & Concerns:</strong> You have the right to file a grievance at any time without fear of retaliation.</p>
          </div>
          <InitRow label="12. I authorize emergency medical treatment if required." value={fd['emergencyInitial']} />
          <InitRow label="14. I consent to the use of Electronic Signatures." value={fd['eSignInitial']} />
        </div>
      </RoSection02>

      {/* Signature */}
      <RoSection02 icon={<FileSignature className="w-4 h-4" />} title="15. Digital Signature" accent="#16a34a">
        {fd['sig1Name'] && (
          <div className="bg-[#FFF5ED] border border-[#FFD8C2] rounded-2xl px-8 py-6 flex items-center justify-center mb-5">
            <span className="text-[#EA580C] text-4xl" style={{ fontFamily: '"Dancing Script", cursive' }}>
              {fd['sig1Name']}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-6">
          <RoField02 label="Printed Name (Acts as Signature)" value={fd['sig1Name']} />
          <RoField02 label="Date Signed" value={sigDate} />
        </div>
      </RoSection02>

    </div>
  );
}

export function Form02Consent({ formData: rawFormData, handleBlur = () => undefined, client: rawClient, readOnly, isRejectionMode = false, adminReviewMode = false, rejectedFields = [], stagedRejections = [], onRejectField = () => {} }: Form02ConsentProps) {
  const formData = rawFormData as ConsentFormData;
  const client = rawClient as ConsentClientSummary;
  // Derive default initials from the Guardian 1 name (from form data or client profile)
  const parentName = formData['g1Name'] || client?.guardianName || '';
  let defaultInitials = '';
  if (parentName) {
    defaultInitials = parentName.split(' ').map((n: string) => n[0]).join('').toUpperCase();
  }

  // Use the explicitly saved initials if they exist (even if empty string), otherwise fallback to the derived default
  const globalInitials = formData['globalInitials'] !== undefined ? formData['globalInitials'] : defaultInitials;

  const hasMedicaid = formData['hasMedicaid'] && formData['hasMedicaid'] !== 'No' && formData['hasMedicaid'] !== 'Not Sure';

  // Pure read-only preview — render structured summary instead of the raw form
  if (readOnly && !adminReviewMode) {
    return <Form02ReadOnlySummary formData={formData} />;
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
      <div className="mb-6">
        {readOnly && !adminReviewMode ? (
          <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-2xl p-4">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Master Initials</label>
            <div className="text-slate-900 font-bold text-xl font-mono">{globalInitials || '--'}</div>
          </div>
        ) : (
          <div className={`sign-box glass ${!formData['sig1Name'] ? 'missing' : ''}`}>
            <div className="sign-label">TYPE YOUR INITIALS TO SIGN BELOW</div>
            <input
              className="sign-input"
              placeholder="A.K."
              value={globalInitials}
              onChange={(e) => handleBlur('globalInitials', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* SECTION 1 */}
      <div id="consent-1" className="scroll-mt-10">
        <SectionCard title="1. Consent for Assessment & Treatment">
          <div className="space-y-4">
            <InitialBlock
              label="CPT 97151: Behavior Identification Assessment"
              description="I consent to an initial and ongoing behavioral assessments to determine medical necessity and develop a treatment plan."
              fieldId="cpt97151"
              required={true}
              currentValue={formData['cpt97151']} onChange={handleBlur} globalInitials={globalInitials}
            />
            <InitialBlock
              label="CPT 97153: Adaptive Behavior Treatment by Protocol"
              description="I consent to direct 1:1 ABA therapy provided by a Registered Behavior Technician (RBT) or Behavior Interventionist."
              fieldId="cpt97153"
              required={true}
              currentValue={formData['cpt97153']} onChange={handleBlur} globalInitials={globalInitials}
            />
            <InitialBlock label="CPT 97155: Adaptive Behavior Treatment with Protocol Modification"
              description="I consent to adaptive behavior treatment with protocol modification by a qualified clinician when clinically appropriate."
              fieldId="cpt97155"
              currentValue={formData['cpt97155']} onChange={handleBlur} globalInitials={globalInitials}
             required={true} />
            <InitialBlock label="CPT 97156: Family Adaptive Behavior Treatment Guidance"
              description="I consent to participate in caregiver training sessions with a BCBA to learn how to implement ABA strategies."
              fieldId="cpt97156"
              currentValue={formData['cpt97156']} onChange={handleBlur} globalInitials={globalInitials}
             required={true} />
            <InitialBlock label="CPT 97154 / 97158: Group Adaptive Behavior Treatment"
              description="I consent to my child participating in group therapy or social skills groups when clinically appropriate."
              fieldId="cpt97154"
              currentValue={formData['cpt97154']} onChange={handleBlur} globalInitials={globalInitials}
             required={true} />
          </div>
        </SectionCard>
      </div>

      {/* SECTION 2 & 3 */}
      <div id="consent-2" className="scroll-mt-10">
        <SectionCard title="2. Service Location & 3. Telehealth">
          <div className="space-y-8">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Authorized Service Locations</h4>
              <div className="space-y-4">
                <InitialBlock label="Home" fieldId="locHome" currentValue={formData['locHome']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Clinic / Center" fieldId="locClinic" currentValue={formData['locClinic']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Community (e.g., Parks, Stores)" fieldId="locCommunity" currentValue={formData['locCommunity']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="School / Daycare (Requires facility approval)" fieldId="locSchool" currentValue={formData['locSchool']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Telehealth Services</h4>
              <p className="text-slate-600 text-sm mb-4 font-medium">Some caregiver training or supervision may be conducted via secure telehealth platforms.</p>
              <div className="space-y-4">
                <InitialBlock
                  label="I CONSENT to telehealth services"
                  fieldId="telehealthConsent" required={!formData['telehealthConsent'] && !formData['telehealthDecline']}
                  currentValue={formData['telehealthConsent']} onChange={handleBlur} globalInitials={globalInitials}
                />
                <InitialBlock
                  label="I DECLINE telehealth services"
                  description="Checking this means all services must be in-person."
                  fieldId="telehealthDecline" required={!formData['telehealthConsent'] && !formData['telehealthDecline']}
                  currentValue={formData['telehealthDecline']} onChange={handleBlur} globalInitials={globalInitials}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION 4 & 5 */}
      <div id="consent-4" className="scroll-mt-10">
        <SectionCard title="4. Media & 5. HIPAA Notice">
          <div className="space-y-8">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Recording, Photography & Observation</h4>
              <p className="text-slate-600 text-sm mb-4 font-medium">These are optional and independent.</p>
              <div className="space-y-4">
                <InitialBlock label="Clinical Recording" description="Consent to record sessions for BCBA review and clinical quality." fieldId="mediaClinical" currentValue={formData['mediaClinical']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Training Recording" description="Consent to use recordings internally to train staff." fieldId="mediaTraining" currentValue={formData['mediaTraining']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Internal Photos" description="Consent for staff to take photos for internal profile use." fieldId="mediaPhotos" currentValue={formData['mediaPhotos']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Marketing Use" description="Consent to use non-identifying media for marketing materials." fieldId="mediaMarketing" currentValue={formData['mediaMarketing']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Student Observation" description="Consent for clinical students to observe sessions." fieldId="mediaObservation" currentValue={formData['mediaObservation']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Notice of Privacy Practices</h4>
              <div className="space-y-4">
                <InitialBlock
                  label="I acknowledge receipt of the HIPAA Notice of Privacy Practices."
                  fieldId="hipaaAck" required={true}
                  currentValue={formData['hipaaAck']} onChange={handleBlur} globalInitials={globalInitials}
                />
                <a href="#" className="text-[#EA580C] text-sm hover:underline font-bold block ml-2">Read Notice of Privacy Practices</a>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION 6 */}
      <div id="consent-6" className="scroll-mt-10">
        <SectionCard title="6. Authorization to Disclose PHI">
          <p className="text-slate-600 text-sm mb-6">I authorize Rise & Shine ABA to disclose my child&apos;s Protected Health Information (PHI) to the following entities for the purposes of care coordination and billing:</p>
          <div className="space-y-4">
            <InitialBlock label="Health Insurance Plan / Administrators" fieldId="phiInsurance" required={true} currentValue={formData['phiInsurance']} onChange={handleBlur} globalInitials={globalInitials} />
            <InitialBlock label="Third-Party Billing Vendors" fieldId="phiBilling" currentValue={formData['phiBilling']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="Primary Care Physician (PCP)" fieldId="phiPcp" currentValue={formData['phiPcp']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="Diagnosing Provider" fieldId="phiDiagnosing" currentValue={formData['phiDiagnosing']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="School / Early Intervention Program" fieldId="phiSchool" currentValue={formData['phiSchool']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="Other Therapy Providers (Speech, OT, PT)" fieldId="phiOtherTherapies" currentValue={formData['phiOtherTherapies']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
          </div>

          <div className="mt-8 pt-6 border-t border-[#E2D5B7]/60">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 font-mono">Additional Individuals / Organizations</h4>
            <p className="text-slate-600 text-sm mb-6 bg-[#F9F5EC] p-4 rounded-2xl border border-[#E2D5B7]">
              <strong>Optional:</strong> Only fill this out if you want to authorize us to speak with someone who isn&apos;t already listed above (e.g., a grandparent, a private speech therapist, or a lawyer). If you do not want us to share your child&apos;s records with anyone else, leave this section blank.
            </p>
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <AutoSaveInput label="Name" fieldId="phiAdd1Name" defaultValue={formData['phiAdd1Name']} onBlur={handleBlur} />
                <AutoSaveInput label="Purpose" fieldId="phiAdd1Purpose" defaultValue={formData['phiAdd1Purpose']} onBlur={handleBlur} />
              </div>
              <InitialBlock label="Authorize Disclosures to Entity 1" fieldId="phiAdd1Initial" currentValue={formData['phiAdd1Initial']} onChange={handleBlur} globalInitials={globalInitials} />

              <div className="grid md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#E2D5B7]/60">
                <AutoSaveInput label="Name" fieldId="phiAdd2Name" defaultValue={formData['phiAdd2Name']} onBlur={handleBlur} />
                <AutoSaveInput label="Purpose" fieldId="phiAdd2Purpose" defaultValue={formData['phiAdd2Purpose']} onBlur={handleBlur} />
              </div>
              <InitialBlock label="Authorize Disclosures to Entity 2" fieldId="phiAdd2Initial" currentValue={formData['phiAdd2Initial']} onChange={handleBlur} globalInitials={globalInitials} />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION 7, 8 & 9 */}
      <div id="consent-7" className="scroll-mt-10">
        <SectionCard title="Financial, Billing & Policies">
          <div className="space-y-8">

            {/* 7. AOB */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-4 border-l-2 border-[#EA580C] pl-2 font-mono">7. Assignment of Benefits</h4>
              {hasMedicaid ? (
                <p className="text-slate-600 text-sm mb-4 leading-relaxed p-4 bg-[#F9F5EC] rounded-2xl border border-[#E2D5B7]">
                  Because you have indicated your child is covered by Medicaid, you are protected from balance billing. Rise & Shine ABA will accept the Medicaid reimbursement rate as payment in full. You assign all benefits directly to the provider.
                </p>
              ) : (
                <p className="text-slate-600 text-sm mb-4 leading-relaxed p-4 bg-[#F9F5EC] rounded-2xl border border-[#E2D5B7]">
                  You authorize your insurance company to remit payment directly to Rise & Shine ABA. You understand that you are financially responsible for all charges not covered by insurance, including copayments, coinsurance, deductibles, and non-covered services.
                </p>
              )}
              <InitialBlock label="I agree to the Assignment of Benefits" fieldId="aobInitial" required={true} currentValue={formData['aobInitial']} onChange={handleBlur} globalInitials={globalInitials} />
            </div>

            {/* 8. Gaps */}
            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-4 border-l-2 border-[#EA580C] pl-2 font-mono">8. Coverage Gaps</h4>
              <p className="text-slate-600 text-sm leading-relaxed mb-2">
                <strong>Informational Only:</strong> If your insurance lapses or authorization expires, services may be paused until coverage is reinstated. You will be notified immediately if a gap occurs.
              </p>
            </div>

            {/* 9. Attendance */}
            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-4 border-l-2 border-[#EA580C] pl-2 font-mono">9. Attendance & Cancellation Policy</h4>
              <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-2xl p-4 mb-4">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-[#E2D5B7]">
                      <th className="pb-2 font-bold text-slate-900">Event</th>
                      <th className="pb-2 font-bold text-slate-900">Fee / Consequence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#E2D5B7]/60">
                      <td className="py-2">No-Show or Cancel &lt; 24h</td>
                      <td className="py-2 text-[#EA580C] font-bold">$50 Fee</td>
                    </tr>
                    <tr>
                      <td className="py-2">Attendance drops below 80%</td>
                      <td className="py-2 font-semibold">Risk of Discharge</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <InitialBlock label="I have read and agree to the Attendance Policy" fieldId="attendanceInitial" required={true} currentValue={formData['attendanceInitial']} onChange={handleBlur} globalInitials={globalInitials} />
            </div>

          </div>
        </SectionCard>
      </div>

      {/* SECTIONS 10-15 */}
      <div id="consent-10" className="scroll-mt-10">
        <SectionCard title="Final Acknowledgments & Signatures">
          <div className="space-y-8">

            {/* 10. Comms */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-4 border-l-2 border-[#EA580C] pl-2 font-mono">10. Communication Preferences</h4>
              <p className="text-slate-600 text-sm mb-4">I authorize Rise & Shine to communicate with me regarding appointments and care via:</p>
              <div className="space-y-4">
                <InitialBlock label="Phone Calls" fieldId="commPhone" currentValue={formData['commPhone']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="SMS Text Messages (Standard rates apply; unencrypted)" fieldId="commSms" currentValue={formData['commSms']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Email (Unencrypted)" fieldId="commEmail" currentValue={formData['commEmail']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Secure Patient Portal" fieldId="commPortal" currentValue={formData['commPortal']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            {/* 11, 12, 13 */}
            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <p className="text-slate-600 text-sm mb-4"><strong>11. Mandated Reporting:</strong> Be advised that all clinical staff are mandated reporters of suspected child abuse or neglect.</p>
              <p className="text-slate-600 text-sm mb-6"><strong>13. Rights & Concerns:</strong> You have the right to file a grievance at any time without fear of retaliation.</p>

              <InitialBlock label="12. I authorize emergency medical treatment if required." fieldId="emergencyInitial" required={true} currentValue={formData['emergencyInitial']} onChange={handleBlur} globalInitials={globalInitials} />
              <div className="mt-4">
                <InitialBlock label="14. I consent to the use of Electronic Signatures." fieldId="eSignInitial" currentValue={formData['eSignInitial']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            {/* 15. Signatures */}
            <div className="pt-6 border-t border-[#E2D5B7]/60">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-4 border-l-2 border-[#EA580C] pl-2 font-mono">Digital Signature</h4>
              <div className={`w-full h-40 bg-white border border-[#E2D5B7] rounded-3xl flex items-center justify-center shadow-xs group transition-colors ${!formData['sig1Name'] && !readOnly ? 'missing' : 'border-[#EA580C]/50 bg-[#FFF5ED]/30'}`}>
                {formData['sig1Name'] ? (
                   <span className="text-[#EA580C] text-5xl opacity-90" style={{ fontFamily: '"Dancing Script", cursive' }}>{formData['sig1Name']}</span>
                ) : null}
              </div>
              {readOnly && !adminReviewMode ? (
                <div className="grid grid-cols-2 gap-6 mt-6">
                  <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-2xl p-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Printed Name (Acts as Signature)</label>
                    <div className="text-slate-900 font-bold italic text-lg">{formData['sig1Name'] || '--'}</div>
                  </div>
                  <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-2xl p-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Signature Timestamp</label>
                    <div className="text-slate-900 font-bold italic text-lg">{formData['sig1Date'] ? new Date(formData['sig1Date'] as string).toLocaleDateString() : '--'}</div>
                  </div>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6 mt-6">
                  <AutoSaveInput
                    label="Type Full Name to Sign"
                    fieldId="sig1Name"
                    defaultValue={formData['sig1Name']}
                    onBlur={(id: string, val: string) => {
                      if (val && !formData['sig1Date']) {
                        handleBlur({ sig1Name: val, sig1Date: new Date().toLocaleDateString() });
                      } else {
                        handleBlur(id, val);
                      }
                    }}
                    required={true}
                  />
                  <div className="field">
                    <label>Date Signed</label>
                    <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl p-3 text-slate-700 text-sm font-mono flex items-center h-[46px]">
                      {formData['sig1Date'] || (formData['sig1Name'] ? new Date().toLocaleDateString() : 'Pending Signature')}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </SectionCard>
      </div>
      </div>
    </div>
    </AdminReviewContext.Provider>
  );
}
