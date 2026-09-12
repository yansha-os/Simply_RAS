import React, { useContext, useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Crosshair, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
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

type AddressSuggestion = {
  id: string;
  formatted: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  source: 'osm' | 'census' | 'device';
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
  const [previousDefaultValue, setPreviousDefaultValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLocating = false;
  const [isOpen, setIsOpen] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  if (defaultValue !== previousDefaultValue) {
    setPreviousDefaultValue(defaultValue);
    setVal(defaultValue || '');
  }

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // External address lookup remains disabled until an approved PHI-safe vendor exists.
  const fetchAddressSuggestions = useCallback(async (): Promise<AddressSuggestion[]> => [], []);

  // Search trigger on typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setVal(query);
    setIsVerified(false);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      const results = await fetchAddressSuggestions();
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setIsLoading(false);
    }, 250);
  };

  // Select a suggestion
  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setVal(suggestion.formatted);
    setIsOpen(false);
    setIsVerified(true);

    const addressParts: IntakeAddressParts = {
      street: suggestion.street || suggestion.formatted.split(',')[0]?.trim() || '',
      city: suggestion.city,
      state: suggestion.state,
      zip: suggestion.zip,
      lat: suggestion.lat,
      lng: suggestion.lng,
    };

    if (onAddressSelect) {
      onAddressSelect(addressParts);
    }
    onBlur(fieldId, suggestion.formatted);
  };

  // One-tap Device Geolocation ("📍 Use Current Location")
  const handleUseCurrentLocation = () => {
    toast.info('For privacy, enter the address manually.');
  };

  // Commit on input blur (fallback parser)
  const handleCommitAddress = () => {
    if (!val) {
      onBlur(fieldId, '');
      return;
    }

    const resolution = resolvePrivateIntakeAddress(val);
    if (resolution.status === 'ZIP_ONLY' && onAddressSelect) {
      onAddressSelect(resolution.addressParts);
    }
    onBlur(fieldId, val);
  };

  if (readOnly && !adminReviewMode) return <ReadOnlyDisplay label={label} value={val} />;
  if (adminReviewMode) return <FieldWrapper fieldId={fieldId}><ReadOnlyDisplay label={label} value={val} /></FieldWrapper>;

  const isMissing = required && !val;

  return (
    <FieldWrapper fieldId={fieldId}>
      <div ref={containerRef} className={`field relative mb-3 ${isMissing ? 'missing' : ''}`}>
        {/* Label & Location Helper Button (Button placed on the LEFT) */}
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 text-[10.5px] font-mono font-bold text-[#EA580C] hover:text-[#C2410C] bg-[#FFF5ED] hover:bg-orange-100 border border-[#FFD8C2] px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50 shadow-xs"
            title="Auto-fill address using your current phone/device GPS"
            aria-label="Use current device location"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EA580C]" />
            ) : (
              <Crosshair className="w-3.5 h-3.5 text-[#EA580C]" />
            )}
            <span>{isLocating ? 'Locating...' : 'Use Current Location'}</span>
          </button>

          <label className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-0">
            {label}
          </label>
        </div>

        {/* Input with live search spinner / verified check */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={val}
            placeholder="Start typing your street address (e.g. 150 55th St, Brooklyn)"
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            onBlur={handleCommitAddress}
            autoComplete="off"
            className="w-full h-11 px-3.5 bg-white border border-[#E2D5B7] focus:border-orange-500 rounded-xl text-slate-900 font-medium text-sm outline-none transition-all shadow-xs pr-10"
          />

          <div className="absolute right-3 flex items-center gap-1.5 pointer-events-none">
            {isLoading && (
              <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
            )}
            {isVerified && !isLoading && (
              <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 text-emerald-700 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Verified</span>
              </div>
            )}
          </div>
        </div>

        {/* Autocomplete Dropdown */}
        {isOpen && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-[#E2D5B7] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-3 py-2 bg-[#F9F5EC] border-b border-[#E2D5B7] flex items-center justify-between text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-orange-500" />
                <span>Verified Address Suggestions</span>
              </span>
              <span className="text-[9px] text-slate-400">OpenStreetMap &amp; US Census</span>
            </div>

            <ul className="max-h-60 overflow-y-auto divide-y divide-[#E2D5B7]/50" role="listbox">
              {suggestions.map((item) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected="false"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent onBlur from firing before click
                    handleSelectSuggestion(item);
                  }}
                  className="px-3.5 py-2.5 hover:bg-[#FFF5ED] cursor-pointer transition flex items-start gap-3 group text-left"
                >
                  <div className="w-6 h-6 rounded-lg bg-orange-50 border border-orange-200 text-[#EA580C] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 group-hover:text-[#EA580C] transition-colors truncate">
                      {item.street || item.formatted.split(',')[0]}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {[item.city, item.state, item.zip].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 uppercase font-semibold px-1.5 py-0.5 bg-[#F9F5EC] rounded border border-[#E2D5B7] shrink-0">
                    {item.source === 'census' ? 'USPS' : 'GPS'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FieldWrapper>
  );
}
