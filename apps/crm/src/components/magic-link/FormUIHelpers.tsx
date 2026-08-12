import React, { useState } from 'react';

export const AdminReviewContext = React.createContext<{
  adminReviewMode: boolean;
  isRejectionMode: boolean;
  readOnly: boolean;
  rejectedFields: string[];
  stagedRejections: string[];
  onRejectField: (fieldId: string) => void;
}>({ adminReviewMode: false, isRejectionMode: false, readOnly: false, rejectedFields: [], stagedRejections: [], onRejectField: () => {} });

export function ReadOnlyDisplay({ label, value }: { label: React.ReactNode, value: any }) {
  let displayValue = value;
  if (typeof value === 'boolean') displayValue = value ? 'Yes' : 'No';
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 h-full flex flex-col justify-center w-full">
      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="text-white font-medium text-sm break-words">{displayValue || <span className="text-zinc-600 italic">Not provided</span>}</div>
    </div>
  );
}

export function FieldWrapper({ fieldId, children }: { fieldId: string, children: React.ReactNode }) {
  const { adminReviewMode, isRejectionMode, readOnly, rejectedFields, stagedRejections, onRejectField } = React.useContext(AdminReviewContext);
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

export function AutoSaveInput({ label, fieldId, type = "text", defaultValue, onBlur, required, placeholder }: any) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const [val, setVal] = useState(defaultValue || '');
  React.useEffect(() => { setVal(defaultValue || ''); }, [defaultValue]);
  
  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;
  const inputId = `intake-${fieldId}`;
  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field ${isMissing ? 'missing' : ''}`}>
        <label htmlFor={inputId}>{label}</label>
        <input 
          id={inputId}
          type={type} 
          value={val}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => onBlur(fieldId, val)}
        />
      </div>
    </FieldWrapper>
  );
}

export function AutoSaveDateInput({ label, fieldId, defaultValue, onBlur, required }: any) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const [val, setVal] = useState(defaultValue || '');
  React.useEffect(() => { setVal(defaultValue || ''); }, [defaultValue]);
  
  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.replace(/\D/g, '');
    if (input.length > 8) input = input.slice(0, 8);
    
    let formatted = input;
    if (input.length > 4) {
      formatted = `${input.slice(0, 2)}/${input.slice(2, 4)}/${input.slice(4)}`;
    } else if (input.length > 2) {
      formatted = `${input.slice(0, 2)}/${input.slice(2)}`;
    }
    setVal(formatted);
  };

  const inputId = `intake-${fieldId}`;
  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field ${isMissing ? 'missing' : ''}`}>
        <label htmlFor={inputId}>{label}</label>
        <input 
          id={inputId}
          type="text" 
          value={val}
          placeholder="MM/DD/YYYY"
          onChange={handleChange}
          onBlur={() => onBlur(fieldId, val)}
          maxLength={10}
        />
      </div>
    </FieldWrapper>
  );
}

export function AutoSaveTextArea({ label, fieldId, defaultValue, onBlur, required }: any) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const [val, setVal] = useState(defaultValue || '');
  React.useEffect(() => { setVal(defaultValue || ''); }, [defaultValue]);
  
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

export function AutoSaveSelect({ label, fieldId, options, defaultValue, onBlur, required }: any) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  const [val, setVal] = useState(defaultValue || '');
  React.useEffect(() => { setVal(defaultValue || ''); }, [defaultValue]);
  
  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;
  const inputId = `intake-${fieldId}`;
  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field ${isMissing ? 'missing' : ''}`}>
        <label htmlFor={inputId}>{label}</label>
        <select 
          id={inputId}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => onBlur(fieldId, val)}
        >
          <option value="">Select...</option>
          {options.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    </FieldWrapper>
  );
}

export function AutoSaveRadio({ label, fieldId, options, currentValue, onChange, required }: any) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={currentValue} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={currentValue} /></FieldWrapper>;

  const isMissing = required && !currentValue;
  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field mb-4 ${isMissing ? 'missing !border-yellow-400/50 !bg-yellow-400/5 shadow-[0_0_15px_rgba(250,204,21,0.15)] rounded-2xl p-4' : ''}`}>
        {label && <label>{label}</label>}
        <div className="flex flex-wrap gap-4 mt-2">
          {options.map((opt: string) => (
            <label 
              key={opt} 
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border cursor-pointer transition-all relative overflow-hidden group
                ${currentValue === opt ? 'bg-brand-blue-500/10 border-brand-blue-500 shadow-inner' : 'bg-black/50 border-white/10 hover:border-white/20 hover:bg-white/5'}
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
              <div className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center border transition-all
                peer-focus-visible:ring-2 peer-focus-visible:ring-brand-blue-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black
                ${currentValue === opt ? 'border-brand-blue-500' : 'border-white/20 group-hover:border-brand-blue-400/50'}
              `}>
                {currentValue === opt && (
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-blue-500" />
                )}
              </div>
              <span className="text-sm font-bold text-white">{opt}</span>
            </label>
          ))}
        </div>
      </div>
    </FieldWrapper>
  );
}

export function AutoSaveCheckbox({ label, fieldId, currentValue, onChange, description, required }: any) {
  const { readOnly, adminReviewMode } = React.useContext(AdminReviewContext);
  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={currentValue} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={currentValue} /></FieldWrapper>;

  const isMissing = required && !currentValue;
  return (
    <FieldWrapper fieldId={fieldId}>
      <label 
        className={`flex items-start gap-4 p-5 rounded-2xl border cursor-pointer transition-all relative overflow-hidden group
          ${currentValue ? 'bg-brand-blue-500/10 border-brand-blue-500 shadow-inner' : 'bg-black/50 border-white/10 hover:border-white/20 hover:bg-white/5'}
          ${isMissing ? 'missing !border-yellow-400/50 !bg-yellow-400/5 shadow-[0_0_15px_rgba(250,204,21,0.15)]' : ''}
        `}
      >
        <input 
          type="checkbox" 
          checked={!!currentValue}
          onChange={(e) => onChange(fieldId, e.target.checked)}
          className="peer sr-only"
        />
        <div className={`mt-0.5 w-6 h-6 shrink-0 rounded flex items-center justify-center border transition-all
          peer-focus-visible:ring-2 peer-focus-visible:ring-brand-blue-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black
          ${currentValue ? 'bg-brand-blue-500 border-brand-blue-500' : 'bg-black/50 border-white/20 group-hover:border-brand-blue-400/50'}
          ${isMissing && !currentValue ? '!border-yellow-400/50' : ''}
        `}>
          {currentValue && (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div>
          <span className="text-sm font-bold text-white block mb-1">
            {label}
          </span>
          {description && <span className="text-xs text-slate-400 leading-relaxed block">{description}</span>}
        </div>
      </label>
    </FieldWrapper>
  );
}
