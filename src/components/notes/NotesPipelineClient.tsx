'use client';

import React, { useTransition, useActionState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { convertNoteToBillable, flagDeficiency } from '@/app/(dashboard)/notes/actions';
import { CheckSquare, FileText, XCircle, AlertTriangle } from 'lucide-react';

const flagInitialState: { error?: string; success?: boolean } = {};

export default function NotesPipelineClient({ pendingNotes }: any) {
  const [isConverting, startTransition] = useTransition();
  const [flagState, flagAction, isFlagging] = useActionState<any, FormData>(flagDeficiency, flagInitialState);

  const handleConvert = (noteId: string) => {
    startTransition(async () => {
      await convertNoteToBillable(noteId);
    });
  };

  return (
    <div className="mt-8 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-heading">8b. The Note Sweep (Plutus Handoff)</h2>
        <Badge variant="secondary">{pendingNotes.length}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {pendingNotes.map((note: any) => (
          <Card key={note.id} className="border-brand-gold-200 dark:border-brand-gold-900 shadow-sm">
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-lg">{note.session.client.firstName} {note.session.client.lastName}</p>
                  <p className="text-xs text-slate-500">Date: {new Date(note.session.scheduledStart).toLocaleDateString()}</p>
                </div>
                <Badge variant="warning" className="bg-brand-gold-100 text-brand-gold-700">Ready</Badge>
              </div>

              <div className="text-xs text-slate-500 border-t pt-2 space-y-1">
                <div className="flex items-center gap-2"><CheckSquare className="w-3 h-3 text-green-500"/> Verified: RBT Signed in Artemis</div>
                <div className="flex items-center gap-2"><CheckSquare className="w-3 h-3 text-green-500"/> Verified: Parent Signed in Artemis</div>
                <div className="flex items-center gap-2"><CheckSquare className="w-3 h-3 text-green-500"/> Verified: BCBA Signed in Artemis</div>
                <div className="flex items-center gap-2"><CheckSquare className="w-3 h-3 text-green-500"/> Authorization match verified</div>
              </div>
              
              <div className="space-y-2 border-t pt-3">
                <Button 
                  variant="primary" 
                  size="sm" 
                  className="w-full bg-brand-gold-500 hover:bg-brand-gold-600 text-white" 
                  onClick={() => handleConvert(note.id)}
                  isLoading={isConverting}
                >
                  Confirmed in Artemis - Send to Plutus
                </Button>

                {/* DEFICIENCY ROUTING FORM */}
                <form action={flagAction} className="flex gap-2">
                  <input type="hidden" name="noteId" value={note.id} />
                  <input type="hidden" name="authorId" value={note.session.rbtId} />
                  
                  <input 
                    type="text" 
                    name="description" 
                    placeholder="Describe Artemis error to alert RBT..." 
                    className="flex-1 text-xs border rounded-md px-2 bg-red-50/50" 
                    required 
                  />
                  <Button type="submit" size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 text-xs px-2" isLoading={isFlagging}>
                    <AlertTriangle className="w-3 h-3 mr-1" /> Flag Error
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}

        {pendingNotes.length === 0 && (
          <div className="col-span-2 text-center p-8 text-slate-500 border rounded-xl border-dashed">
            No notes currently await your sweep.
          </div>
        )}
      </div>
    </div>
  );
}
