import React, { useState, useRef, useEffect } from 'react';
import { Calendar, AlertCircle, ChevronDown, Search, Check } from 'lucide-react';

export const AdminReviewContext = React.createContext<{
  adminReviewMode: boolean;
  isRejectionMode: boolean;
  readOnly: boolean;
  rejectedFields: string[];
  stagedRejections: string[];
  onRejectField: (fieldId: string) => void;
}>({ adminReviewMode: false, isRejectionMode: false, readOnly: false, rejectedFields: [], stagedRejections: [], onRejectField: () => {} });

export function ReadOnlyDisplay({ label, value }: { label: React.ReactNode, value: React.ReactNode }) {
  let displayValue: React.ReactNode = value;
  if (typeof value === 'boolean') displayValue = value ? 'Yes' : 'No';
  return (
    <div className="bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl p-4 h-full flex flex-col justify-center w-full">
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">{label}</label>
      <div className="text-slate-900 font-semibold text-sm break-words">{displayValue || <span className="text-slate-400 italic font-normal">Not provided</span>}</div>
    </div>
  );
}

export function FieldWrapper({ fieldId, children }: { fieldId: string, children: React.ReactNode }) {
  const { adminReviewMode, isRejectionMode, rejectedFields, stagedRejections, onRejectField } = React.useContext(AdminReviewContext);
  const isRejected = rejectedFields.includes(fieldId);
  const isStaged = stagedRejections.includes(fieldId);

  // In Client Mode or View Mode
  if (!adminReviewMode) {
    const isLocked = isRejectionMode && !isRejected;
    return (
      <div className={`relative ${isRejected ? 'p-3 rounded-xl border border-red-500/50 bg-red-500/10' : ''} ${isLocked ? 'pointer-events-none opacity-50' : ''}`}>
        {isRejected && (
          <div className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2 animate-pulse"></span>
            Changes Requested
          </div>
        )}
        {children}
      </div>
    );
  }

  // In Admin Review Mode
  return (
    <div className="relative group">
      <div className={`pointer-events-none transition-opacity ${isRejected || isStaged ? 'opacity-30' : ''}`}>
        {children}
      </div>
      <div
        className={`absolute inset-0 z-10 cursor-pointer border-2 rounded-xl flex items-center justify-center transition-all
          ${isStaged ? 'border-orange-500 bg-orange-500/20' : isRejected ? 'border-red-500 bg-red-500/20' : 'border-transparent hover:border-orange-500/50 hover:bg-orange-500/10'}
        `}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRejectField(fieldId); }}
      >
        {isStaged && <span className="bg-orange-500 text-black text-[10px] uppercase font-bold px-2 py-1 rounded shadow-lg">STAGED FOR REJECTION</span>}
        {isRejected && !isStaged && <span className="bg-red-500 text-white text-[10px] uppercase font-bold px-2 py-1 rounded shadow-lg">REJECTED (Will be wiped)</span>}
      </div>
    </div>
  );
}

