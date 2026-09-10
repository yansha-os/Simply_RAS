export type OnboardingStepKind =
  | 'ESIGN'
  | 'FILLABLE'
  | 'EMBEDDED'
  | 'UPLOAD'
  | 'QUIZ'
  | 'ACK';

export type OnboardingPdf = {
  file: string;
  label: string;
};

export type OnboardingDocDef = {
  step: number;
  key: string;
  title: string;
  legalCite: string;
  kind: OnboardingStepKind;
  version: string;
  pdfs: OnboardingPdf[];
  uploadAccept?: string;
  uploadLabel?: string;
};

export const ONBOARDING_PACK_VERSION = '2026-08-v2';
export const ONBOARDING_TOTAL_STEPS = 27;
export const ONBOARDING_PDF_BASE = '/onboarding-docs';
export const LS54_DOCUMENT_KEY = 'ls-54';
export const LS54_DOCUMENT_TITLE = 'NYS Wage Notice (LS-54)';
export const ONBOARDING_COMPLETION_ACTIONS = [
  'SIGNED',
  'FORM_SUBMITTED',
  'UPLOADED',
  'QUIZ_PASSED',
] as const;
const COMPLETION_ACTION_BY_KIND: Partial<Record<OnboardingStepKind, string>> = {
  ESIGN: 'SIGNED',
  ACK: 'SIGNED',
  EMBEDDED: 'FORM_SUBMITTED',
  UPLOAD: 'UPLOADED',
  QUIZ: 'QUIZ_PASSED',
};

