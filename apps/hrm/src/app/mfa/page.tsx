'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MfaChallengePanel } from '@repo/ui';
import { createClient } from '@/lib/supabase/client';

function safeNextPath(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function MfaChallenge() {
  const searchParams = useSearchParams();
  return <MfaChallengePanel createClient={createClient} nextPath={safeNextPath(searchParams.get('next'))} />;
}

export default function MfaPage() {
  return <Suspense fallback={<main className="min-h-screen bg-zinc-950" />}><MfaChallenge /></Suspense>;
}
