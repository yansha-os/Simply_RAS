import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const cookieName = `device_fingerprint`;
  let fingerprint = request.cookies.get(cookieName)?.value;
  
  if (request.nextUrl.pathname.startsWith('/magic-link/')) {
    const parts = request.nextUrl.pathname.split('/');
    const candidateId = parts[2] || 'cand-1';
    
    if (!fingerprint) {
      fingerprint = crypto.randomUUID();
    }
    
    // Bind device session token and redirect to /rbt/interview
    const response = NextResponse.redirect(new URL('/rbt/interview', request.url));
    response.cookies.set(cookieName, fingerprint, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    });
    response.cookies.set('ras_device_session_token', candidateId, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30
    });
    response.cookies.set('ras_hrm_role', 'APPLICANT', {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/magic-link/:path*', '/'],
}
