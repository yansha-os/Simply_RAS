export type IntakeAddressParts = {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number | null;
  lng?: number | null;
};

type AddressLookupLogMetadata =
  | {
      eventCode: 'INTAKE_ADDRESS_ZIP_ONLY';
      precision: 'ZIP';
    }
  | {
      eventCode: 'INTAKE_ADDRESS_LOOKUP_UNAVAILABLE';
      precision: 'NONE';
    };

export type PrivateIntakeAddressResult =
  | {
      status: 'ZIP_ONLY';
      precision: 'ZIP';
      postalCode: string;
      coordinates: null;
      outboundUrl: null;
      addressParts: IntakeAddressParts;
      logMetadata: AddressLookupLogMetadata;
    }
  | {
      status: 'UNAVAILABLE';
      precision: 'NONE';
      postalCode: null;
      coordinates: null;
      outboundUrl: null;
      addressParts: null;
      logMetadata: AddressLookupLogMetadata;
    };

const TRAILING_US_ZIP = /(?:^|[,\s])(\d{5})(?:-\d{4})?\s*$/;
const TRAILING_STATE_CODE = /^(.*?)(?:,\s*|\s+)([A-Za-z]{2})$/;

/**
 * Resolves only data already present in the entered address.
 *
 * This deliberately performs no network lookup. It never invents coordinates:
 * an address is either reduced to ZIP precision or reported unavailable.
 */
export function resolvePrivateIntakeAddress(
  input?: string | null
): PrivateIntakeAddressResult {
  if (typeof input !== 'string') {
    return {
      status: 'UNAVAILABLE',
      precision: 'NONE',
      postalCode: null,
      coordinates: null,
      outboundUrl: null,
      addressParts: null,
      logMetadata: {
        eventCode: 'INTAKE_ADDRESS_LOOKUP_UNAVAILABLE',
        precision: 'NONE',
      },
    };
  }

  const normalized = input.trim();
  const zipMatch = normalized.match(TRAILING_US_ZIP);

  if (!normalized || !zipMatch || zipMatch.index === undefined) {
    return {
      status: 'UNAVAILABLE',
      precision: 'NONE',
      postalCode: null,
      coordinates: null,
      outboundUrl: null,
      addressParts: null,
      logMetadata: {
        eventCode: 'INTAKE_ADDRESS_LOOKUP_UNAVAILABLE',
        precision: 'NONE',
      },
    };
  }

  const postalCode = zipMatch[1];
  const beforeZip = normalized
    .slice(0, zipMatch.index)
    .replace(/[,\s]+$/, '')
    .trim();
  const stateMatch = beforeZip.match(TRAILING_STATE_CODE);
  const state = stateMatch?.[2]?.toUpperCase() ?? '';
  const beforeState = (stateMatch?.[1] ?? beforeZip)
    .replace(/[,\s]+$/, '')
    .trim();
  const localityParts = beforeState
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const city = localityParts.length > 1 ? localityParts.pop() ?? '' : '';
  const street = localityParts.join(', ') || beforeState;

  return {
    status: 'ZIP_ONLY',
    precision: 'ZIP',
    postalCode,
    coordinates: null,
    outboundUrl: null,
    addressParts: {
      street,
      city,
      state,
      zip: postalCode,
    },
    logMetadata: {
      eventCode: 'INTAKE_ADDRESS_ZIP_ONLY',
      precision: 'ZIP',
    },
  };
}
