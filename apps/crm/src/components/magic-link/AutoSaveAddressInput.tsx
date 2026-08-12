import React, { useContext, useState } from 'react';
import {
  resolvePrivateIntakeAddress,
  type IntakeAddressParts,
} from '@/lib/intakeAddressPrivacy';
import { FieldWrapper, AdminReviewContext, ReadOnlyDisplay } from './FormUIHelpers';

type AutoSaveAddressInputProps = {
  label: string;
  fieldId: string;
  defaultValue?: string | null;
  onBlur: (fieldId: string, value: string) => unknown;
  required?: boolean;
  onAddressSelect?: (address: IntakeAddressParts) => unknown;
};

export function AutoSaveAddressInput({
  label,
  fieldId,
  defaultValue,
  onBlur,
  required,
  onAddressSelect,
}: AutoSaveAddressInputProps) {
  const { readOnly, adminReviewMode } = useContext(AdminReviewContext);
  const [val, setVal] = useState(defaultValue || '');

  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;
  const commitAddress = () => {
    const resolution = resolvePrivateIntakeAddress(val);
    if (resolution.status === 'ZIP_ONLY' && onAddressSelect) {
      onAddressSelect(resolution.addressParts);
      return;
    }

    // Lookup availability must never block saving the manually entered address.
    onBlur(fieldId, val);
  };

  return (
    <FieldWrapper fieldId={fieldId}>
      <div className={`field relative ${isMissing ? 'missing' : ''}`}>
        <label>{label}</label>
        <input 
          type="text" 
          value={val}
          placeholder="Enter full address"
          onChange={(e) => setVal(e.target.value)}
          onBlur={commitAddress}
          autoComplete="off"
        />
      </div>
    </FieldWrapper>
  );
}
