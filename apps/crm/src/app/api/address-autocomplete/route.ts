import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Patient addresses must not be forwarded to an unapproved geocoding provider.
 * Keep this legacy endpoint fail-closed until a contracted, minimum-retention
 * service and its PHI handling have completed compliance review.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Address lookup is unavailable. Enter the address manually.' },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': '86400',
      },
    },
  );
}
