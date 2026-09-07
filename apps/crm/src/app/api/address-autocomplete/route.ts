import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_ADDRESS_QUERY_LENGTH,
  checkAddressLookupRateLimit,
  isValidCoordinatePair,
} from '@/lib/addressLookupPolicy';

export const dynamic = 'force-dynamic';

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

const DEFAULT_NYC_LAT = 40.7128;
const DEFAULT_NYC_LNG = -74.0060;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const allowedKeys = new Set(['q', 'reverse', 'lat', 'lon']);
    if (
      [...searchParams.keys()].some((key) => !allowedKeys.has(key)) ||
      [...allowedKeys].some((key) => searchParams.getAll(key).length > 1)
    ) {
      return NextResponse.json({ error: 'Invalid address request.' }, { status: 400 });
    }

    const forwardedIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const clientIp = forwardedIp || req.headers.get('x-real-ip') || 'unknown';
    const rateLimit = checkAddressLookupRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many address requests. Please try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const query = searchParams.get('q')?.trim() || '';
    const reverse = searchParams.get('reverse') === 'true';
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');

    const lat = latParam ? parseFloat(latParam) : DEFAULT_NYC_LAT;
    const lon = lonParam ? parseFloat(lonParam) : DEFAULT_NYC_LNG;

    if (query.length > MAX_ADDRESS_QUERY_LENGTH) {
      return NextResponse.json({ error: 'Address query is too long.' }, { status: 400 });
    }
    if ((latParam || lonParam || reverse) && !isValidCoordinatePair(lat, lon)) {
      return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 });
    }

    // 1. Handle Reverse Geocoding (Device GPS -> Address)
    if (reverse && !isNaN(lat) && !isNaN(lon)) {
      // Try Photon Reverse first
      try {
        const photonRevUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
        const pRes = await fetch(photonRevUrl, {
          headers: { 'User-Agent': 'SimpleRAS-CRM-Intake/1.0 (info@riseandshineaba.com)' },
          signal: AbortSignal.timeout(3500),
        });

        if (pRes.ok) {
          const data = await pRes.json();
          const feat = data?.features?.[0];
          if (feat) {
            const p = feat.properties || {};
            const streetNum = p.housenumber ? `${p.housenumber} ` : '';
            const streetName = p.street || p.name || '';
            const street = `${streetNum}${streetName}`.trim() || p.name || '';
            const city = p.city || p.district || p.county || p.town || 'New York';
            const state = p.state || 'NY';
            const zip = p.postcode || '';

            const parts = [street, city, state, zip].filter(Boolean);
            const formatted = parts.join(', ');

            return NextResponse.json({
              result: {
                id: `device-${lat}-${lon}`,
                formatted: formatted || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
                street,
                city,
                state,
                zip,
                lat,
                lng: lon,
                source: 'device' as const,
              },
            });
          }
        }
      } catch {
        // Photon reverse failed, try Nominatim reverse fallback
      }

      // Nominatim Reverse Fallback
      try {
        const nomRevUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
        const nRes = await fetch(nomRevUrl, {
          headers: { 'User-Agent': 'SimpleRAS-CRM-Intake/1.0 (info@riseandshineaba.com)' },
          signal: AbortSignal.timeout(3500),
        });

        if (nRes.ok) {
          const data = await nRes.json();
          const a = data?.address || {};
          const streetNum = a.house_number ? `${a.house_number} ` : '';
          const road = a.road || a.pedestrian || a.suburb || '';
          const street = `${streetNum}${road}`.trim();
          const city = a.city || a.borough || a.neighbourhood || a.town || a.county || 'New York';
          const state = a.state || 'NY';
          const zip = a.postcode || '';

          const parts = [street, city, state, zip].filter(Boolean);
          const formatted = parts.join(', ');

          return NextResponse.json({
            result: {
              id: `nom-${lat}-${lon}`,
              formatted: formatted || data.display_name,
              street,
              city,
              state,
              zip,
              lat,
              lng: lon,
              source: 'device' as const,
            },
          });
        }
      } catch {
        // Fallback failed
      }

      return NextResponse.json({ result: null });
    }

    // 2. Handle Address Autocomplete Typeahead
    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions: AddressSuggestion[] = [];

    // Step A: Query Photon (OpenStreetMap) with local bias
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&countrycodes=us&lat=${lat}&lon=${lon}`;
      const pRes = await fetch(photonUrl, {
        headers: { 'User-Agent': 'SimpleRAS-CRM-Intake/1.0 (info@riseandshineaba.com)' },
        signal: AbortSignal.timeout(3000),
      });

      if (pRes.ok) {
        const data = await pRes.json();
        const features = data?.features || [];

        for (const f of features) {
          const p = f.properties || {};
          const streetNum = p.housenumber ? `${p.housenumber} ` : '';
          const streetName = p.street || p.name || '';
          const street = `${streetNum}${streetName}`.trim() || p.name || '';
          const city = p.city || p.district || p.county || p.town || p.village || '';
          const state = p.state || 'NY';
          const zip = p.postcode || '';
          const [coordLng, coordLat] = f.geometry?.coordinates || [0, 0];

          const parts = [street, city, state, zip].filter(Boolean);
          const formatted = parts.join(', ');

          if (street || city) {
            suggestions.push({
              id: `osm-${coordLat}-${coordLng}-${Math.random()}`,
              formatted: formatted || p.formatted || query,
              street,
              city,
              state,
              zip,
              lat: coordLat,
              lng: coordLng,
              source: 'osm',
            });
          }
        }
      }
    } catch {
      // Continue to next provider
    }

    // Step B: If Photon returned 0 or fewer than 3, query Nominatim OSM
    if (suggestions.length < 3) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=us&limit=5`;
        const nRes = await fetch(nomUrl, {
          headers: { 'User-Agent': 'SimpleRAS-CRM-Intake/1.0 (info@riseandshineaba.com)' },
          signal: AbortSignal.timeout(3000),
        });

        if (nRes.ok) {
          const items = await nRes.json();
          for (const item of items) {
            const a = item.address || {};
            const streetNum = a.house_number ? `${a.house_number} ` : '';
            const road = a.road || a.pedestrian || a.suburb || item.name || '';
            const street = `${streetNum}${road}`.trim();
            const city = a.city || a.borough || a.town || a.county || '';
            const state = a.state || 'NY';
            const zip = a.postcode || '';
            const coordLat = parseFloat(item.lat) || 0;
            const coordLng = parseFloat(item.lon) || 0;

            const parts = [street, city, state, zip].filter(Boolean);
            const formatted = parts.join(', ');

            // Avoid duplicate addresses
            if (!suggestions.some(s => s.street.toLowerCase() === street.toLowerCase() && s.zip === zip)) {
              suggestions.push({
                id: `nom-${item.place_id || Math.random()}`,
                formatted: formatted || item.display_name,
                street,
                city,
                state,
                zip,
                lat: coordLat,
                lng: coordLng,
                source: 'osm',
              });
            }
          }
        }
      } catch {
        // Continue to Census
      }
    }

    // Step C: If still 0, query US Census Bureau Geocoder API
    if (suggestions.length === 0) {
      try {
        const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(query)}&benchmark=2020&format=json`;
        const cRes = await fetch(censusUrl, {
          headers: { 'User-Agent': 'SimpleRAS-CRM-Intake/1.0' },
          signal: AbortSignal.timeout(3000),
        });

        if (cRes.ok) {
          const data = await cRes.json();
          const matches = data?.result?.addressMatches || [];

          for (const m of matches) {
            const c = m.addressComponents || {};
            const street = [c.fromAddress, c.preDirection, c.streetName, c.suffixType, c.suffixDirection]
              .filter(Boolean)
              .join(' ');
            suggestions.push({
              id: `census-${m.coordinates?.x}-${m.coordinates?.y}`,
              formatted: m.matchedAddress || `${street}, ${c.city}, ${c.state} ${c.zip}`,
              street: street || m.matchedAddress?.split(',')?.[0]?.trim() || '',
              city: c.city || '',
              state: c.state || '',
              zip: c.zip || '',
              lat: m.coordinates?.y || 0,
              lng: m.coordinates?.x || 0,
              source: 'census',
            });
          }
        }
      } catch {
        // Fallback finished
      }
    }

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { suggestions: [], error: 'Address lookup failed.' },
      { status: 500 }
    );
  }
}
