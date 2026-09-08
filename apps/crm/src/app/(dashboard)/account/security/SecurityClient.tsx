'use client';

import { MfaSecurityPanel } from '@repo/ui';
import { createClient } from '@/lib/supabase/client';

export function SecurityClient() {
  return <MfaSecurityPanel createClient={createClient} />;
}
