import React from 'react';
import { listClinicalReviewQueue } from '@/app/actions/clinicalReviewActions';
import ClinicalReviewQueue from '@/components/portal-clinical/ClinicalReviewQueue';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ClinicalReviewPage() {
  const result = await listClinicalReviewQueue();
  if ('accessDenied' in result && result.accessDenied) notFound();

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <ClinicalReviewQueue
          items={result.items}
          counts={result.counts}
          viewerRole={'viewerRole' in result ? result.viewerRole : undefined}
          scopedToBcbaId={'scopedToBcbaId' in result ? result.scopedToBcbaId : null}
          loadError={result.success ? null : result.error}
        />
      </div>
    </div>
  );
}
