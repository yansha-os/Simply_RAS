'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RbtSessionStudio } from '@/components/emr/RbtSessionStudio';
import type { SessionStudioClient } from '@/lib/sessionStudio';
import { loadSessionStudioMeta } from '@/lib/sessionStudioDraft';
import { AlertTriangle } from 'lucide-react';

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function RbtSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const ready = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  const client = useMemo<SessionStudioClient | null>(
    () => (ready && sessionId ? loadSessionStudioMeta(sessionId) : null),
    [ready, sessionId]
  );

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center font-black text-slate-400 animate-pulse">
        Opening Session Studio…
      </div>
    );
  }

  if (!sessionId || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border-2 border-amber-300 bg-white p-6 shadow-xl space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-black font-heading text-slate-900">Session not found</h1>
          <p className="text-xs text-slate-600 font-medium">
            Start EVV from Schedule so this session has client metadata, or the browser cleared sessionStorage.
          </p>
          <button
            type="button"
            onClick={() => router.push('/rbt/schedule')}
            className="w-full rounded-2xl bg-[#F97316] hover:bg-orange-600 text-white font-black text-sm py-3 cursor-pointer"
          >
            Back to Schedule
          </button>
        </div>
      </div>
    );
  }

  return <RbtSessionStudio sessionId={sessionId} client={client} />;
}
