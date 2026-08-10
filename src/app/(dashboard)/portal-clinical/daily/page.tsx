import React from 'react';
import { prisma } from '@/lib/prisma';
import BcbaDailyWorkstation from '@/components/portal-clinical/BcbaDailyWorkstation';

export const dynamic = 'force-dynamic';

export default async function BcbaDailyWorkstationPage() {
  const sessionNotes = await prisma.sessionNote.findMany({
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
    where: { status: 'OPEN' },
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
    where: { status: 'ACTIVE' },
    include: {
      sessions: true,
    }
  });

  return (
    <div className="p-8">
      <BcbaDailyWorkstation sessionNotes={sessionNotes} deficiencies={deficiencies} clients={clients} />
    </div>
  );
}
