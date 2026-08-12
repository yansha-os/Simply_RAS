import React from 'react';
import { listBcbaUnsignedNotes } from '@/app/actions/bcbaNoteQueueActions';
import BcbaUnsignedNotesQueue from '@/components/portal-clinical/BcbaUnsignedNotesQueue';

export const dynamic = 'force-dynamic';

export default async function BcbaUnsignedNotesPage() {
  const result = await listBcbaUnsignedNotes();

  return (
    <div className="p-8">
      {!result.success && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm font-sans">
          {result.error || 'Unable to load the unsigned notes queue.'}
        </div>
      )}
      <BcbaUnsignedNotesQueue
        notes={result.notes}
        viewerRole={'viewerRole' in result ? result.viewerRole : undefined}
        scopedToBcbaId={'scopedToBcbaId' in result ? result.scopedToBcbaId : null}
      />
    </div>
  );
}