export function SectionCard({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="panel glass">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function formatPhoneNumber(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function validatePhoneNumber(input: string): { isValid: boolean; error: string | null } {
  if (!input || input.trim() === '') {
    return { isValid: true, error: null };
  }

  const digits = input.replace(/\D/g, '');
  if (digits.length < 10) {
    return { isValid: false, error: 'Phone number must be 10 digits (e.g. (555) 000-0000)' };
  }

  if (digits.length > 10) {
    return { isValid: false, error: 'Phone number cannot exceed 10 digits' };
  }

  // Area code cannot start with 0 or 1 in US/NANP
  if (digits[0] === '0' || digits[0] === '1') {
    return { isValid: false, error: 'Area code cannot start with 0 or 1' };
  }

  // Exchange code cannot start with 0 or 1
  if (digits[3] === '0' || digits[3] === '1') {
    return { isValid: false, error: 'Exchange code cannot start with 0 or 1' };
  }

  // Check for dummy repeating numbers (e.g. 000-000-0000, 999-999-9999)
  const isRepeating = /^(\d)\1{9}$/.test(digits);
  if (isRepeating) {
    return { isValid: false, error: 'Please enter a valid phone number' };
  }

  return { isValid: true, error: null };
}

export function AutoSavePhoneInput({
  label,
  fieldId,
  defaultValue,
  onBlur,
  required,
  placeholder = "(555) 000-0000",
}: {
  label: string;
  fieldId: string;
  defaultValue?: string | null;
  onBlur: (fieldId: string, value: string) => unknown;
  required?: boolean;
  placeholder?: string;
}) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const normalizedDefaultValue = defaultValue ? formatPhoneNumber(defaultValue) : '';
  const [lastDefaultValue, setLastDefaultValue] = useState(normalizedDefaultValue);
  const [val, setVal] = useState(normalizedDefaultValue);
  const [error, setError] = useState<string | null>(null);

  if (normalizedDefaultValue !== lastDefaultValue) {
    setLastDefaultValue(normalizedDefaultValue);
    setVal(normalizedDefaultValue);
    setError(normalizedDefaultValue ? validatePhoneNumber(normalizedDefaultValue).error : null);
  }

  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const digits = val.replace(/\D/g, '');
  const isMissing = required && (!val || digits.length < 10);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatPhoneNumber(raw);
    setVal(formatted);

    const dig = formatted.replace(/\D/g, '');
    if (dig.length === 10) {
      const res = validatePhoneNumber(formatted);
      setError(res.error);
      if (res.isValid) {
        onBlur(fieldId, formatted);
      }
    } else {
      setError(null);
    }
  };

  const handleBlur = () => {
    if (!val) {
      setError(null);
      onBlur(fieldId, '');
      return;
    }

    const res = validatePhoneNumber(val);
    setError(res.error);
    if (res.isValid) {
      onBlur(fieldId, val);
    }
  };

  const inputId = `intake-${fieldId}`;

  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field ${isMissing ? 'missing' : ''}`}>
        <label htmlFor={inputId}>{label}</label>
        <div className="relative flex items-center">
          <input
            id={inputId}
            type="tel"
            value={val}
            placeholder={placeholder}
            onChange={handleChange}
            onBlur={handleBlur}
            maxLength={14}
            className={`w-full h-11 px-3.5 bg-white border rounded-xl font-mono font-semibold text-sm outline-none transition-all shadow-xs ${
              error
                ? 'border-red-400 focus:border-red-500 bg-red-50/20 text-red-950'
                : 'border-[#E2D5B7] focus:border-orange-500 text-slate-900'
            }`}
            autoComplete="tel"
          />
        </div>
        {error && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-red-600 font-medium animate-in fade-in">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

export function validateEmail(emailStr: string): { isValid: boolean; error: string | null } {
  if (!emailStr || emailStr.trim() === '') {
    return { isValid: true, error: null };
  }
  const clean = emailStr.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(clean)) {
    return { isValid: false, error: 'Please enter a valid email address (e.g. name@example.com)' };
  }
  return { isValid: true, error: null };
}

function inferInputConstraint(
  fieldId: string = '',
  type: string = 'text',
  explicitAllow?: 'alpha' | 'numeric' | 'alphanumeric' | 'any'
): 'alpha' | 'numeric' | 'alphanumeric' | 'email' | 'tel' | 'any' {
  if (type === 'tel') return 'tel';
  if (type === 'email') return 'email';
  if (type === 'number' || explicitAllow === 'numeric') return 'numeric';
  if (explicitAllow === 'alpha') return 'alpha';
  if (explicitAllow === 'alphanumeric') return 'alphanumeric';
  if (explicitAllow === 'any') return 'any';

  const f = fieldId.toLowerCase();

  // Specific name & word-only fields: letters, spaces, hyphens, apostrophes only
  if (
    f.includes('firstname') ||
    f.includes('lastname') ||
    f.includes('middlename') ||
    f.includes('preferredname') ||
    f.includes('relation') ||
    f.includes('childname') ||
    f.includes('g1name') ||
    f.includes('g2name') ||
    f.includes('em1name') ||
    f.includes('em2name') ||
    f.includes('attestationname') ||
    f.includes('dxprovidername') ||
    f.includes('pcpname') ||
    f.includes('referralprovider')
  ) {
    return 'alpha';
  }

  // Alphanumeric ID fields
  if (
    f.includes('memberid') ||
    f.includes('group') ||
    f.includes('medicaidid') ||
    f.includes('cin')
  ) {
    return 'alphanumeric';
  }

  return 'any';
}

type AutoSaveInputProps = {
  label: string;
  fieldId?: string;
  type?: React.HTMLInputTypeAttribute;
  defaultValue?: string | null;
  onBlur: (fieldId: string, value: string) => unknown;
  required?: boolean;
  placeholder?: string;
  allowChars?: 'alpha' | 'numeric' | 'alphanumeric' | 'any';
};

export function AutoSaveInput({
  label,
  fieldId = '',
  type = "text",
  defaultValue,
  onBlur,
  required,
  placeholder,
  allowChars,
}: AutoSaveInputProps) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);

  const constraint = inferInputConstraint(fieldId, type, allowChars);
  const normalizedDefaultValue = defaultValue || '';
  const inputSyncKey = `${constraint}:${normalizedDefaultValue}`;
  const [lastInputSyncKey, setLastInputSyncKey] = useState(inputSyncKey);
  const [val, setVal] = useState(normalizedDefaultValue);
  const [error, setError] = useState<string | null>(null);

  if (inputSyncKey !== lastInputSyncKey) {
    setLastInputSyncKey(inputSyncKey);
    setVal(normalizedDefaultValue);
    setError(
      constraint === 'email' && normalizedDefaultValue
        ? validateEmail(normalizedDefaultValue).error
        : null,
    );
  }

  if (type === 'tel') {
    return (
      <AutoSavePhoneInput
        label={label}
        fieldId={fieldId}
        defaultValue={defaultValue}
        onBlur={onBlur}
        required={required}
        placeholder={placeholder || "(555) 000-0000"}
      />
    );
  }

  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;
  const inputId = `intake-${fieldId}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let clean = e.target.value;

    if (constraint === 'alpha') {
      // Allow only letters, spaces, hyphens, periods, and apostrophes
      clean = clean.replace(/[^a-zA-Z\s\-'.]/g, '');
    } else if (constraint === 'numeric') {
      // Allow only numbers
      clean = clean.replace(/\D/g, '');
    } else if (constraint === 'alphanumeric') {
      // Allow letters, numbers, spaces, hyphens, periods, hash
      clean = clean.replace(/[^a-zA-Z0-9\s\-#.]/g, '');
    } else if (constraint === 'email') {
      // Disallow internal whitespace
      clean = clean.replace(/\s/g, '');
      if (clean === '' || clean.includes('@')) {
        setError(null);
      }
    }

    setVal(clean);
  };

  const handleBlur = () => {
    if (constraint === 'email' && val) {
      const res = validateEmail(val);
      setError(res.error);
      if (res.isValid) {
        onBlur(fieldId, val);
      }
    } else {
      setError(null);
      onBlur(fieldId, val);
    }
  };

  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field ${isMissing ? 'missing' : ''}`}>
        <label htmlFor={inputId}>{label}</label>
        <div className="relative flex items-center">
          <input
            id={inputId}
            type={type === 'email' ? 'email' : 'text'}
            value={val}
            placeholder={placeholder}
            onChange={handleChange}
            onBlur={handleBlur}
            className={error ? 'border-red-400 focus:border-red-500 bg-red-50/20 text-red-950' : ''}
          />
        </div>
        {error && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-red-600 font-medium animate-in fade-in">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

const toMMDDYYYY = (inputVal: string) => {
  if (!inputVal) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(inputVal)) {
    const [y, m, d] = inputVal.split('-');
    return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
  }
  return inputVal;
};

export function validateDateMMDDYYYY(dateStr: string, isDob: boolean = false): { isValid: boolean; error: string | null } {
  if (!dateStr || dateStr.trim() === '') {
    return { isValid: true, error: null };
  }

  const parts = dateStr.split('/');
  if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
    return { isValid: false, error: 'Format must be MM/DD/YYYY' };
  }

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(month) || isNaN(day) || isNaN(year)) {
    return { isValid: false, error: 'Invalid date numbers' };
  }

  if (month < 1 || month > 12) {
    return { isValid: false, error: 'Month must be between 01 and 12' };
  }

  const currentYear = new Date().getFullYear();
  if (year < 1920 || year > currentYear + 20) {
    return { isValid: false, error: `Year must be between 1920 and ${currentYear + 20}` };
  }

  const maxDays = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDays) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return {
      isValid: false,
      error: `${monthNames[month - 1]} only has ${maxDays} days`
    };
  }

  if (isDob) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const inputDate = new Date(year, month - 1, day);
    if (inputDate > today) {
      return { isValid: false, error: 'Date of birth cannot be in the future' };
    }
  }

  return { isValid: true, error: null };
}

function getAgeDescription(mmddyyyy: string): string | null {
  if (!mmddyyyy) return null;
  const parts = mmddyyyy.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  const [m, d, y] = parts.map((p) => parseInt(p, 10));
  if (isNaN(m) || isNaN(d) || isNaN(y) || y < 1920 || y > 2035) return null;

  const birthDate = new Date(y, m - 1, d);
  const now = new Date();
  let years = now.getFullYear() - birthDate.getFullYear();
  let months = now.getMonth() - birthDate.getMonth();
  if (now.getDate() < birthDate.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return null;
  if (years === 0) return `${months} months old`;
  if (years === 1) return `1 year old`;
  return `${years} years old`;
}

type AutoSaveDateInputProps = {
  label: string;
  fieldId: string;
  defaultValue?: string | null;
  onBlur: (fieldId: string, value: string) => unknown;
  required?: boolean;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  className?: string;
};

export function AutoSaveDateInput({ label, fieldId, defaultValue, onBlur, required, placeholder }: AutoSaveDateInputProps) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const normalizedDefaultValue = defaultValue ? toMMDDYYYY(defaultValue) : '';
  const isDobField = fieldId.toLowerCase().includes('dob') || fieldId.toLowerCase().includes('birth') || label.toLowerCase().includes('birth');
  const dateSyncKey = `${isDobField}:${normalizedDefaultValue}`;
  const [lastDateSyncKey, setLastDateSyncKey] = useState(dateSyncKey);
  const [val, setVal] = useState(normalizedDefaultValue);
  const [error, setError] = useState<string | null>(null);

  if (dateSyncKey !== lastDateSyncKey) {
    setLastDateSyncKey(dateSyncKey);
    setVal(normalizedDefaultValue);
    setError(
      normalizedDefaultValue.length === 10
        ? validateDateMMDDYYYY(normalizedDefaultValue, isDobField).error
        : null,
    );
  }

  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && (!val || val.length < 10);
  const ageDescription = isDobField && val.length === 10 && !error ? getAgeDescription(val) : null;

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.replace(/\D/g, '');
    if (input.length > 8) input = input.slice(0, 8);

    let formatted = input;
    if (input.length > 4) {
      formatted = `${input.slice(0, 2)}/${input.slice(2, 4)}/${input.slice(4)}`;
    } else if (input.length > 2) {
      formatted = `${input.slice(0, 2)}/${input.slice(2)}`;
    }

    setVal(formatted);

    if (formatted.length === 10) {
      const res = validateDateMMDDYYYY(formatted, isDobField);
      setError(res.error);
      if (res.isValid) {
        onBlur(fieldId, formatted);
      }
    } else {
      setError(null);
    }
  };

  const handleBlur = () => {
    if (!val) {
      setError(null);
      onBlur(fieldId, '');
      return;
    }

    if (val.length < 10) {
      setError('Please enter a complete date (MM/DD/YYYY)');
      return;
    }

    const res = validateDateMMDDYYYY(val, isDobField);
    setError(res.error);
    if (res.isValid) {
      onBlur(fieldId, val);
    }
  };

  const inputId = `intake-${fieldId}`;

  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field ${isMissing ? 'missing' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label htmlFor={inputId} className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-0">
            {label}
          </label>
          {ageDescription && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-300 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
              👶 {ageDescription}
            </span>
          )}
        </div>
        <div className="relative flex items-center">
          <input
            id={inputId}
            type="text"
            value={val}
            placeholder={placeholder || "MM/DD/YYYY"}
            onChange={handleTextChange}
            onBlur={handleBlur}
            maxLength={10}
            className={`w-full h-11 px-3.5 bg-white border rounded-xl font-mono font-semibold text-sm outline-none transition-all shadow-xs pr-10 ${
              error
                ? 'border-red-400 focus:border-red-500 bg-red-50/20 text-red-950'
                : 'border-[#E2D5B7] focus:border-orange-500 text-slate-900'
            }`}
            autoComplete="off"
          />
          <div className="absolute right-3.5 text-slate-400 pointer-events-none">
            <Calendar className={`w-4 h-4 ${error ? 'text-red-400' : 'text-slate-400'}`} />
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-red-600 font-medium animate-in fade-in">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

type AutoSaveTextAreaProps = {
  label: string;
  fieldId: string;
  defaultValue?: string | null;
  onBlur: (fieldId: string, value: string) => unknown;
  required?: boolean;
  className?: string;
};

export function AutoSaveTextArea({ label, fieldId, defaultValue, onBlur, required }: AutoSaveTextAreaProps) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const normalizedDefaultValue = defaultValue || '';
  const [lastDefaultValue, setLastDefaultValue] = useState(normalizedDefaultValue);
  const [val, setVal] = useState(normalizedDefaultValue);
  if (normalizedDefaultValue !== lastDefaultValue) {
    setLastDefaultValue(normalizedDefaultValue);
    setVal(normalizedDefaultValue);
  }

  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;
  const inputId = `intake-${fieldId}`;
  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field ${isMissing ? 'missing' : ''}`}>
        <label htmlFor={inputId}>{label}</label>
        <textarea
          id={inputId}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => onBlur(fieldId, val)}
        />
      </div>
    </FieldWrapper>
  );
}

export function AutoSaveSelect({
  label,
  fieldId,
  options,
  defaultValue,
  onBlur,
  required,
  placeholder = "Select an option..."
}: {
  label: string;
  fieldId: string;
  options: string[];
  defaultValue?: string | null;
  onBlur: (fieldId: string, value: string) => unknown;
  required?: boolean;
  placeholder?: string;
}) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const normalizedDefaultValue = defaultValue || '';
  const [lastDefaultValue, setLastDefaultValue] = useState(normalizedDefaultValue);
  const [val, setVal] = useState(normalizedDefaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  if (normalizedDefaultValue !== lastDefaultValue) {
    setLastDefaultValue(normalizedDefaultValue);
    setVal(normalizedDefaultValue);
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;
  const inputId = `intake-${fieldId}`;

  const filteredOptions = (options || []).filter((opt: string) =>
    opt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (selectedVal: string) => {
    setVal(selectedVal);
    setIsOpen(false);
    setSearchQuery('');
    onBlur(fieldId, selectedVal);
  };

  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field relative ${isMissing ? 'missing' : ''}`} ref={containerRef}>
        <label htmlFor={inputId} className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">
          {label}
        </label>

        {/* Custom Trigger Button */}
        <div
          id={inputId}
          tabIndex={0}
          role="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
          className={`w-full min-h-[44px] px-3.5 py-2.5 bg-white border rounded-xl flex items-center justify-between text-sm transition-all shadow-xs cursor-pointer select-none ${
            isOpen
              ? 'border-orange-500 ring-2 ring-orange-200/50 bg-white'
              : isMissing
              ? 'border-yellow-400 bg-yellow-50/10'
              : 'border-[#E2D5B7] hover:border-orange-400'
          }`}
        >
          <span className={val ? 'text-slate-900 font-semibold truncate' : 'text-slate-400 truncate'}>
            {val || placeholder}
          </span>
          <ChevronDown className={`w-4 h-4 text-orange-500 transition-transform duration-200 shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {/* Custom Floating Dropdown Box (Styled identical to address autocomplete) */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-[#E2D5B7] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {options && options.length > 5 && (
              <div className="p-2 bg-[#F9F5EC] border-b border-[#E2D5B7]">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-orange-500 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    placeholder="Search options..."
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 bg-white border border-[#E2D5B7] focus:border-orange-500 rounded-lg text-xs font-medium outline-none text-slate-800"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <ul className="max-h-60 overflow-y-auto divide-y divide-[#E2D5B7]/40" role="listbox">
              {filteredOptions.length === 0 ? (
                <li className="px-4 py-3 text-xs text-slate-400 text-center italic">No matching options</li>
              ) : (
                filteredOptions.map((opt: string) => {
                  const isSelected = val === opt;
                  return (
                    <li
                      key={opt}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(opt)}
                      className={`px-3.5 py-2.5 hover:bg-[#FFF5ED] cursor-pointer transition flex items-center justify-between group text-left ${
                        isSelected ? 'bg-[#FFF5ED] font-bold text-[#EA580C]' : 'text-slate-800'
                      }`}
                    >
                      <span className="text-xs sm:text-sm group-hover:text-[#EA580C] transition-colors">{opt}</span>
                      {isSelected && <Check className="w-4 h-4 text-[#EA580C] shrink-0" />}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

export const COMMON_LANGUAGES = [
  'English',
  'Spanish',
  'Yiddish',
  'Hebrew',
  'Russian',
  'Cantonese',
  'Mandarin',
  'Arabic',
  'Bengali',
  'Urdu',
  'Hindi',
  'French',
  'Haitian Creole',
  'Polish',
  'Tagalog / Filipino',
  'Italian',
  'Portuguese',
  'Korean',
  'Japanese',
  'Vietnamese',
  'Punjabi',
  'Gujarati',
  'Persian / Farsi',
  'Turkish',
  'Ukrainian',
  'German',
  'Greek',
  'Uzbek',
  'Pashto',
  'Somali',
  'Swahili',
  'American Sign Language (ASL)',
  'Other',
];

export function AutoSaveLanguageSelect({
  label,
  fieldId,
  defaultValue,
  onBlur,
  required,
  allowNone = false,
  placeholder = 'Select language...',
}: {
  label: string;
  fieldId: string;
  defaultValue?: string | null;
  onBlur: (fieldId: string, value: string) => unknown;
  required?: boolean;
  allowNone?: boolean;
  placeholder?: string;
}) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);

  const options = allowNone
    ? ['None / English Only', ...COMMON_LANGUAGES]
    : COMMON_LANGUAGES;

  const getInitialSelected = (val?: string | null) => {
    if (!val) return '';
    if (options.includes(val)) return val;
    return 'Other';
  };

  const [selectedOption, setSelectedOption] = useState<string>(() => getInitialSelected(defaultValue));
  const [customValue, setCustomValue] = useState<string>(() => {
    if (defaultValue && !options.filter(o => o !== 'Other').includes(defaultValue)) {
      return defaultValue;
    }
    return '';
  });
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const languageSyncKey = `${allowNone}:${defaultValue || ''}`;
  const [lastLanguageSyncKey, setLastLanguageSyncKey] = useState(languageSyncKey);

  if (languageSyncKey !== lastLanguageSyncKey) {
    setLastLanguageSyncKey(languageSyncKey);
    const isStandard = options.filter(o => o !== 'Other').includes(defaultValue || '');
    if (isStandard) {
      setSelectedOption(defaultValue || '');
      setCustomValue('');
    } else if (defaultValue) {
      setSelectedOption('Other');
      setCustomValue(defaultValue);
    } else {
      setSelectedOption('');
      setCustomValue('');
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (readOnly && !adminReviewMode) {
    const display = defaultValue || <span className="text-slate-400 italic">Not provided</span>;
    return <ReadOnlyDisplay label={label} value={display} />;
  }

  if (adminReviewMode) {
    return (
      <FieldWrapper fieldId={fieldId}>
        <ReadOnlyDisplay label={label} value={defaultValue} />
      </FieldWrapper>
    );
  }

  const handleSelectOption = (opt: string) => {
    setSelectedOption(opt);
    setIsOpen(false);
    setSearchQuery('');

    if (opt === 'Other') {
      if (customValue.trim()) {
        onBlur(fieldId, customValue.trim());
      }
    } else {
      setCustomValue('');
      onBlur(fieldId, opt);
    }
  };

  const handleCustomBlur = () => {
    if (selectedOption === 'Other') {
      onBlur(fieldId, customValue.trim());
    }
  };

  const isMissing = required && (!selectedOption || (selectedOption === 'Other' && !customValue.trim()));
  const inputId = `intake-${fieldId}`;

  const filteredLanguages = options.filter((opt) =>
    opt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayLabel = selectedOption === 'Other' && customValue
    ? `Other (${customValue})`
    : selectedOption || placeholder;

  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field relative ${isMissing ? 'missing' : ''}`} ref={containerRef}>
        <label htmlFor={inputId} className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">
          {label}
        </label>

        {/* Custom Trigger Button */}
        <div
          id={inputId}
          tabIndex={0}
          role="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
          className={`w-full min-h-[44px] px-3.5 py-2.5 bg-white border rounded-xl flex items-center justify-between text-sm transition-all shadow-xs cursor-pointer select-none ${
            isOpen
              ? 'border-orange-500 ring-2 ring-orange-200/50 bg-white'
              : isMissing
              ? 'border-yellow-400 bg-yellow-50/10'
              : 'border-[#E2D5B7] hover:border-orange-400'
          }`}
        >
          <span className={selectedOption ? 'text-slate-900 font-semibold truncate' : 'text-slate-400 truncate'}>
            {displayLabel}
          </span>
          <ChevronDown className={`w-4 h-4 text-orange-500 transition-transform duration-200 shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {/* Custom Floating Dropdown Box with Search */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-[#E2D5B7] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Search header */}
            <div className="p-2 bg-[#F9F5EC] border-b border-[#E2D5B7]">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-orange-500 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  placeholder="Search languages..."
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 bg-white border border-[#E2D5B7] focus:border-orange-500 rounded-lg text-xs font-medium outline-none text-slate-800"
                  autoFocus
                />
              </div>
            </div>

            {/* Language list */}
            <ul className="max-h-60 overflow-y-auto divide-y divide-[#E2D5B7]/40" role="listbox">
              {filteredLanguages.length === 0 ? (
                <li className="px-4 py-3 text-xs text-slate-400 text-center italic">No matching languages</li>
              ) : (
                filteredLanguages.map((opt) => {
                  const isSelected = selectedOption === opt;
                  return (
                    <li
                      key={opt}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectOption(opt)}
                      className={`px-3.5 py-2.5 hover:bg-[#FFF5ED] cursor-pointer transition flex items-center justify-between group text-left ${
                        isSelected ? 'bg-[#FFF5ED] font-bold text-[#EA580C]' : 'text-slate-800'
                      }`}
                    >
                      <span className="text-xs sm:text-sm group-hover:text-[#EA580C] transition-colors">{opt}</span>
                      {isSelected && <Check className="w-4 h-4 text-[#EA580C] shrink-0" />}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        {/* Custom text input when Other is selected */}
        {selectedOption === 'Other' && (
          <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <input
              type="text"
              value={customValue}
              placeholder="Please specify your language..."
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={handleCustomBlur}
              className="w-full h-10 px-3.5 bg-[#FFFDF8] border-2 border-orange-300 focus:border-orange-500 rounded-xl text-slate-900 font-medium text-sm outline-none transition-all shadow-inner"
              autoFocus
            />
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}

export function AutoSaveRadio({ label, fieldId, options, currentValue, onChange, required }: {
  label?: string;
  fieldId: string;
  options: string[];
  currentValue?: string | null;
  onChange: (fieldId: string, value: string) => unknown;
  required?: boolean;
}) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={currentValue} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={currentValue} /></FieldWrapper>;

  const isMissing = required && !currentValue;
  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field mb-3 ${isMissing ? 'missing !border-amber-400 !bg-amber-50 rounded-xl p-3' : ''}`}>
        {label && <label>{label}</label>}
        <div className="flex flex-wrap gap-2 mt-1.5">
          {options.map((opt: string) => (
            <label
              key={opt}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border cursor-pointer transition-all relative overflow-hidden group
                ${currentValue === opt ? 'bg-[#FFF5ED] border-[#EA580C] text-slate-900 shadow-xs ring-1 ring-orange-500/20' : 'bg-white border-[#E2D5B7] hover:border-orange-300 hover:bg-[#F9F5EC] text-slate-800'}
              `}
            >
              <input
                type="radio"
                name={fieldId}
                value={opt}
                checked={currentValue === opt}
                onChange={() => onChange(fieldId, opt)}
                className="peer sr-only"
              />
              <div className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center border transition-all
                peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white
                ${currentValue === opt ? 'border-[#EA580C] bg-white' : 'border-slate-300 group-hover:border-orange-400'}
              `}>
                {currentValue === opt && (
                  <div className="w-2 h-2 rounded-full bg-[#EA580C]" />
                )}
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-900">{opt}</span>
            </label>
          ))}
        </div>
      </div>
    </FieldWrapper>
  );
}

export function AutoSaveCheckbox({ label, fieldId, currentValue, onChange, description, required }: {
  label: string;
  fieldId: string;
  currentValue?: boolean | string | null;
  onChange: (fieldId: string, value: boolean) => unknown;
  description?: string;
  required?: boolean;
}) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={currentValue} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={currentValue} /></FieldWrapper>;

  const isMissing = required && !currentValue;
  return (
    <FieldWrapper fieldId={fieldId}>
      <label
        className={`flex items-center gap-3 px-3.5 py-2.5 sm:py-3 rounded-xl border cursor-pointer transition-all relative overflow-hidden group
          ${currentValue ? 'bg-[#FFF5ED] border-[#EA580C] text-slate-900 shadow-xs ring-1 ring-orange-500/20' : 'bg-white border-[#E2D5B7] hover:border-orange-300 hover:bg-[#F9F5EC] text-slate-800'}
          ${isMissing ? 'missing !border-amber-400 !bg-amber-50' : ''}
        `}
      >
        <input
          type="checkbox"
          checked={!!currentValue}
          onChange={(e) => onChange(fieldId, e.target.checked)}
          className="peer sr-only"
        />
        <div className={`w-4.5 h-4.5 shrink-0 rounded-md flex items-center justify-center border transition-all
          peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white
          ${currentValue ? 'bg-[#EA580C] border-[#EA580C] text-white' : 'bg-white border-slate-300 group-hover:border-orange-400'}
          ${isMissing && !currentValue ? '!border-amber-400' : ''}
        `}>
          {currentValue && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs sm:text-sm font-bold text-slate-900 block leading-tight">
            {label}
          </span>
          {description && <span className="text-xs text-slate-500 leading-relaxed block mt-0.5">{description}</span>}
        </div>
      </label>
    </FieldWrapper>
  );
}
