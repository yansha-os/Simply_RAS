'use client';

import React, { useTransition, useActionState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { assignStaff, activateClient, collectSignature } from '@/app/(dashboard)/case/actions';
import { Users, CheckCircle, PenTool } from 'lucide-react';

const assignInitialState: { error?: string; success?: boolean } = {};

export default function CasePipelineClient({ staffingQueue, missingSigs, pendingOnboards, rbts, bcbas }: any) {
  const [assignState, assignAction, isAssigning] = useActionState<any, FormData>(assignStaff, assignInitialState);
  const [isActivating, startTransition] = useTransition();

  const handleActivate = (clientId: string) => {
    startTransition(async () => {
      await activateClient(clientId);
    });
  };

  const handleSign = (noteId: string, type: 'PARENT' | 'BCBA') => {
    startTransition(async () => {
      await collectSignature(noteId, type);
    });
  };

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3 max-w-7xl">
      
      {/* COLUMN 1: STAFFING QUEUE */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">6. Staffing & Scheduling</h2>
          <Badge variant="secondary">{staffingQueue?.length || 0}</Badge>
        </div>

        <div className="grid gap-4">
          {staffingQueue?.map((client: any) => (
            <Card key={client.id} className="border-teal-200 dark:border-teal-900 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-lg">{client.firstName} {client.lastName}</p>
                    <p className="text-xs text-slate-500">Tx Auth Approved</p>
                  </div>
                  <Badge variant="outline" className="bg-teal-50 text-teal-700">Staffing</Badge>
                </div>

                {(!client.rbtId || !client.bcbaId) ? (
                  <form action={assignAction} className="space-y-3 border-t pt-3 border-teal-100">
                    <input type="hidden" name="clientId" value={client.id} />
                    
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">Assign RBT</label>
                      <select name="rbtId" className="w-full text-sm border p-2 rounded-md bg-[var(--color-surface)] dark:bg-slate-800" required>
                        <option value="">Select RBT...</option>
                        {rbts.map((rbt: any) => (
                          <option key={rbt.id} value={rbt.id}>{rbt.firstName} {rbt.lastName}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">Assign BCBA</label>
                      <select name="bcbaId" className="w-full text-sm border p-2 rounded-md bg-[var(--color-surface)] dark:bg-slate-800" required>
                        <option value="">Select BCBA...</option>
                        {bcbas.map((bcba: any) => (
                          <option key={bcba.id} value={bcba.id}>{bcba.firstName} {bcba.lastName}</option>
                        ))}
                      </select>
                    </div>
                    
                    <Button type="submit" size="sm" variant="primary" className="w-full h-8 text-xs bg-teal-600 hover:bg-teal-700" isLoading={isAssigning}>
                      <Users className="w-3 h-3 mr-2" />
                      Save Staffing
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-3 border-t pt-3 border-teal-100">
                    <div className="text-xs bg-teal-50 text-teal-800 p-2 rounded-md border border-teal-200">
                      <p><strong>RBT Assigned:</strong> Yes</p>
                      <p><strong>BCBA Assigned:</strong> Yes</p>
                    </div>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      className="w-full bg-brand-blue-500 hover:bg-brand-blue-600"
                      onClick={() => handleActivate(client.id)}
                      isLoading={isActivating}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Verify Schedule & Activate
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {(!staffingQueue || staffingQueue.length === 0) && (
            <div className="text-center p-8 text-slate-500 border rounded-xl border-dashed">
              No clients pending staffing.
            </div>
          )}
        </div>
      </div>

      {/* COLUMN 2: RBT ONBOARDING */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">RBT Readiness</h2>
          <Badge variant="warning" className="bg-amber-100 text-amber-800">{pendingOnboards?.length || 0}</Badge>
        </div>

        <div className="grid gap-4">
          {pendingOnboards?.map((onboard: any) => (
            <Card key={onboard.id} className="border-amber-200 dark:border-amber-900 shadow-sm bg-amber-50/10">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{onboard.rbt.firstName} {onboard.rbt.lastName}</p>
                    <p className="text-xs text-slate-500">Assigned to: {onboard.client.firstName}</p>
                  </div>
                  <Badge variant="warning" className="bg-amber-100 text-amber-700">Onboarding</Badge>
                </div>
                
                <div className="space-y-1 text-xs border-t pt-3 border-amber-100">
                  <div className="flex items-center justify-between">
                    <span>BACB Verified:</span>
                    <span className={onboard.bacbVerified ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.bacbVerified ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Background Check:</span>
                    <span className={onboard.backgroundCleared ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.backgroundCleared ? 'Cleared' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Artemis Account:</span>
                    <span className={onboard.artemisAccountSetup ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.artemisAccountSetup ? 'Tested' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Payroll Setup:</span>
                    <span className={onboard.payrollComplete ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.payrollComplete ? 'Confirmed' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Payer Credentialed:</span>
                    <span className={onboard.payerCredentialed ? "text-green-600" : "text-amber-600 font-bold"}>
                      {onboard.payerCredentialed ? 'Confirmed' : 'Pending'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!pendingOnboards || pendingOnboards.length === 0) && (
            <div className="text-center p-8 text-slate-500 border rounded-xl border-dashed">
              All assigned RBTs are fully onboarded.
            </div>
          )}
        </div>
      </div>

      {/* COLUMN 3: MISSING SIGNATURES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">8a. Missing Signatures</h2>
          <Badge variant="danger">{missingSigs?.length || 0}</Badge>
        </div>

        <div className="grid gap-4">
          {missingSigs?.map((sig: any) => (
            <Card key={sig.id} className="border-red-200 dark:border-red-900 shadow-sm bg-red-50/20 dark:bg-red-900/10">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{sig.session.client.firstName} {sig.session.client.lastName}</p>
                    <p className="text-xs text-slate-500">Session on {new Date(sig.session.scheduledStart).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="danger">Incomplete Note</Badge>
                </div>
                
                <div className="space-y-2 border-t pt-3 border-red-100 dark:border-red-900/50">
                  {!sig.parentSigned && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-8 text-xs text-red-600 border-red-200 hover:bg-red-100"
                      onClick={() => handleSign(sig.id, 'PARENT')}
                    >
                      <PenTool className="w-3 h-3 mr-2" />
                      Collect Parent Signature
                    </Button>
                  )}
                  {!sig.bcbaSigned && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-8 text-xs text-slate-600 border-slate-200 hover:bg-slate-50"
                      onClick={() => handleSign(sig.id, 'BCBA')}
                    >
                      <PenTool className="w-3 h-3 mr-2" />
                      Collect BCBA Signature
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!missingSigs || missingSigs.length === 0) && (
            <div className="text-center p-8 text-slate-500 border rounded-xl border-dashed">
              All active session notes are signed!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
