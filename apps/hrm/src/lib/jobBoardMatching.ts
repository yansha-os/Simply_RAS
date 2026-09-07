/**
 * NYC-area zip → approximate lat/lng centroids for job-board distance matching.
 * Not a substitute for Google Maps — good enough for RBT commute recommendations.
 */

const NYC_ZIP_CENTROIDS: Record<string, { lat: number; lng: number; borough: string }> = {
  // Manhattan
  '10001': { lat: 40.7506, lng: -73.9971, borough: 'Manhattan' },
  '10002': { lat: 40.7157, lng: -73.9863, borough: 'Manhattan' },
  '10003': { lat: 40.7317, lng: -73.9885, borough: 'Manhattan' },
  '10009': { lat: 40.7265, lng: -73.9793, borough: 'Manhattan' },
  '10011': { lat: 40.7417, lng: -74.0006, borough: 'Manhattan' },
  '10013': { lat: 40.7203, lng: -74.0052, borough: 'Manhattan' },
  '10016': { lat: 40.7452, lng: -73.9783, borough: 'Manhattan' },
  '10019': { lat: 40.7651, lng: -73.9857, borough: 'Manhattan' },
  '10023': { lat: 40.7759, lng: -73.9826, borough: 'Manhattan' },
  '10024': { lat: 40.7979, lng: -73.9683, borough: 'Manhattan' },
  '10025': { lat: 40.7986, lng: -73.9665, borough: 'Manhattan' },
  '10027': { lat: 40.8115, lng: -73.9532, borough: 'Manhattan' },
  '10029': { lat: 40.7918, lng: -73.9440, borough: 'Manhattan' },
  '10031': { lat: 40.8251, lng: -73.9500, borough: 'Manhattan' },
  '10032': { lat: 40.8387, lng: -73.9424, borough: 'Manhattan' },
  '10033': { lat: 40.8502, lng: -73.9340, borough: 'Manhattan' },
  '10035': { lat: 40.7957, lng: -73.9295, borough: 'Manhattan' },
  // Brooklyn
  '11201': { lat: 40.6942, lng: -73.9903, borough: 'Brooklyn' },
  '11205': { lat: 40.6945, lng: -73.9654, borough: 'Brooklyn' },
  '11206': { lat: 40.7014, lng: -73.9423, borough: 'Brooklyn' },
  '11207': { lat: 40.6714, lng: -73.8940, borough: 'Brooklyn' },
  '11211': { lat: 40.7128, lng: -73.9510, borough: 'Brooklyn' },
  '11215': { lat: 40.6628, lng: -73.9862, borough: 'Brooklyn' },
  '11216': { lat: 40.6806, lng: -73.9492, borough: 'Brooklyn' },
  '11217': { lat: 40.6815, lng: -73.9788, borough: 'Brooklyn' },
  '11218': { lat: 40.6432, lng: -73.9760, borough: 'Brooklyn' },
  '11220': { lat: 40.6412, lng: -74.0165, borough: 'Brooklyn' },
  '11221': { lat: 40.6905, lng: -73.9272, borough: 'Brooklyn' },
  '11225': { lat: 40.6628, lng: -73.9550, borough: 'Brooklyn' },
  '11226': { lat: 40.6467, lng: -73.9570, borough: 'Brooklyn' },
  '11229': { lat: 40.6013, lng: -73.9442, borough: 'Brooklyn' },
  '11230': { lat: 40.6221, lng: -73.9652, borough: 'Brooklyn' },
  '11233': { lat: 40.6783, lng: -73.9199, borough: 'Brooklyn' },
  '11235': { lat: 40.5842, lng: -73.9492, borough: 'Brooklyn' },
  '11237': { lat: 40.7041, lng: -73.9210, borough: 'Brooklyn' },
  '11238': { lat: 40.6794, lng: -73.9638, borough: 'Brooklyn' },
  // Queens
  '11101': { lat: 40.7472, lng: -73.9397, borough: 'Queens' },
  '11102': { lat: 40.7720, lng: -73.9260, borough: 'Queens' },
  '11103': { lat: 40.7625, lng: -73.9135, borough: 'Queens' },
  '11104': { lat: 40.7445, lng: -73.9205, borough: 'Queens' },
  '11105': { lat: 40.7789, lng: -73.9065, borough: 'Queens' },
  '11106': { lat: 40.7615, lng: -73.9310, borough: 'Queens' },
  '11108': { lat: 40.7725, lng: -73.8995, borough: 'Queens' },
  '11109': { lat: 40.7465, lng: -73.9575, borough: 'Queens' },
  // East Elmhurst / Jackson Heights (common RBT home ZIPs)
  '11369': { lat: 40.7635, lng: -73.8725, borough: 'Queens' },
  '11370': { lat: 40.7655, lng: -73.8905, borough: 'Queens' },
  '11372': { lat: 40.7516, lng: -73.8833, borough: 'Queens' },
  '11373': { lat: 40.7389, lng: -73.8775, borough: 'Queens' },
  '11354': { lat: 40.7685, lng: -73.8275, borough: 'Queens' },
  '11355': { lat: 40.7515, lng: -73.8215, borough: 'Queens' },
  '11368': { lat: 40.7492, lng: -73.8610, borough: 'Queens' },
  '11375': { lat: 40.7209, lng: -73.8458, borough: 'Queens' },
  '11377': { lat: 40.7448, lng: -73.9055, borough: 'Queens' },
  '11385': { lat: 40.7006, lng: -73.8890, borough: 'Queens' },
  '11432': { lat: 40.7152, lng: -73.7930, borough: 'Queens' },
  '11434': { lat: 40.6765, lng: -73.7765, borough: 'Queens' },
  '11691': { lat: 40.6010, lng: -73.7610, borough: 'Queens' },
  // Bronx
  '10451': { lat: 40.8205, lng: -73.9250, borough: 'Bronx' },
  '10452': { lat: 40.8375, lng: -73.9230, borough: 'Bronx' },
  '10453': { lat: 40.8525, lng: -73.9125, borough: 'Bronx' },
  '10456': { lat: 40.8295, lng: -73.9080, borough: 'Bronx' },
  '10457': { lat: 40.8465, lng: -73.8985, borough: 'Bronx' },
  '10458': { lat: 40.8635, lng: -73.8885, borough: 'Bronx' },
  '10461': { lat: 40.8475, lng: -73.8405, borough: 'Bronx' },
  '10462': { lat: 40.8425, lng: -73.8605, borough: 'Bronx' },
  '10463': { lat: 40.8815, lng: -73.9065, borough: 'Bronx' },
  '10467': { lat: 40.8755, lng: -73.8715, borough: 'Bronx' },
  '10468': { lat: 40.8685, lng: -73.9005, borough: 'Bronx' },
  '10469': { lat: 40.8685, lng: -73.8465, borough: 'Bronx' },
  '10471': { lat: 40.9005, lng: -73.9035, borough: 'Bronx' },
  '10472': { lat: 40.8295, lng: -73.8715, borough: 'Bronx' },
  '10473': { lat: 40.8185, lng: -73.8585, borough: 'Bronx' },
  // Staten Island
  '10301': { lat: 40.6315, lng: -74.0945, borough: 'Staten Island' },
  '10304': { lat: 40.6065, lng: -74.0885, borough: 'Staten Island' },
  '10306': { lat: 40.5685, lng: -74.1185, borough: 'Staten Island' },
  '10312': { lat: 40.5435, lng: -74.1685, borough: 'Staten Island' },
  '10314': { lat: 40.5985, lng: -74.1485, borough: 'Staten Island' },
};