export const ONBOARDING_DOCS: OnboardingDocDef[] = [
  {
    step: 1,
    key: 'esign-consent',
    title: 'E-Signature Consent',
    legalCite: '15 U.S.C. § 7001 (E-SIGN) · N.Y. State Tech. Law Art. 3 (ESRA)',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'esign-consent.pdf', label: 'Electronic Signature & Records Consent' }],
  },
  {
    step: 2,
    key: 'welcome-letter',
    title: 'Welcome Letter',
    legalCite: 'Offer / welcome acknowledgment',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'welcome-letter.pdf', label: 'Welcome Letter' }],
  },
  {
    step: 3,
    key: 'employee-handbook',
    title: 'Employee Handbook',
    legalCite: 'Handbook receipt acknowledgment',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'employee-handbook.pdf', label: 'Employee Handbook' }],
  },
  {
    step: 4,
    key: 'hipaa-confidentiality',
    title: 'HIPAA & Confidentiality',
    legalCite: '45 C.F.R. Parts 160 & 164',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [
      { file: 'hipaa-confidentiality.pdf', label: 'HIPAA & Confidentiality Policy' },
      { file: 'hipaa-acknowledgment.pdf', label: 'HIPAA Acknowledgment Form' },
    ],
  },
  {
    step: 5,
    key: 'nda',
    title: 'Non-Disclosure Agreement (NDA)',
    legalCite: 'Confidentiality / NDA',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'nda.pdf', label: 'Non-Disclosure Agreement' }],
  },
  {
    step: 6,
    key: 'mandated-reporter-ack',
    title: 'Mandated Reporter Acknowledgment',
    legalCite: 'N.Y. Social Services Law § 413',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'mandated-reporter-ack.pdf', label: 'Mandated Reporter Acknowledgment' }],
  },
  {
    step: 7,
    key: 'incident-reporting',
    title: 'Emergency & Incident Reporting Policy',
    legalCite: 'Incident reporting policy',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'incident-reporting.pdf', label: 'Incident Reporting Policy' }],
  },
  {
    step: 8,
    key: 'session-note-policy',
    title: 'Session Note Policy',
    legalCite: 'Clinical documentation policy',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'session-note-policy.pdf', label: 'Session Note Policy' }],
  },
  {
    step: 9,
    key: 'time-recording',
    title: 'Time Recording Policy',
    legalCite: 'Wage & hour timekeeping policy',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'time-recording-policy.pdf', label: 'Time Recording Policy' }],
  },
  {
    step: 10,
    key: 'doc-time-ack',
    title: 'Documentation & Time Acknowledgment',
    legalCite: 'Documentation / time attestation',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'doc-time-acknowledgment.pdf', label: 'Documentation & Time Acknowledgment' }],
  },
  {
    step: 11,
    key: 'sh-policy-ack',
    title: 'Sexual Harassment Policy Acknowledgment',
    legalCite: 'N.Y. Labor Law § 201-g',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [
      { file: 'sexual-harassment-ack.pdf', label: 'Policy Acknowledgment' },
      { file: 'sexual-harassment-policy.pdf', label: 'Sexual Harassment Prevention Policy' },
    ],
  },
  {
    step: 12,
    key: 'oig-sam-omig',
    title: 'OIG/SAM/OMIG Self-Attestation',
    legalCite: '42 U.S.C. § 1320a-7 · NYS OMIG',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'oig-sam-omig.pdf', label: 'OIG / SAM / OMIG Self-Attestation' }],
  },
  {
    step: 13,
    key: 'rbt-supervision',
    title: 'RBT Supervision Contract',
    legalCite: 'Supervision sources remain separate: current certification standards, assigned qualified supervisor, agency policy, payer contract, and jurisdiction; confirm the current plan with HR and the qualified supervisor',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'rbt-supervision-contract.pdf', label: 'RBT Supervision Contract' }],
  },
  {
    step: 14,
    key: 'fcra-disclosure',
    title: 'FCRA Disclosure',
    legalCite: '15 U.S.C. § 1681b',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'fcra-disclosure.pdf', label: 'FCRA Disclosure' }],
  },
  {
    step: 15,
    key: 'cfpb-fcra-rights',
    title: 'CFPB Consumer Rights Summary',
    legalCite: 'FCRA Summary of Rights (CFPB)',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'cfpb-fcra-rights.pdf', label: 'A Summary of Your Rights Under the FCRA' }],
  },
  {
    step: 16,
    key: 'db-271s',
    title: 'NYS Disability Benefits Notice (DB-271S)',
    legalCite: 'N.Y. Workers’ Comp. Law Art. 9',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'db-271s.pdf', label: 'DB-271S Disability Benefits Notice' }],
  },
  {
    step: 17,
    key: 'pfl-271s',
    title: 'Paid Family Leave Notice (PFL-271S)',
    legalCite: 'N.Y. Workers’ Comp. Law Art. 9',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'pfl-271s.pdf', label: 'PFL-271S Paid Family Leave Notice' }],
  },
  {
    step: 18,
    key: 'paid-sick-leave',
    title: 'Paid Safe & Sick Leave Notice',
    legalCite: 'N.Y. Labor Law § 196-b',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'paid-safe-sick-leave.pdf', label: 'NY Paid Safe and Sick Leave Notice' }],
  },
  {
    step: 19,
    key: 'p705-breast-milk',
    title: 'Breast Milk Expression Rights Notice (P705)',
    legalCite: 'N.Y. Labor Law § 206-c',
    kind: 'ESIGN',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'p705-breast-milk.pdf', label: 'P705 Lactation Rights Notice' }],
  },
  {
    step: 20,
    key: 'form-w4',
    title: 'Form W-4',
    legalCite: '26 U.S.C. § 3402 · IRS Form W-4',
    kind: 'EMBEDDED',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'form-w4-2025.pdf', label: 'Official IRS Form W-4 (reference)' }],
  },
  {
    step: 21,
    key: 'form-it-2104',
    title: 'Form IT-2104 (NYS Tax Withholding)',
    legalCite: 'NYS DTF Form IT-2104',
    kind: 'EMBEDDED',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'form-it-2104.pdf', label: 'Official NYS IT-2104 (reference)' }],
  },
  {
    step: 22,
    key: 'direct-deposit',
    title: 'Direct Deposit Authorization',
    legalCite: 'NACHA / payroll ACH authorization',
    kind: 'EMBEDDED',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'direct-deposit.pdf', label: 'Official Direct Deposit form (reference)' }],
  },
  {
    step: 23,
    key: 'background-check',
    title: 'Background Check Authorization',
    legalCite: 'FCRA · N.Y. Exec. Law § 296(16)',
    kind: 'EMBEDDED',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'background-check.pdf', label: 'Official Background Check form (reference)' }],
  },
  {
    step: 24,
    key: 'ssn-card',
    title: 'Upload Social Security Card',
    legalCite: 'USCIS Form I-9 List C',
    kind: 'UPLOAD',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'form-i9.pdf', label: 'USCIS Form I-9 (reference)' }],
    uploadAccept: 'application/pdf,image/jpeg,image/png',
    uploadLabel: 'Social Security Card',
  },
  {
    step: 25,
    key: 'sh-training-quiz',
    title: 'Sexual Harassment Prevention Training + Quiz',
    legalCite: 'N.Y. Labor Law § 201-g',
    kind: 'QUIZ',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [{ file: 'sexual-harassment-policy.pdf', label: 'Sexual Harassment Prevention Policy' }],
  },
  {
    step: 26,
    key: 'mandated-reporter-cert',
    title: 'Mandated Reporter Training Certificate (Optional / Free NYS Course)',
    legalCite: 'N.Y. Social Services Law § 413',
    kind: 'UPLOAD',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [],
    uploadAccept: 'application/pdf,image/jpeg,image/png',
    uploadLabel: 'Mandated Reporter Certificate (Free @ nysmandatedreporter.org)',
  },
  {
    step: 27,
    key: 'cpr-cert',
    title: 'CPR/First Aid Certificate (Optional / Deferred 30 Days)',
    legalCite: 'AHA / Red Cross certification',
    kind: 'UPLOAD',
    version: ONBOARDING_PACK_VERSION,
    pdfs: [],
    uploadAccept: 'application/pdf,image/jpeg,image/png',
    uploadLabel: 'CPR / First Aid Certificate (Upload or Defer)',
  },
];

