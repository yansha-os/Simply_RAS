import React from 'react';

import NotesPipelineClient from '@/components/notes/NotesPipelineClient';
import {
  SESSION_NOTES_CONVERSION_ROLES,
  SESSION_NOTES_ROLES,
  requirePersistedStaff,
} from '@/lib/auth-guard';
import type { Role } from '@repo/db';
import { notFound } from 'next/navigation';

import { loadSessionClaimsQueue } from './loader';

export const dynamic = 'force-dynamic';

export default async function SessionClaimsQueuePage() {
  const access = await requirePersistedStaff(SESSION_NOTES_ROLES);
  if (!access.ok) notFound();

  const canConvert = SESSION_NOTES_CONVERSION_ROLES.includes(access.user.role as Role);
  const {
    awaitingBcba,
    readyToBill,
    claimFiled,
    queueCounts,
    authUnitStatusByNoteId,
    scrubStatusByNoteId,
    convertBlockersByNoteId,
  } = await loadSessionClaimsQueue();

  const { awaiting, ready, converted } = queueCounts;

  return (
    <div className="p-8">
      <div className="space-y-4 animate-fade-in-up">
        <div>
          <h2 className="font-heading text-2xl font-bold text-white">Session Claims</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            BCBA-signed session notes ready for billing — mark{' '}
            <span className="font-mono text-zinc-300">isConverted</span> when the claim is filed
            (manual tracker, no EDI).{' '}
            <span className="font-mono text-zinc-500">
              {awaiting} awaiting BCBA · {ready} ready to bill · {converted} claim filed
            </span>
          </p>
        </div>

        <NotesPipelineClient
          awaitingBcba={awaitingBcba}
          readyForPlutus={readyToBill}
          converted={claimFiled}
          queueCounts={queueCounts}
          authUnitStatusByNoteId={authUnitStatusByNoteId}
          scrubStatusByNoteId={scrubStatusByNoteId}
          convertBlockersByNoteId={convertBlockersByNoteId}
          canConvert={canConvert}
        />
      </div>
    </div>
  );
}