const BOROUGH_DEFAULTS: Record<string, { lat: number; lng: number }> = {
  Manhattan: { lat: 40.7831, lng: -73.9712 },
  Brooklyn: { lat: 40.6782, lng: -73.9442 },
  Queens: { lat: 40.7282, lng: -73.7949 },
  Bronx: { lat: 40.8448, lng: -73.8648 },
  'Staten Island': { lat: 40.5795, lng: -74.1502 },
};

export type ZipMatchKind = 'exact' | 'prefix' | 'centroid' | 'borough' | 'unknown';

export function normalizeZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = zip.replace(/\D/g, '').slice(0, 5);
  return digits.length === 5 ? digits : null;
}

export function extractZipFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function boroughFromZipPrefix(zip: string): string | null {
  const prefix = Number(zip.slice(0, 3));
  if (!Number.isFinite(prefix)) return null;
  if (prefix >= 100 && prefix <= 102) return 'Manhattan';
  if (prefix === 103) return 'Staten Island';
  if (prefix === 104) return 'Bronx';
  if (prefix === 112) return 'Brooklyn';
  if ((prefix >= 110 && prefix <= 114) || prefix === 116) return 'Queens';
  return null;
}

function resolvePoint(
  zip: string | null,
  borough: string | null
): { lat: number; lng: number; kind: ZipMatchKind } | null {
  const z = normalizeZip(zip);
  if (z && NYC_ZIP_CENTROIDS[z]) {
    return {
      lat: NYC_ZIP_CENTROIDS[z].lat,
      lng: NYC_ZIP_CENTROIDS[z].lng,
      kind: 'centroid',
    };
  }

  // Unknown exact ZIP: use another known ZIP with the same 3-digit prefix
  if (z) {
    const prefix = z.slice(0, 3);
    const neighbor = Object.entries(NYC_ZIP_CENTROIDS).find(([code]) =>
      code.startsWith(prefix)
    );
    if (neighbor) {
      return { lat: neighbor[1].lat, lng: neighbor[1].lng, kind: 'prefix' };
    }
    const inferredBorough = boroughFromZipPrefix(z);
    if (inferredBorough && BOROUGH_DEFAULTS[inferredBorough]) {
      return {
        lat: BOROUGH_DEFAULTS[inferredBorough].lat,
        lng: BOROUGH_DEFAULTS[inferredBorough].lng,
        kind: 'borough',
      };
    }
  }

  if (borough && BOROUGH_DEFAULTS[borough]) {
    return {
      lat: BOROUGH_DEFAULTS[borough].lat,
      lng: BOROUGH_DEFAULTS[borough].lng,
      kind: 'borough',
    };
  }
  return null;
}