export const ONBOARDING_COMPLETION_EVENT_FILTERS = ONBOARDING_DOCS.map((doc) => ({
  stepNumber: doc.step,
  actionType: COMPLETION_ACTION_BY_KIND[doc.kind] ?? '',
})).filter((event) => event.actionType.length > 0);

export type Ls54Status = 'NONE' | 'DRAFT' | 'SENT' | 'IN_DISCUSSION' | 'SIGNED' | 'DECLINED';

export type Ls54Payload = {
  employerName: string;
  dbaName: string;
  fein: string;
  physicalAddress: string;
  mailingAddress: string;
  phone: string;
  noticeGiven: 'AT_HIRING' | 'BEFORE_CHANGE';
  rateOfPay: number;
  overtimeRate: number;
  regularPayday: string;
  payFrequency: 'WEEKLY' | 'BIWEEKLY' | 'OTHER';
  payFrequencyOther: string;
  allowancesNone: boolean;
  tipsPerHour: number | null;
  mealsPerMeal: number | null;
  lodging: string;
  otherAllowance: string;
  preparerName: string;
  preparerTitle: string;
  employeeName: string;
};

export const DEFAULT_LS54_EMPLOYER = {
  employerName: 'Rise & Shine ABA LLC',
  dbaName: 'Rise & Shine ABA',
  fein: '',
  physicalAddress: '424 Grandview Ave, Staten Island, NY 10303',
  mailingAddress: '424 Grandview Ave, Staten Island, NY 10303',
  phone: '(929) 460-9600',
};

export function buildDefaultLs54Payload(
  employeeName: string,
  preparerName: string
): Ls54Payload {
  return {
    ...DEFAULT_LS54_EMPLOYER,
    noticeGiven: 'AT_HIRING',
    rateOfPay: 0,
    overtimeRate: 0,
    regularPayday: 'Friday',
    payFrequency: 'BIWEEKLY',
    payFrequencyOther: '',
    allowancesNone: true,
    tipsPerHour: null,
    mealsPerMeal: null,
    lodging: '',
    otherAllowance: '',
    preparerName,
    preparerTitle: 'Head of HR',
    employeeName,
  };
}

export function getOnboardingDoc(step: number): OnboardingDocDef {
  return ONBOARDING_DOCS.find((d) => d.step === step) ?? ONBOARDING_DOCS[0];
}

export function isOnboardingCompletionEvent(event: {
  stepNumber: number;
  actionType: string;
}): boolean {
  if (!Number.isInteger(event.stepNumber)) return false;
  return completionActionForOnboardingStep(event.stepNumber) === event.actionType;
}

