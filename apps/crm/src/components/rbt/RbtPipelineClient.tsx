'use client';

import React, { useActionState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { logSession, fixDeficiency } from '@/app/(dashboard)/rbt/actions';
import { Clock, AlertTriangle, Send } from 'lucide-react';

const logInitialState: { error?: string; success?: boolean } = {};
const fixInitialState: { error?: string; success?: boolean } = {};

export default function RbtPipelineClient({ activeClients, returnedNotes, rbtId }: any) {
  const [logState, logAction, isLogging] = useActionState<any, FormData>(logSession, logInitialState);
  const [fixState, fixAction, isFixing] = useActionState<any, FormData>(fixDeficiency, fixInitialState);

  return (
    <div className="mt-8 space-y-8 max-w-3xl">

      {/* SECTION 1: RETURNED NOTES (DEFICIENCIES) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading text-red-600">Action Required: Returned Notes</h2>
          <Badge variant="danger">{returnedNotes?.length || 0}</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {returnedNotes?.map((def: any) => (
            <Card key={def.id} className="border-red-300 bg-red-50/30 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{def.note.session.client.firstName} {def.note.session.client.lastName}</p>
                    <p className="text-xs text-slate-500">Session: {new Date(def.note.session.scheduledStart).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="danger">Returned</Badge>
                </div>

                <div className="text-xs bg-red-100/50 p-2 rounded border border-red-200 text-red-800">
                  <strong>Notes Coordinator Says:</strong> "{def.description}"
                </div>
                
                <form action={fixAction} className="space-y-3 border-t pt-3 border-red-200">
                  <input type="hidden" name="deficiencyId" value={def.id} />
                  <input type="hidden" name="noteId" value={def.note.id} />
                  
                  <Button type="submit" size="sm" variant="outline" className="w-full h-8 text-xs text-red-700 border-red-300 hover:bg-red-50" isLoading={isFixing}>
                    <Send className="w-3 h-3 mr-2" />
                    I confirm I fixed this in Artemis
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}

          {(!returnedNotes || returnedNotes.length === 0) && (
            <div className="col-span-2 text-center p-6 text-slate-500 border rounded-xl border-dashed">
              No returned notes. Great job!
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: LOG SESSIONS */}
      <div className="space-y-4 border-t pt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">7. Active Therapy & Session Logging</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {activeClients.map((client: any) => (
            <Card key={client.id} className="border-green-200 dark:border-green-900 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-lg">{client.firstName} {client.lastName}</p>
                    <p className="text-xs text-slate-500">BCBA: {client.bcba ? `${client.bcba.firstName} ${client.bcba.lastName}` : 'Unassigned'}</p>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
                
                <form action={logAction} className="space-y-3 border-t pt-3 border-green-100">
                  <input type="hidden" name="clientId" value={client.id} />
                  <input type="hidden" name="rbtId" value={rbtId || client.rbtId} />
                  <input type="hidden" name="bcbaId" value={client.bcbaId} />
                  
                  <Button type="submit" size="sm" variant="primary" className="w-full h-8 text-xs bg-green-600 hover:bg-green-700" isLoading={isLogging}>
                    <Clock className="w-3 h-3 mr-2" />
                    Confirm session logged in Artemis
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}

          {activeClients.length === 0 && (
            <div className="col-span-2 text-center p-8 text-slate-500 border rounded-xl border-dashed">
              No active clients assigned.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
