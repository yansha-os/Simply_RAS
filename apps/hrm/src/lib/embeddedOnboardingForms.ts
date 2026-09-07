export type EmbeddedFormKey =
  | 'form-w4'
  | 'form-it-2104'
  | 'direct-deposit'
  | 'background-check';

/** Mirrors IRS Form W-4 (2025) employee-facing Steps 1–5. */
export type W4FormValues = {
  firstName: string;
  middleInitial: string;
  lastName: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  ssn: string;
  filingStatus: 'SINGLE' | 'MARRIED_JOINT' | 'HEAD_OF_HOUSEHOLD' | '';
  multipleJobsTwoJobCheckbox: boolean;
  qualifyingChildrenCount: string;
  otherDependentsCount: string;
  otherCreditsAmount: string;
  otherIncome: string;
  deductions: string;
  extraWithholding: string;
  claimExempt: boolean;
};

/** Mirrors NYS Form IT-2104 employee-facing fields (employer box left to HR). */
export type It2104FormValues = {
  firstName: string;
  middleInitial: string;
  lastName: string;
  addressLine1: string;
  apartmentNumber: string;
  city: string;
  state: string;
  zipCode: string;
  ssn: string;
  /** Single or Head of household | Married | Married, but withhold at higher single rate */
  filingStatus: 'SINGLE_OR_HOH' | 'MARRIED' | 'MARRIED_HIGHER_SINGLE' | '';
  nycResident: 'YES' | 'NO' | '';
  yonkersResident: 'YES' | 'NO' | '';
  /** Line 1 — NYS / Yonkers allowances */
  nysAllowances: string;
  /** Line 2 — NYC allowances */
  nycAllowances: string;
  /** Line 3 — additional NYS withholding per pay period */
  additionalNys: string;
  /** Line 4 — additional NYC withholding per pay period */
  additionalNyc: string;
  /** Line 5 — additional Yonkers withholding per pay period */
  additionalYonkers: string;
};

/** Mirrors Rise & Shine Direct Deposit Authorization Form. */
export type DirectDepositFormValues = {
  fullName: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  ssnLast4: string;
  // Primary (required)
  bankName: string;
  accountType: 'CHECKING' | 'SAVINGS' | '';
  routingNumber: string;
  accountNumber: string;
  confirmAccountNumber: string;
  primaryDeposit: 'FULL' | 'OTHER' | '';
  primaryOtherAmount: string;
  // Secondary (optional)
  hasSecondary: boolean;
  secondaryBankName: string;
  secondaryAccountType: 'CHECKING' | 'SAVINGS' | '';
  secondaryRoutingNumber: string;
  secondaryAccountNumber: string;
  secondaryConfirmAccountNumber: string;
  secondaryDeposit: 'AMOUNT' | 'REMAINDER' | '';
  secondaryAmount: string;
  /** Attached / will provide void check or bank letter */
  documentationAcknowledged: boolean;
  authorizeAch: boolean;
  understandTiming: boolean;
};

/** Mirrors Rise & Shine Background Check Authorization Form. */
export type BackgroundCheckFormValues = {
  fullLegalName: string;
  otherNames: string;
  dateOfBirth: string;
  ssnLast4: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  authorizeBackground: boolean;
  acknowledgeRights: boolean;
  ongoingAuthorization: boolean;
  certifyTrue: boolean;
  isUnder18: boolean;
  parentGuardianName: string;
};

export type EmbeddedFormPayload =
  | { key: 'form-w4'; values: W4FormValues }
  | { key: 'form-it-2104'; values: It2104FormValues }
  | { key: 'direct-deposit'; values: DirectDepositFormValues }
  | { key: 'background-check'; values: BackgroundCheckFormValues };

const SSN_RE = /^\d{3}-?\d{2}-?\d{4}$/;
const SSN_LAST4_RE = /^\d{4}$/;
const ROUTING_RE = /^\d{9}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s().+-]{7,20}$/;

function trim(s: string) {
  return String(s || '').trim();
}

function requireText(label: string, value: string, min = 1, max = 120): string | null {
  const v = trim(value);
  if (v.length < min) return `${label} is required.`;
  if (v.length > max) return `${label} is too long.`;
  return null;
}

function normalizeSsn(ssn: string): string {
  return trim(ssn).replace(/\D/g, '');
}

export function ssnLast4(ssn: string): string {
  const digits = normalizeSsn(ssn);
  return digits.length >= 4 ? digits.slice(-4) : '****';
}

