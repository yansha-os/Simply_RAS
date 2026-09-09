import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  CANDIDATE_SESSION_COOKIE,
  DEVICE_FINGERPRINT_COOKIE,
  resolveFingerprintValidCandidate,
} from '@/lib/candidateDeviceSession'
import { isDevToolsEnabled } from '@/lib/devToolsGate'
import { isApplicantPath, isStaffProtectedPath } from '@/lib/routeAccess'

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
  return isDevToolsEnabled()
}

function isStaffDevToolsBypassEnabled(request: NextRequest): boolean {
  if (!isDevToolsEnabled()) {
    return false
  }
  return Boolean(
    request.cookies.get('dev_impersonate_role')?.value ||
    request.cookies.get('dev_impersonate_user_id')?.value
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
  const isMfaPath = pathname === '/mfa'
  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.delete('x-ras-pathname')
  if (isStaffProtectedPath(pathname)) {
    forwardedHeaders.set('x-ras-pathname', pathname)
  }

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

    forwardedHeaders.set('x-device-fingerprint', fingerprint)

    const response = NextResponse.next({
      request: { headers: forwardedHeaders },
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
      headers: forwardedHeaders,
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
        forwardedHeaders.set('cookie', request.cookies.toString())
        response = NextResponse.next({ request: { headers: forwardedHeaders } })
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

  const isStaffDevBypassed = isStaffDevToolsBypassEnabled(request)
  if (isMfaPath && !user && !isStaffDevBypassed) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (user && !isStaffDevBypassed) {
    const { data: aal, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (isMfaPath && !aalError && aal.currentLevel === 'aal2') {
      const requestedNext = request.nextUrl.searchParams.get('next')
      const safeNext =
        requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
          ? requestedNext
          : '/'
      return NextResponse.redirect(new URL(safeNext, request.url))
    }

    if (
      isStaffProtectedPath(pathname) &&
      (aalError || (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'))
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/mfa'
      url.search = ''
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  if (isStaffProtectedPath(pathname) && !user && !isStaffDevBypassed) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/login') && (user || isStaffDevBypassed)) {
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
