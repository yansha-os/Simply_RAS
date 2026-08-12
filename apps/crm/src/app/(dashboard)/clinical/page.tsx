import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { prisma } from '@/lib/prisma';
import ClinicalPipelineClient from '@/components/clinical/ClinicalPipelineClient';
import { CLINICAL_ROLES, requireStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

export default async function ClinicalDashboard() {
  const access = await requireStaff(CLINICAL_ROLES);
  if (!access.ok) notFound();

  // Step 4: Find clients who have an APPROVED Assessment Auth, but NO Treatment Auth yet
  const assessmentClients = await prisma.client.findMany({
    where: {
      status: 'PA_APPROVED', // Passed Intake & Assessment PA Approved
      ...(access.user.role === 'BCBA' ? { bcbaId: access.user.id } : {}),
      authorizations: {
        some: { type: 'ASSESSMENT', status: 'APPROVED' },
        none: { type: 'TREATMENT' }
      }
    },
    include: {
      authorizations: true
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold">Clinical Operations</h1>
        <p className="text-slate-500">Assessments, Treatment Plans, and Clinical Flags.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Assessments Due</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assessmentClients.length}</div>
            <p className="text-xs text-slate-500 mt-1">Requires 97151 Assessment & Tx Plan</p>
          </CardContent>
        </Card>
      </div>

      <ClinicalPipelineClient assessmentClients={assessmentClients} />
    </div>
  );
}
