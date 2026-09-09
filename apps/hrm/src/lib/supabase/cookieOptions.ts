const BLOCKED_SHARED_DOMAINS = new Set([
  '.localhost',
  '.onrender.com',
  '.vercel.app',
  '.netlify.app',
]);

export type AuthCookieOptions = {
  domain: string;
  path: '/';
  sameSite: 'lax';
  secure: true;
};

export function getAuthCookieOptions(): AuthCookieOptions | undefined {
  const configured = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim().toLowerCase();
  if (!configured) return undefined;

  const domain = configured.startsWith('.') ? configured : `.${configured}`;
  const labels = domain.slice(1).split('.');
  if (
    BLOCKED_SHARED_DOMAINS.has(domain) ||
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  ) {
    throw new Error(
      '[SECURITY] NEXT_PUBLIC_AUTH_COOKIE_DOMAIN must be an organization-controlled parent domain, such as .example.com.'
    );
  }

  for (const variable of ['NEXT_PUBLIC_CRM_URL', 'NEXT_PUBLIC_HRM_URL'] as const) {
    const value = process.env[variable];
    if (!value) continue;
    let hostname: string;
    try {
      hostname = new URL(value).hostname.toLowerCase();
    } catch {
      throw new Error(`[SECURITY] ${variable} must be a valid absolute URL.`);
    }
    const parent = domain.slice(1);
    if (hostname !== parent && !hostname.endsWith(domain)) {
      throw new Error(`[SECURITY] ${variable} is outside NEXT_PUBLIC_AUTH_COOKIE_DOMAIN.`);
    }
  }

  return { domain, path: '/', sameSite: 'lax', secure: true };
}