function parseNonNegNumber(raw: string, label: string): number | string {
  const v = trim(raw);
  if (v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return `${label} must be a valid non-negative number.`;
  return n;
}

function parseAllowances(raw: string, label: string): number | string {
  const n = parseNonNegNumber(raw, label);
  if (typeof n === 'string') return n;
  if (!Number.isInteger(n) || n > 99) return `${label} must be a whole number 0–99.`;
  return n;
}

/** Step 3 line total: (children × $2,000) + (other dependents × $500) + other credits. */
export function computeW4Step3Total(values: W4FormValues): number {
  const children = Number(values.qualifyingChildrenCount) || 0;
  const other = Number(values.otherDependentsCount) || 0;
  const credits = Number(values.otherCreditsAmount) || 0;
  return children * 2000 + other * 500 + credits;
}

export function emptyW4(): W4FormValues {
  return {
    firstName: '',
    middleInitial: '',
    lastName: '',
    addressLine1: '',
    city: '',
    state: 'NY',
    zipCode: '',
    ssn: '',
    filingStatus: '',
    multipleJobsTwoJobCheckbox: false,
    qualifyingChildrenCount: '0',
    otherDependentsCount: '0',
    otherCreditsAmount: '0',
    otherIncome: '0',
    deductions: '0',
    extraWithholding: '0',
    claimExempt: false,
  };
}

export function emptyIt2104(): It2104FormValues {
  return {
    firstName: '',
    middleInitial: '',
    lastName: '',
    addressLine1: '',
    apartmentNumber: '',
    city: '',
    state: 'NY',
    zipCode: '',
    ssn: '',
    filingStatus: '',
    nycResident: '',
    yonkersResident: '',
    nysAllowances: '0',
    nycAllowances: '0',
    additionalNys: '0',
    additionalNyc: '0',
    additionalYonkers: '0',
  };
}

export function emptyDirectDeposit(): DirectDepositFormValues {
  return {
    fullName: '',
    addressLine1: '',
    city: '',
    state: 'NY',
    zipCode: '',
    phone: '',
    email: '',
    ssnLast4: '',
    bankName: '',
    accountType: '',
    routingNumber: '',
    accountNumber: '',
    confirmAccountNumber: '',
    primaryDeposit: 'FULL',
    primaryOtherAmount: '',
    hasSecondary: false,
    secondaryBankName: '',
    secondaryAccountType: '',
    secondaryRoutingNumber: '',
    secondaryAccountNumber: '',
    secondaryConfirmAccountNumber: '',
    secondaryDeposit: 'REMAINDER',
    secondaryAmount: '',
    documentationAcknowledged: false,
    authorizeAch: false,
    understandTiming: false,
  };
}

export function emptyBackgroundCheck(): BackgroundCheckFormValues {
  return {
    fullLegalName: '',
    otherNames: 'N/A',
    dateOfBirth: '',
    ssnLast4: '',
    phone: '',
    email: '',
    addressLine1: '',
    city: '',
    state: 'NY',
    zipCode: '',
    authorizeBackground: false,
    acknowledgeRights: false,
    ongoingAuthorization: false,
    certifyTrue: false,
    isUnder18: false,
    parentGuardianName: '',
  };
}

export function validateEmbeddedForm(payload: EmbeddedFormPayload): string | null {
  if (payload.key === 'form-w4') {
    const v = payload.values;
    const children = parseNonNegNumber(v.qualifyingChildrenCount, 'Qualifying children');
    if (typeof children === 'string') return children;
    const otherDeps = parseNonNegNumber(v.otherDependentsCount, 'Other dependents');
    if (typeof otherDeps === 'string') return otherDeps;
    const otherCredits = parseNonNegNumber(v.otherCreditsAmount, 'Other credits');
    if (typeof otherCredits === 'string') return otherCredits;
    const otherIncome = parseNonNegNumber(v.otherIncome, 'Other income');
    if (typeof otherIncome === 'string') return otherIncome;
    const deductions = parseNonNegNumber(v.deductions, 'Deductions');
    if (typeof deductions === 'string') return deductions;
    const extra = parseNonNegNumber(v.extraWithholding, 'Extra withholding');
    if (typeof extra === 'string') return extra;
    if (!Number.isInteger(children) || children > 30) {
      return 'Qualifying children must be a whole number 0–30.';
    }
    if (!Number.isInteger(otherDeps) || otherDeps > 30) {
      return 'Other dependents must be a whole number 0–30.';
    }
    return (
      requireText('First name', v.firstName) ||
      requireText('Last name', v.lastName) ||
      requireText('Address', v.addressLine1) ||
      requireText('City', v.city) ||
      requireText('State', v.state, 2, 2) ||
      (ZIP_RE.test(trim(v.zipCode)) ? null : 'Enter a valid ZIP code.') ||
      (SSN_RE.test(trim(v.ssn)) ? null : 'Enter a valid SSN (XXX-XX-XXXX).') ||
      (v.filingStatus ? null : 'Select a filing status (Step 1c).') ||
      null
    );
  }

  if (payload.key === 'form-it-2104') {
    const v = payload.values;
    const nys = parseAllowances(v.nysAllowances, 'NYS allowances (line 1)');
    if (typeof nys === 'string') return nys;
    const nyc = parseAllowances(v.nycAllowances, 'NYC allowances (line 2)');
    if (typeof nyc === 'string') return nyc;
    for (const [raw, label] of [
      [v.additionalNys, 'NYS additional withholding (line 3)'],
      [v.additionalNyc, 'NYC additional withholding (line 4)'],
      [v.additionalYonkers, 'Yonkers additional withholding (line 5)'],
    ] as const) {
      const n = parseNonNegNumber(raw, label);
      if (typeof n === 'string') return n;
    }
    return (
      requireText('First name', v.firstName) ||
      requireText('Last name', v.lastName) ||
      requireText('Permanent home address', v.addressLine1) ||
      requireText('City', v.city) ||
      requireText('State', v.state, 2, 2) ||
      (ZIP_RE.test(trim(v.zipCode)) ? null : 'Enter a valid ZIP code.') ||
      (SSN_RE.test(trim(v.ssn)) ? null : 'Enter a valid SSN (XXX-XX-XXXX).') ||
      (v.filingStatus ? null : 'Select marital / filing status.') ||
      (v.nycResident ? null : 'Answer whether you are a New York City resident.') ||
      (v.yonkersResident ? null : 'Answer whether you are a Yonkers resident.') ||
      null
    );
  }

  if (payload.key === 'direct-deposit') {
    const v = payload.values;
    const baseErr =
      requireText('Full name', v.fullName, 2) ||
      requireText('Address', v.addressLine1) ||
      requireText('City', v.city) ||
      requireText('State', v.state, 2, 2) ||
      (ZIP_RE.test(trim(v.zipCode)) ? null : 'Enter a valid ZIP code.') ||
      (PHONE_RE.test(trim(v.phone)) ? null : 'Enter a valid phone number.') ||
      (EMAIL_RE.test(trim(v.email)) ? null : 'Enter a valid email.') ||
      (SSN_LAST4_RE.test(trim(v.ssnLast4)) ? null : 'Enter the last 4 digits of your SSN.') ||
      requireText('Bank name', v.bankName) ||
      (v.accountType ? null : 'Select primary account type.') ||
      (ROUTING_RE.test(trim(v.routingNumber)) ? null : 'Primary routing number must be 9 digits.') ||
      requireText('Account number', v.accountNumber, 4, 34) ||
      (trim(v.accountNumber) === trim(v.confirmAccountNumber)
        ? null
        : 'Primary account numbers do not match.') ||
      (v.primaryDeposit ? null : 'Select primary deposit amount.') ||
      (v.primaryDeposit === 'OTHER' && !(Number(v.primaryOtherAmount) > 0)
        ? 'Enter the other primary deposit amount.'
        : null) ||
      (v.documentationAcknowledged
        ? null
        : 'Acknowledge that you will provide a void check or bank letter.') ||
      (v.authorizeAch ? null : 'You must authorize ACH deposits.') ||
      (v.understandTiming ? null : 'Acknowledge the 1–2 payroll cycle timing notice.');
    if (baseErr) return baseErr;

    if (v.hasSecondary) {
      return (
        requireText('Secondary bank name', v.secondaryBankName) ||
        (v.secondaryAccountType ? null : 'Select secondary account type.') ||
        (ROUTING_RE.test(trim(v.secondaryRoutingNumber))
          ? null
          : 'Secondary routing number must be 9 digits.') ||
        requireText('Secondary account number', v.secondaryAccountNumber, 4, 34) ||
        (trim(v.secondaryAccountNumber) === trim(v.secondaryConfirmAccountNumber)
          ? null
          : 'Secondary account numbers do not match.') ||
        (v.secondaryDeposit ? null : 'Select secondary deposit option.') ||
        (v.secondaryDeposit === 'AMOUNT' && !(Number(v.secondaryAmount) > 0)
          ? 'Enter the secondary deposit amount.'
          : null) ||
        null
      );
    }
    return null;
  }

  const v = payload.values;
  return (
    requireText('Full legal name', v.fullLegalName, 2) ||
    requireText('Other names used', v.otherNames) ||
    requireText('Date of birth', v.dateOfBirth, 8, 12) ||
    (SSN_LAST4_RE.test(trim(v.ssnLast4)) ? null : 'Enter the last 4 digits of your SSN.') ||
    (PHONE_RE.test(trim(v.phone)) ? null : 'Enter a valid phone number.') ||
    (EMAIL_RE.test(trim(v.email)) ? null : 'Enter a valid email.') ||
    requireText('Current address', v.addressLine1) ||
    requireText('City', v.city) ||
    requireText('State', v.state, 2, 2) ||
    (ZIP_RE.test(trim(v.zipCode)) ? null : 'Enter a valid ZIP code.') ||
    (v.authorizeBackground ? null : 'Background check authorization is required.') ||
    (v.acknowledgeRights ? null : 'Applicant rights acknowledgment is required.') ||
    (v.ongoingAuthorization ? null : 'Ongoing authorization is required.') ||
    (v.certifyTrue ? null : 'You must certify the information is true and complete.') ||
    (v.isUnder18 && trim(v.parentGuardianName).length < 2
      ? 'Parent/guardian name is required for applicants under 18.'
      : null) ||
    null
  );
}

/** Redacted copy for audit event (no full SSN / account numbers). */
export function redactForAudit(payload: EmbeddedFormPayload): Record<string, unknown> {
  if (payload.key === 'form-w4') {
    const { ssn, ...rest } = payload.values;
    return {
      ...rest,
      ssnLast4: ssnLast4(ssn),
      step3Total: computeW4Step3Total(payload.values),
    };
  }
  if (payload.key === 'form-it-2104') {
    const { ssn, ...rest } = payload.values;
    return { ...rest, ssnLast4: ssnLast4(ssn) };
  }
  if (payload.key === 'direct-deposit') {
    const {
      accountNumber,
      confirmAccountNumber,
      secondaryAccountNumber,
      secondaryConfirmAccountNumber,
      ...rest
    } = payload.values;
    void confirmAccountNumber;
    void secondaryConfirmAccountNumber;
    const primaryDigits = trim(accountNumber).replace(/\D/g, '');
    const secondaryDigits = trim(secondaryAccountNumber).replace(/\D/g, '');
    return {
      ...rest,
      accountLast4: primaryDigits.length >= 4 ? primaryDigits.slice(-4) : '****',
      secondaryAccountLast4:
        payload.values.hasSecondary && secondaryDigits.length >= 4
          ? secondaryDigits.slice(-4)
          : null,
    };
  }
  return { ...payload.values };
}

/** Normalized values stored on packet.formData (sensitive, staff-only). */
export function normalizeForStorage(payload: EmbeddedFormPayload): Record<string, unknown> {
  if (payload.key === 'direct-deposit') {
    const {
      confirmAccountNumber: _c1,
      secondaryConfirmAccountNumber: _c2,
      ...rest
    } = payload.values;
    void _c1;
    void _c2;
    return {
      ...rest,
      fullName: trim(rest.fullName),
      bankName: trim(rest.bankName),
      routingNumber: trim(rest.routingNumber),
      accountNumber: trim(rest.accountNumber),
      secondaryRoutingNumber: trim(rest.secondaryRoutingNumber),
      secondaryAccountNumber: trim(rest.secondaryAccountNumber),
      submittedAt: new Date().toISOString(),
    };
  }
  if (payload.key === 'form-w4') {
    return {
      ...payload.values,
      ssn: normalizeSsn(payload.values.ssn),
      step3Total: computeW4Step3Total(payload.values),
      submittedAt: new Date().toISOString(),
    };
  }
  if (payload.key === 'form-it-2104') {
    return {
      ...payload.values,
      ssn: normalizeSsn(payload.values.ssn),
      submittedAt: new Date().toISOString(),
    };
  }
  return { ...payload.values, submittedAt: new Date().toISOString() };
}
