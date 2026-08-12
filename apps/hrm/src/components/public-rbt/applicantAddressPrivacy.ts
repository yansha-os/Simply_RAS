export type ApplicantBorough =
  | 'Manhattan'
  | 'Brooklyn'
  | 'Queens'
  | 'Bronx'
  | 'Staten Island';

type ApplicantLocationLogMetadata =
  | {
      eventCode: 'APPLICANT_LOCATION_ZIP_ONLY';
      precision: 'ZIP';
    }
  | {
      eventCode: 'APPLICANT_LOCATION_UNAVAILABLE';
      precision: 'NONE';
    };

export type PrivateApplicantLocationResult =
  | {
      status: 'ZIP_ONLY';
      precision: 'ZIP';
      postalCode: string;
      borough: ApplicantBorough | null;
      coordinates: null;
      outboundUrl: null;
      logMetadata: ApplicantLocationLogMetadata;
    }
  | {
      status: 'UNAVAILABLE';
      precision: 'NONE';
      postalCode: null;
      borough: null;
      coordinates: null;
      outboundUrl: null;
      logMetadata: ApplicantLocationLogMetadata;
    };

const US_ZIP = /^(\d{5})(?:-\d{4})?$/;

function boroughFromZip(postalCode: string): ApplicantBorough | null {
  const prefix = Number(postalCode.slice(0, 3));

  if (prefix >= 100 && prefix <= 102) return 'Manhattan';
  if (prefix === 103) return 'Staten Island';
  if (prefix === 104) return 'Bronx';
  if (prefix === 112) return 'Brooklyn';
  if (prefix === 111 || prefix === 113 || prefix === 114 || prefix === 116) {
    return 'Queens';
  }

  return null;
}

/**
 * Derives coarse location data from an applicant-provided ZIP entirely in-process.
 * Street addresses never enter this helper, no network URL is created, and no
 * coordinates are inferred.
 */
export function resolvePrivateApplicantLocation(
  input: string
): PrivateApplicantLocationResult {
  const match = input.trim().match(US_ZIP);

  if (!match) {
    return {
      status: 'UNAVAILABLE',
      precision: 'NONE',
      postalCode: null,
      borough: null,
      coordinates: null,
      outboundUrl: null,
      logMetadata: {
        eventCode: 'APPLICANT_LOCATION_UNAVAILABLE',
        precision: 'NONE',
      },
    };
  }

  const postalCode = match[1];

  return {
    status: 'ZIP_ONLY',
    precision: 'ZIP',
    postalCode,
    borough: boroughFromZip(postalCode),
    coordinates: null,
    outboundUrl: null,
    logMetadata: {
      eventCode: 'APPLICANT_LOCATION_ZIP_ONLY',
      precision: 'ZIP',
    },
  };
}
