import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getAuthCookieOptions } from '@/lib/supabase/cookieOptions'

const PUBLIC_EXACT = new Set(['/', '/login', '/public', '/apply'])

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (pathname.startsWith('/magic-link')) return true
  return false
}

function isProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname)) return false
  return (
    pathname.startsWith('/ops') ||
    pathname.startsWith('/intake') ||
    pathname.startsWith('/case') ||
    pathname.startsWith('/clinical') ||
    pathname.startsWith('/clinical-support') ||
    pathname.startsWith('/notes') ||
    pathname.startsWith('/client') ||
    pathname.startsWith('/portal-') ||
    pathname.startsWith('/rbt') ||
    pathname.startsWith('/api/generate-report')
  )
}

function isDevToolsBypassEnabled(request: NextRequest): boolean {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== 'true'
  ) {
    return false
  }
  return Boolean(
    request.cookies.get('dev_impersonate_role')?.value ||
    request.cookies.get('dev_impersonate_user_id')?.value
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
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

function hrmRedirectUrl(pathname: string): string {
  const base = (process.env.NEXT_PUBLIC_HRM_URL || 'http://localhost:3001').replace(/\/$/, '')
  const map: Record<string, string> = {
    '/portal-hr': '/hr-dashboard',
    '/portal-hr/ats': '/ats',
    '/portal-hr/payroll': '/payroll',
    '/portal-hr/onboarding': '/ats',
    '/portal-hr/session-emr': '/session-emr',
    '/portal-hr/clients': '/hr-dashboard',
    '/portal-hr/rbts': '/hr-dashboard',
    '/portal-hr/requests': '/hr-dashboard',
  }
  return `${base}${map[pathname] || '/hr-dashboard'}`
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isMfaPath = pathname === '/mfa'

  // HR product is HRM-only — bounce legacy CRM /portal-hr routes
  if (pathname === '/portal-hr' || pathname.startsWith('/portal-hr/')) {
    return NextResponse.redirect(hrmRedirectUrl(pathname))
  }

  // Client intake magic-link: bind device fingerprint (httpOnly) + forward header
  if (pathname.startsWith('/magic-link/')) {
    const parts = pathname.split('/')
    const token = parts[2]
    if (!token || token.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(token)) {
      return hardenMagicLinkResponse(
        NextResponse.redirect(new URL('/login', request.url))
      )
    }

    const existingFp = request.cookies.get('device_fingerprint')?.value
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
      'device_fingerprint',
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

  if (!supabaseUrl || !supabaseKey) {
    if (isProd && isProtectedPath(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'auth_misconfigured')
      return NextResponse.redirect(url)
    }
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: getAuthCookieOptions(),
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

  const isDevBypassed = isDevToolsBypassEnabled(request)
  if (isMfaPath && !user && !isDevBypassed) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (user && !isDevBypassed) {
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
      isProtectedPath(pathname) &&
      (aalError || (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'))
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/mfa'
      url.search = ''
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  if (isProtectedPath(pathname) && !user && !isDevBypassed) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/login') && (user || isDevBypassed)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
