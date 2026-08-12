import { Suspense } from 'react';
import { assertApplicantHired } from '@/lib/assertApplicantHired';
import { RbtScheduleView } from '@/components/rbt/RbtScheduleView';
import { isDevToolsEnabled } from '@/lib/devToolsGate';

export default async function RbtSchedulePage() {
  // The proxy deliberately admits sessionless /rbt/* requests in DevTools mode.
  // Let the client view render its hired/unhired lock instead of streaming a
  // NEXT_REDIRECT that makes Next's root Router retry with a different hook path.
  if (!isDevToolsEnabled()) {
    await assertApplicantHired();
  }

  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-12 text-center font-black text-slate-400 animate-pulse">
          Loading schedule…
        </div>
      }
    >
      <RbtScheduleView mode="LIVE" />
    </Suspense>
  );
}
