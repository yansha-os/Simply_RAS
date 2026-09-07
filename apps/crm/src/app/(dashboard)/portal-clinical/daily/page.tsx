import React from 'react';
import { prisma } from '@/lib/prisma';
import BcbaDailyWorkstation from '@/components/portal-clinical/BcbaDailyWorkstation';
import { CLINICAL_ROLES, requireStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type WorkstationTab = 'esign' | 'supervision' | 'deficiencies';

function resolveInitialTab(tab: string | undefined): WorkstationTab {
  if (tab === 'supervision' || tab === 'deficiencies') return tab;
  return 'esign';
}

export default async function BcbaDailyWorkstationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = resolveInitialTab(tab);
  const access = await requireStaff(CLINICAL_ROLES);
  if (!access.ok) notFound();
  const scopedBcbaId =
    access.user.role === 'BCBA' ? access.user.id : null;

  const sessionNotes = await prisma.sessionNote.findMany({
    where: scopedBcbaId
      ? {
          session: {
            OR: [
              { bcbaId: scopedBcbaId },
              { client: { bcbaId: scopedBcbaId } },
            ],
          },
        }
      : {},
    include: {
      session: {
        include: {
          client: true,
          rbt: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const deficiencies = await prisma.noteDeficiency.findMany({
    where: {
      status: 'OPEN',
      ...(scopedBcbaId
        ? {
            note: {
              session: {
                OR: [
                  { bcbaId: scopedBcbaId },
                  { client: { bcbaId: scopedBcbaId } },
                ],
              },
            },
          }
        : {}),
    },
    include: {
      note: {
        include: {
          session: {
            include: {
              client: true,
              rbt: true
            }
          }
        }
      }
    }
  });

  const clients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      ...(scopedBcbaId ? { bcbaId: scopedBcbaId } : {}),
    },
    include: {
      sessions: true,
    }
  });

  return (
    <div className="p-8">
      <BcbaDailyWorkstation
        sessionNotes={sessionNotes}
        deficiencies={deficiencies}
        clients={clients}
        initialTab={initialTab}
      />
    </div>
  );
}