export type TravelMode = 'CAR' | 'PUBLIC_TRANSIT' | 'WALKING' | string | null;

export function estimateCommute(
  rbtZip: string | null,
  clientZip: string | null,
  clientBorough: string | null,
  mode: TravelMode
): {
  distanceMiles: number | null;
  etaMinutes: number | null;
  method: string;
  zipMatchKind: ZipMatchKind;
} {
  const from = resolvePoint(rbtZip, null);
  const to = resolvePoint(clientZip, clientBorough);
  if (!from || !to) {
    return { distanceMiles: null, etaMinutes: null, method: 'unknown', zipMatchKind: 'unknown' };
  }

  const rbt = normalizeZip(rbtZip);
  const listing = normalizeZip(clientZip);
  let zipMatchKind: ZipMatchKind = 'unknown';
  if (rbt && listing && rbt === listing) {
    zipMatchKind = 'exact';
  } else if (from.kind === 'centroid' && to.kind === 'centroid') {
    zipMatchKind = 'centroid';
  } else if (from.kind === 'prefix' || to.kind === 'prefix') {
    zipMatchKind = 'prefix';
  } else {
    zipMatchKind = from.kind === 'borough' || to.kind === 'borough' ? 'borough' : 'unknown';
  }

  const distanceMiles = Math.round(haversineMiles(from.lat, from.lng, to.lat, to.lng) * 10) / 10;
  // NYC road factor ~1.35 vs straight line
  const roadMiles = distanceMiles * 1.35;

  let mph = 18; // car urban default
  if (mode === 'PUBLIC_TRANSIT') mph = 12;
  if (mode === 'WALKING') mph = 3;

  const etaMinutes = Math.max(8, Math.round((roadMiles / mph) * 60));
  return {
    distanceMiles: Math.round(roadMiles * 10) / 10,
    etaMinutes,
    method: zippedMethod(rbtZip, clientZip),
    zipMatchKind,
  };
}

function zippedMethod(a: string | null, b: string | null) {
  if (normalizeZip(a) && normalizeZip(b)) return 'zip-centroid';
  return 'borough-centroid';
}

/** Human-readable ZIP pair for cards: "11372 → 11101" or honest gaps. */
export function formatZipRoute(
  rbtZip: string | null | undefined,
  listingZip: string | null | undefined
): string | null {
  const from = normalizeZip(rbtZip);
  const to = normalizeZip(listingZip);
  if (from && to) return `${from} → ${to}`;
  if (from && !to) return `${from} → listing ZIP missing`;
  if (!from && to) return `Set home ZIP → ${to}`;
  return null;
}

export function zipMatchLabel(kind: ZipMatchKind): string {
  switch (kind) {
    case 'exact':
      return 'Same ZIP';
    case 'centroid':
      return 'ZIP commute';
    case 'prefix':
      return 'Nearby ZIP area';
    case 'borough':
      return 'Borough estimate';
    default:
      return 'Distance unknown';
  }
}

export type MatchInput = {
  rbtZip: string | null;
  clientZip: string | null;
  clientBorough: string | null;
  preferredBoroughs: string[];
  transportation: TravelMode;
  maxTravelMiles: number;
  weeklyHours: number | null;
  alreadyApplied: boolean;
};

