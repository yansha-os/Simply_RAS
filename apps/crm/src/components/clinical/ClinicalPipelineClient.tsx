'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FileSignature } from 'lucide-react';

type AssessmentClient = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function ClinicalPipelineClient({
  assessmentClients,
}: {
  assessmentClients: AssessmentClient[];
}) {
  return (
    <div className="mt-8 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-heading">4. Assessment & Treatment Plan</h2>
        <Badge variant="secondary">{assessmentClients.length}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {assessmentClients.map((client) => (
          <Card key={client.id} className="border-indigo-200 dark:border-indigo-900 shadow-sm">
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-lg">{client.firstName} {client.lastName}</p>
                  <p className="text-xs text-slate-500">Status: Assessment Phase (97151)</p>
                </div>
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700">BCBA Action</Badge>
              </div>
              
              <div className="text-xs text-slate-500 border-t pt-2 space-y-1">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full border border-indigo-400"/> Schedule Meet & Greet</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full border border-indigo-400"/> Perform 97151 Assessment</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full border border-indigo-400"/> Write Treatment Plan</div>
              </div>
              
              <Link
                href={`/client/${client.id}?mode=bcba&tab=treatment_plan`}
                className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <FileSignature className="w-4 h-4 mr-2" />
                Open canonical treatment plan
              </Link>
              <p className="text-[11px] text-slate-500">
                Final submission verifies the assigned BCBA, current plan version, signer
                identity, and pipeline stage in the client chart.
              </p>
            </CardContent>
          </Card>
        ))}

        {assessmentClients.length === 0 && (
          <div className="col-span-2 text-center p-8 text-slate-500 border rounded-xl border-dashed">
            No pending assessments found.
          </div>
        )}
      </div>
    </div>
  );
}
