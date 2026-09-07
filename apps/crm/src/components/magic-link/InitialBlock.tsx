import React, { useContext } from 'react';
import { FieldWrapper, AdminReviewContext, ReadOnlyDisplay } from './FormUIHelpers';

type InitialValue = {
  initials: string;
  timestamp: string;
};

type InitialBlockProps = {
  label: string;
  fieldId: string;
  description?: string;
  required?: boolean;
  currentValue?: unknown;
  onChange: (fieldId: string, value: InitialValue | null) => unknown;
  globalInitials?: string | null;
};

function isInitialValue(value: unknown): value is InitialValue {
  if (!value || typeof value !== 'object') return false;
  return (
    'initials' in value &&
    typeof value.initials === 'string' &&
    'timestamp' in value &&
    typeof value.timestamp === 'string'
  );
}

export function InitialBlock({
  label,
  fieldId,
  description,
  required,
  currentValue,
  onChange,
  globalInitials,
}: InitialBlockProps) {
  const { readOnly, adminReviewMode } = useContext(AdminReviewContext);
  const isAgreed = isInitialValue(currentValue);
  const timestamp = isAgreed ? new Date(currentValue.timestamp).toLocaleString() : null;
  const initial = isAgreed ? currentValue.initials : null;

  const handleTap = () => {
    if (isAgreed) {
      // Toggle off
      onChange(fieldId, null);
    } else {
      if (!globalInitials) {
        alert("Please enter your initials at the top of this form before agreeing to sections.");
        return;
      }
      onChange(fieldId, {
        initials: globalInitials,
        timestamp: new Date().toISOString()
      });
    }
  };

  if (readOnly && !adminReviewMode) {
    const displayVal = isAgreed ? `Initialed: ${initial} (${timestamp})` : 'Not initialed';
    return <ReadOnlyDisplay label={label} value={displayVal} />;
  }

  const isMissing = required && !isAgreed;

  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`consent-item ${isAgreed ? 'signed' : ''} ${isMissing ? 'missing' : ''}`}>
        <div className="consent-text">
          <div className="consent-title">
            {label} 
            {required && <span className="req-badge">REQUIRED</span>}
          </div>
          {description && <div className="consent-desc">{description}</div>}
        </div>
        
        <button 
          type="button"
          onClick={handleTap}
          className={`initial-btn cursor-pointer ${isAgreed ? 'signed' : ''}`}
        >
          {isAgreed ? (
            `✓ ${initial}`
          ) : (
            'TAP TO INITIAL'
          )}
        </button>
      </div>
    </FieldWrapper>
  );
}