export type MatchResult = {
  matchScore: number;
  distanceMiles: number | null;
  etaMinutes: number | null;
  matchReason: string;
  recommended: boolean;
  zipMatchKind: ZipMatchKind;
  zipMatchLabel: string;
  zipRoute: string | null;
  withinRadius: boolean;
  commuteMethod: string;
};

export function scoreJobMatch(input: MatchInput): MatchResult {
  const safePreferredBoroughs = Array.isArray(input?.preferredBoroughs)
    ? input.preferredBoroughs
    : [];
  const maxTravelMiles =
    typeof input?.maxTravelMiles === 'number' && Number.isFinite(input.maxTravelMiles)
      ? Math.max(1, input.maxTravelMiles)
      : 15;

  const rbtZip = normalizeZip(input?.rbtZip);
  const clientZip = normalizeZip(input?.clientZip);
  const commute = estimateCommute(
    rbtZip,
    clientZip,
    input?.clientBorough || null,
    input?.transportation || null
  );

  let score = 70;
  const reasons: string[] = [];

  // Exact ZIP match is the strongest commute signal
  if (rbtZip && clientZip && rbtZip === clientZip) {
    score += 22;
    reasons.push(`Same ZIP as listing (${clientZip})`);
  }

  if (input?.clientBorough && safePreferredBoroughs.length > 0) {
    const hit = safePreferredBoroughs.some(
      (b) => typeof b === 'string' && b.toLowerCase() === input.clientBorough!.toLowerCase()
    );
    if (hit) {
      score += 16;
      reasons.push(`Matches your ${input.clientBorough} preference`);
    } else {
      score -= 12;
      reasons.push(`Outside preferred boroughs`);
    }
  }

  const withinRadius =
    commute.distanceMiles == null
      ? false
      : commute.distanceMiles <= maxTravelMiles;

  if (commute.distanceMiles != null) {
    if (!(rbtZip && clientZip && rbtZip === clientZip)) {
      if (commute.distanceMiles <= 3) {
        score += 16;
        reasons.push(`Only ~${commute.distanceMiles} mi away`);
      } else if (commute.distanceMiles <= 6) {
        score += 10;
        reasons.push(`~${commute.distanceMiles} mi commute`);
      } else if (withinRadius) {
        score += 2;
        reasons.push(`Within your ${maxTravelMiles} mi radius`);
      } else {
        score -= 20;
        reasons.push(`Beyond your ${maxTravelMiles} mi travel max`);
      }
    }

    if (commute.etaMinutes != null) {
      if (commute.etaMinutes <= 20) {
        reasons.push(`~${commute.etaMinutes} min travel`);
      } else if (commute.etaMinutes <= 40) {
        reasons.push(`~${commute.etaMinutes} min travel`);
      } else {
        score -= 8;
        reasons.push(`~${commute.etaMinutes} min travel (longer)`);
      }
    }

    if (commute.zipMatchKind === 'borough') {
      score -= 4;
      if (!reasons.some((r) => r.toLowerCase().includes('borough'))) {
        reasons.push('Borough-level estimate only');
      }
    }
  } else if (!rbtZip) {
    reasons.push('Set your home ZIP for distance scoring');
    score -= 5;
  } else if (!clientZip && !input.clientBorough) {
    reasons.push('Listing missing ZIP & borough');
    score -= 8;
  } else {
    reasons.push('Distance estimate unavailable for this ZIP');
  }

  if (input.weeklyHours && input.weeklyHours >= 12 && input.weeklyHours <= 20) {
    score += 4;
    reasons.push(`${input.weeklyHours} hrs/wk is a solid caseload`);
  }

  if (input.alreadyApplied) score += 3;

  score = Math.max(0, Math.min(99, Math.round(score)));
  const recommended =
    score >= 80 &&
    (commute.distanceMiles == null || withinRadius) &&
    !!rbtZip;

  return {
    matchScore: score,
    distanceMiles: commute.distanceMiles,
    etaMinutes: commute.etaMinutes,
    matchReason: reasons.slice(0, 2).join(' · ') || 'General opening',
    recommended,
    zipMatchKind: commute.zipMatchKind,
    zipMatchLabel: zipMatchLabel(commute.zipMatchKind),
    zipRoute: formatZipRoute(rbtZip, clientZip),
    withinRadius,
    commuteMethod: commute.method,
  };
}