export function completionActionForOnboardingStep(stepNumber: number): string | null {
  if (!Number.isInteger(stepNumber)) return null;
  const doc = ONBOARDING_DOCS.find((candidate) => candidate.step === stepNumber);
  if (!doc) return null;

  return COMPLETION_ACTION_BY_KIND[doc.kind] ?? null;
}

export function pdfUrl(file: string): string {
  return `${ONBOARDING_PDF_BASE}/${file}`;
}

export type HarassmentQuizQuestion = {
  id: number;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export const HARASSMENT_QUIZ: HarassmentQuizQuestion[] = [
  {
    id: 1,
    prompt: 'Which of the following is NOT a permitted reporting option for sexual harassment at Rise & Shine ABA?',
    options: [
      'Filing directly with the EEOC or NY Division of Human Rights',
      'Reporting to your supervisor or Case Coordinator',
      'Emailing HR at info@riseandshine.nyc',
      'Posting about it on social media and tagging the company',
    ],
    correctIndex: 3,
  },
  {
    id: 2,
    prompt: 'Which of the following is an example of sexual harassment?',
    options: [
      'Sending a sexually suggestive meme to a coworker via text',
      'Giving a coworker constructive feedback on their work',
      'Asking a colleague about their weekend plans',
      "Complimenting someone's professional accomplishments",
    ],
    correctIndex: 0,
  },
  {
    id: 3,
    prompt: 'At Rise & Shine ABA, sexual harassment training is required:',
    options: [
      'Every 3 years',
      'Only for supervisors and managers',
      'Within 30 days of hire and annually thereafter',
      'Once, at hire only',
    ],
    correctIndex: 2,
  },
  {
    id: 4,
    prompt: 'Under New York State law, sexual harassment:',
    options: [
      'Does not need to be severe or pervasive to be illegal',
      'Only applies between employees of opposite genders',
      'Only applies to physical contact',
      'Must be severe AND pervasive to be illegal',
    ],
    correctIndex: 0,
  },
  {
    id: 5,
    prompt: 'Quid pro quo harassment means:',
    options: [
      'Harassment that occurs outside the workplace',
      'Online harassment through social media',
      'A supervisor conditioning employment benefits on sexual favors',
      'Two coworkers mutually agreeing to a relationship',
    ],
    correctIndex: 2,
  },
  {
    id: 6,
    prompt: 'Sexual harassment can occur:',
    options: [
      'Only in the physical workplace',
      'Only during working hours',
      'In the workplace, at off-site events, during travel, and through electronic communications',
      'Only between a supervisor and a subordinate',
    ],
    correctIndex: 2,
  },
  {
    id: 7,
    prompt: 'Which of the following is TRUE about retaliation?',
    options: [
      "Supervisors may reduce an employee's hours if they file a harassment complaint, as long as they don't fire them",
      'Minor retaliation is acceptable if the harassment complaint was minor',
      'Retaliation against anyone who reports harassment in good faith is prohibited and is itself a policy violation',
      'Retaliation is only prohibited if the original harassment complaint was proven true',
    ],
    correctIndex: 2,
  },
  {
    id: 8,
    prompt: "Who is protected under Rise & Shine ABA's Sexual Harassment Prevention Policy?",
    options: [
      'Only employees who have been with the company over 90 days',
      'Only full-time employees',
      'All employees, contractors, vendors, interns, applicants, and clients',
      'Only employees in supervisory roles',
    ],
    correctIndex: 2,
  },
  {
    id: 9,
    prompt: 'How long does an employee have to file a sexual harassment complaint with the NYS Division of Human Rights?',
    options: ['90 days', '1 year', '10 years', '3 years'],
    correctIndex: 3,
  },
  {
    id: 10,
    prompt: 'If you witness sexual harassment happening to a coworker, you should:',
    options: [
      'Only report it if the victim asks you to',
      "Ignore it — it's not your business",
      'Wait to see if it happens again before reporting',
      'Report it to a supervisor, HR, or the anonymous reporting channel',
    ],
    correctIndex: 3,
  },
];

export const HARASSMENT_QUIZ_PASS_PCT = 80;
