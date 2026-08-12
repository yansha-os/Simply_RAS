/**
 * Supabase env resolution (readiness gap 18: fail fast on missing env).
 *
 * In production a missing URL/anon key throws on first client creation instead
 * of silently signing requests against a placeholder project (which made every
 * login fail with a generic error). Dev keeps the placeholder fallback so the
 * app boots without Supabase, but warns loudly.
 */

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

let warned = false;

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) return { url, anonKey };

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[SECURITY] Missing NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'in a production environment. Refusing to fall back to placeholder credentials — ' +
        'set both variables and redeploy.'
    );
  }

  if (!warned) {
    warned = true;
    console.warn(
      '[supabase] WARNING: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set. ' +
        'Using placeholder credentials — real Supabase auth WILL NOT work in this environment.'
    );
  }

  return { url: url || PLACEHOLDER_URL, anonKey: anonKey || PLACEHOLDER_KEY };
}
