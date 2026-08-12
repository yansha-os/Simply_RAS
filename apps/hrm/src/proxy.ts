import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  CANDIDATE_SESSION_COOKIE,
  DEVICE_FINGERPRINT_COOKIE,
  resolveFingerprintValidCandidate,
} from '@/lib/candidateDeviceSession'

const PUBLIC_EXACT = new Set(['/', '/login', '/public', '/apply'])

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (pathname.startsWith('/magic-link')) return true
  return false
}

/** Applicant portal under /rbt/* (not /rbt-manager). */
function isApplicantPath(pathname: string): boolean {
  if (pathname === '/rbt' || pathname.startsWith('/rbt/')) {
    if (pathname.startsWith('/rbt-manager')) return false
    return true
  }
  return false
}

function isStaffProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname) || isApplicantPath(pathname)) return false
  return (
    pathname.startsWith('/hr-dashboard') ||
    pathname.startsWith('/ats') ||
    pathname.startsWith('/clients') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/payroll') ||
    pathname.startsWith('/session-emr') ||
    pathname.startsWith('/rbt-manager') ||
    pathname.startsWith('/api/')
  )
}

function secureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

function hardenMagicLinkResponse(response: NextResponse): NextResponse {
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

function isApplicantDevToolsBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true'
  )
}

async function hasFingerprintValidCandidateSession(
  request: NextRequest
): Promise<boolean> {
  try {
    const candidate = await resolveFingerprintValidCandidate(
      request.cookies.get(CANDIDATE_SESSION_COOKIE)?.value,
      request.cookies.get(DEVICE_FINGERPRINT_COOKIE)?.value
    )
    return Boolean(candidate)
  } catch {
    // Route access fails closed if the device-session lookup is unavailable.
    return false
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Magic-link: ensure device fingerprint cookie, let the page bind the DB session
  if (pathname.startsWith('/magic-link/')) {
    const parts = pathname.split('/')
    const token = parts[2]
    if (!token || token.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(token)) {
      return hardenMagicLinkResponse(
        NextResponse.redirect(new URL('/apply', request.url))
      )
    }

    const existingFp = request.cookies.get(DEVICE_FINGERPRINT_COOKIE)?.value
    const fingerprint =
      existingFp && /^[0-9a-f-]{36}$/i.test(existingFp)
        ? existingFp
        : crypto.randomUUID()

    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-device-fingerprint', fingerprint)

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })
    response.cookies.set(
      DEVICE_FINGERPRINT_COOKIE,
      fingerprint,
      secureCookieOptions(60 * 60 * 24 * 365)
    )
    return hardenMagicLinkResponse(response)
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isProd = process.env.NODE_ENV === 'production'
  const applicantDevToolsBypass = isApplicantDevToolsBypassEnabled()

  if (!supabaseUrl || !supabaseKey) {
    if (isApplicantPath(pathname) && !applicantDevToolsBypass) {
      const hasApplicantSession =
        await hasFingerprintValidCandidateSession(request)
      if (!hasApplicantSession) {
        return NextResponse.redirect(new URL('/apply', request.url))
      }
    }
    if (isProd && isStaffProtectedPath(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'auth_misconfigured')
      return NextResponse.redirect(url)
    }
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isApplicantPath(pathname) && !user && !applicantDevToolsBypass) {
    const hasApplicantSession =
      await hasFingerprintValidCandidateSession(request)
    if (!hasApplicantSession) {
      return NextResponse.redirect(new URL('/apply', request.url))
    }
  }

  if (isStaffProtectedPath(pathname) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/login') && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
