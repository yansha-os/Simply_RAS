import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client (bypasses RLS) — server-only, for private Storage
 * (client-documents bucket). Every call site MUST sit behind an auth guard
 * (readiness gap 12): staff session or magic-link token + device fingerprint.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
