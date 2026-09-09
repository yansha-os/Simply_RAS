import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseEnv } from './env'
import { getAuthCookieOptions } from './cookieOptions'

export function createClient() {
  const { url, anonKey } = getSupabaseEnv()
  return createBrowserClient(url, anonKey, {
    cookieOptions: getAuthCookieOptions(),
  })
}
