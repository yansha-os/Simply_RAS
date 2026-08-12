import React from 'react';
import { SectionCard, AutoSaveInput, AutoSaveTextArea, AutoSaveSelect, AdminReviewContext, FieldWrapper } from './FormUIHelpers';
import { InitialBlock } from './InitialBlock';

export function Form02Consent({ formData, handleBlur, client, readOnly, isRejectionMode = false, adminReviewMode = false, rejectedFields = [], stagedRejections = [], onRejectField = () => {} }: any) {
  // Derive default initials from the Guardian 1 name (from form data or client profile)
  const parentName = formData['g1Name'] || client?.guardianName || '';
  let defaultInitials = '';
  if (parentName) {
    defaultInitials = parentName.split(' ').map((n: string) => n[0]).join('').toUpperCase();
  }

  // Use the explicitly saved initials if they exist (even if empty string), otherwise fallback to the derived default
  const globalInitials = formData['globalInitials'] !== undefined ? formData['globalInitials'] : defaultInitials;

  const hasMedicaid = formData['hasMedicaid'] && formData['hasMedicaid'] !== 'No' && formData['hasMedicaid'] !== 'Not Sure';

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
            <div className="bg-brand-blue-500/10 border border-brand-blue-500 rounded-xl p-4 flex items-center gap-3 shadow-lg">
              <span className="text-brand-blue-500 font-bold">🔒 Review Needed</span>
              <span className="text-slate-300 text-sm">This form has been submitted and is locked for clinic review.</span>
            </div>
          </div>
        )}
        {!readOnly && !adminReviewMode && isRejectionMode && (
          <div className="mb-6">
            <div className="bg-brand-orange-500/10 border border-brand-orange-500 rounded-xl p-4 flex items-center gap-3 shadow-lg">
              <span className="text-brand-orange-500 font-bold">⚠️ Changes Needed</span>
              <span className="text-slate-300 text-sm">The clinic has requested changes to specific fields below. Please update them and re-submit this step.</span>
            </div>
          </div>
        )}
        {adminReviewMode && (
          <div className="mb-6">
            <div className="bg-brand-orange-500/10 border border-brand-orange-500 rounded-xl p-4 flex items-center gap-3 shadow-lg">
              <span className="text-brand-orange-500 font-bold">🕵️ Admin Review Mode</span>
              <span className="text-slate-300 text-sm">Click on any field to reject it. It will be wiped and sent back to the client.</span>
            </div>
          </div>
        )}
        <div className="">
      <div className="mb-6">
        {readOnly && !adminReviewMode ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Master Initials</label>
            <div className="text-white font-medium text-xl font-mono">{globalInitials || '--'}</div>
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
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Authorized Service Locations</h4>
              <div className="space-y-4">
                <InitialBlock label="Home" fieldId="locHome" currentValue={formData['locHome']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Clinic / Center" fieldId="locClinic" currentValue={formData['locClinic']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Community (e.g., Parks, Stores)" fieldId="locCommunity" currentValue={formData['locCommunity']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="School / Daycare (Requires facility approval)" fieldId="locSchool" currentValue={formData['locSchool']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Telehealth Services</h4>
              <p className="text-slate-400 text-sm mb-4">Some caregiver training or supervision may be conducted via secure telehealth platforms.</p>
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
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Recording, Photography & Observation</h4>
              <p className="text-slate-400 text-sm mb-4">These are optional and independent.</p>
              <div className="space-y-4">
                <InitialBlock label="Clinical Recording" description="Consent to record sessions for BCBA review and clinical quality." fieldId="mediaClinical" currentValue={formData['mediaClinical']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Training Recording" description="Consent to use recordings internally to train staff." fieldId="mediaTraining" currentValue={formData['mediaTraining']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Internal Photos" description="Consent for staff to take photos for internal profile use." fieldId="mediaPhotos" currentValue={formData['mediaPhotos']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Marketing Use" description="Consent to use non-identifying media for marketing materials." fieldId="mediaMarketing" currentValue={formData['mediaMarketing']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Student Observation" description="Consent for clinical students to observe sessions." fieldId="mediaObservation" currentValue={formData['mediaObservation']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Notice of Privacy Practices</h4>
              <div className="space-y-4">
                <InitialBlock 
                  label="I acknowledge receipt of the HIPAA Notice of Privacy Practices." 
                  fieldId="hipaaAck" required={true} 
                  currentValue={formData['hipaaAck']} onChange={handleBlur} globalInitials={globalInitials} 
                />
                <a href="#" className="text-brand-blue-400 text-sm hover:underline font-bold block ml-2">Read Notice of Privacy Practices</a>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* SECTION 6 */}
      <div id="consent-6" className="scroll-mt-10">
        <SectionCard title="6. Authorization to Disclose PHI">
          <p className="text-slate-400 text-sm mb-6">I authorize Rise & Shine ABA to disclose my child's Protected Health Information (PHI) to the following entities for the purposes of care coordination and billing:</p>
          <div className="space-y-4">
            <InitialBlock label="Health Insurance Plan / Administrators" fieldId="phiInsurance" required={true} currentValue={formData['phiInsurance']} onChange={handleBlur} globalInitials={globalInitials} />
            <InitialBlock label="Third-Party Billing Vendors" fieldId="phiBilling" currentValue={formData['phiBilling']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="Primary Care Physician (PCP)" fieldId="phiPcp" currentValue={formData['phiPcp']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="Diagnosing Provider" fieldId="phiDiagnosing" currentValue={formData['phiDiagnosing']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="School / Early Intervention Program" fieldId="phiSchool" currentValue={formData['phiSchool']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
            <InitialBlock label="Other Therapy Providers (Speech, OT, PT)" fieldId="phiOtherTherapies" currentValue={formData['phiOtherTherapies']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
          </div>

          <div className="mt-8 pt-6 border-t border-white/5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Additional Individuals / Organizations</h4>
            <p className="text-slate-400 text-sm mb-6 bg-white/5 p-4 rounded-xl border border-white/10">
              <strong>Optional:</strong> Only fill this out if you want to authorize us to speak with someone who isn't already listed above (e.g., a grandparent, a private speech therapist, or a lawyer). If you do not want us to share your child's records with anyone else, leave this section blank.
            </p>
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <AutoSaveInput label="Name" fieldId="phiAdd1Name" defaultValue={formData['phiAdd1Name']} onBlur={handleBlur} />
                <AutoSaveInput label="Purpose" fieldId="phiAdd1Purpose" defaultValue={formData['phiAdd1Purpose']} onBlur={handleBlur} />
              </div>
              <InitialBlock label="Authorize Disclosures to Entity 1" fieldId="phiAdd1Initial" currentValue={formData['phiAdd1Initial']} onChange={handleBlur} globalInitials={globalInitials} />
              
              <div className="grid md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5">
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
              <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4 border-l-2 border-brand-orange-500 pl-2">7. Assignment of Benefits</h4>
              {hasMedicaid ? (
                <p className="text-slate-400 text-sm mb-4 leading-relaxed p-4 bg-white/5 rounded-xl border border-white/10">
                  Because you have indicated your child is covered by Medicaid, you are protected from balance billing. Rise & Shine ABA will accept the Medicaid reimbursement rate as payment in full. You assign all benefits directly to the provider.
                </p>
              ) : (
                <p className="text-slate-400 text-sm mb-4 leading-relaxed p-4 bg-white/5 rounded-xl border border-white/10">
                  You authorize your insurance company to remit payment directly to Rise & Shine ABA. You understand that you are financially responsible for all charges not covered by insurance, including copayments, coinsurance, deductibles, and non-covered services.
                </p>
              )}
              <InitialBlock label="I agree to the Assignment of Benefits" fieldId="aobInitial" required={true} currentValue={formData['aobInitial']} onChange={handleBlur} globalInitials={globalInitials} />
            </div>

            {/* 8. Gaps */}
            <div className="pt-6 border-t border-white/5">
              <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4 border-l-2 border-brand-blue-500 pl-2">8. Coverage Gaps</h4>
              <p className="text-slate-400 text-sm leading-relaxed mb-2">
                <strong>Informational Only:</strong> If your insurance lapses or authorization expires, services may be paused until coverage is reinstated. You will be notified immediately if a gap occurs.
              </p>
            </div>

            {/* 9. Attendance */}
            <div className="pt-6 border-t border-white/5">
              <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4 border-l-2 border-brand-orange-500 pl-2">9. Attendance & Cancellation Policy</h4>
              <div className="bg-black/30 border border-white/10 rounded-xl p-4 mb-4">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="pb-2 font-bold text-white">Event</th>
                      <th className="pb-2 font-bold text-white">Fee / Consequence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/5">
                      <td className="py-2">No-Show or Cancel &lt; 24h</td>
                      <td className="py-2 text-brand-orange-400">$50 Fee</td>
                    </tr>
                    <tr>
                      <td className="py-2">Attendance drops below 80%</td>
                      <td className="py-2">Risk of Discharge</td>
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
              <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4 border-l-2 border-brand-blue-500 pl-2">10. Communication Preferences</h4>
              <p className="text-slate-400 text-sm mb-4">I authorize Rise & Shine to communicate with me regarding appointments and care via:</p>
              <div className="space-y-4">
                <InitialBlock label="Phone Calls" fieldId="commPhone" currentValue={formData['commPhone']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="SMS Text Messages (Standard rates apply; unencrypted)" fieldId="commSms" currentValue={formData['commSms']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Email (Unencrypted)" fieldId="commEmail" currentValue={formData['commEmail']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
                <InitialBlock label="Secure Patient Portal" fieldId="commPortal" currentValue={formData['commPortal']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            {/* 11, 12, 13 */}
            <div className="pt-6 border-t border-white/5">
              <p className="text-slate-400 text-sm mb-4"><strong>11. Mandated Reporting:</strong> Be advised that all clinical staff are mandated reporters of suspected child abuse or neglect.</p>
              <p className="text-slate-400 text-sm mb-6"><strong>13. Rights & Concerns:</strong> You have the right to file a grievance at any time without fear of retaliation.</p>
              
              <InitialBlock label="12. I authorize emergency medical treatment if required." fieldId="emergencyInitial" required={true} currentValue={formData['emergencyInitial']} onChange={handleBlur} globalInitials={globalInitials} />
              <div className="mt-4">
                <InitialBlock label="14. I consent to the use of Electronic Signatures." fieldId="eSignInitial" currentValue={formData['eSignInitial']} onChange={handleBlur} globalInitials={globalInitials}  required={true} />
              </div>
            </div>

            {/* 15. Signatures */}
            <div className="pt-6 border-t border-white/5">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-l-2 border-brand-orange-500 pl-2">Digital Signature</h4>
              <div className={`w-full h-40 bg-black/50 border border-white/10 rounded-2xl flex items-center justify-center shadow-inner group transition-colors ${!formData['sig1Name'] && !readOnly ? 'missing' : 'border-brand-blue-500/50 bg-brand-blue-500/5'}`}>
                {formData['sig1Name'] ? (
                   <span className="text-white text-5xl opacity-90" style={{ fontFamily: '"Dancing Script", cursive' }}>{formData['sig1Name']}</span>
                ) : null}
              </div>
              {readOnly && !adminReviewMode ? (
                <div className="grid grid-cols-2 gap-6 mt-6">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Printed Name (Acts as Signature)</label>
                    <div className="text-white font-medium italic text-lg">{formData['sig1Name'] || '--'}</div>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Date Signed</label>
                    <div className="text-white font-medium">{formData['sig1Date'] || '--'}</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6 mt-6">
                  <AutoSaveInput 
                    label="Printed Name (Acts as Signature)" 
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
                    <div className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-slate-400 text-sm font-mono flex items-center h-[42px]">
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
