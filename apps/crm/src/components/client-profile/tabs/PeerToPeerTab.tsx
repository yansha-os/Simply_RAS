'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, PhoneCall, CheckCircle, Loader2, DownloadCloud } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { resolveP2PDenial } from '@/app/(dashboard)/portal-case/actions/clinical';
import { canonicalDocumentReference } from '@/lib/documentReference';
import { parsePacketFormData } from '@/lib/safeParseJson';

type PeerToPeerClient = {
  id: string;
  intakePacket: { formData: unknown } | null;
  paRequests: Array<{
    id: string;
    type: string;
    status: string;
    p2pResolved: boolean;
  }>;
};

export default function PeerToPeerTab({ client }: { client: PeerToPeerClient }) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState('');
  const [evalDownloaded, setEvalDownloaded] = useState(false);
  const [referralDownloaded, setReferralDownloaded] = useState(false);

  const p2pRequests = client.paRequests.filter(
    (pa) => pa.status === 'DENIED_CLINICAL' && !pa.p2pResolved
  );

  if (p2pRequests.length === 0) {
    return (
      <div className="text-zinc-500 py-10 text-center">
        No active Peer-to-Peer actions required for this client.
      </div>
    );
  }

  const formData = parsePacketFormData(client.intakePacket?.formData);
  const evalUrl = canonicalDocumentReference(formData.docEval, client.id);
  const referralUrl = canonicalDocumentReference(formData.docReferral, client.id);
  const hasEval = evalUrl !== null;
  const hasReferral = referralUrl !== null;

  const canResolve = notes.trim().length > 0 &&
                     (!hasEval || evalDownloaded) &&
                     (!hasReferral || referralDownloaded);

  const handleResolve = (paId: string) => {
    if (!canResolve) {
      if (!notes.trim()) toast.error('Please enter the outcome notes of the P2P call.');
      else toast.error('You must download and review all available clinical documents first.');
      return;
    }

    startTransition(async () => {
      const res = await resolveP2PDenial(paId, notes);
      if (res?.success) {
        toast.success('P2P Resolved Successfully!');
        setNotes('');
      } else {
        toast.error(res?.error || 'Failed to resolve P2P.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-red-500 flex items-center text-xl uppercase tracking-wider mb-2">
          <AlertTriangle className="w-6 h-6 mr-3" />
          Clinical Denial - Peer-to-Peer Required
        </h2>
        <p className="text-red-400 text-sm">
          The payer&apos;s medical review board has denied the authorization based on lack of medical necessity. You must schedule and conduct a Peer-to-Peer phone call with the medical director to overturn this decision.
        </p>
      </div>

      {p2pRequests.map((pa) => (
        <Card key={pa.id} className="bg-zinc-950 border border-white/5">
          <CardHeader className="border-b border-white/5 pb-4 bg-zinc-900/50">
            <div className="flex justify-between items-start">
              <CardTitle className="text-lg text-white flex items-center">
                <PhoneCall className="w-5 h-5 text-brand-blue-500 mr-2" />
                {pa.type === 'ASSESSMENT' ? 'Initial Assessment (97151)' : 'Treatment Plan (97153/97155)'} Auth Denial
              </CardTitle>
              <div className="flex gap-2">
                {hasEval && (
                  <a
                    href={evalUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setEvalDownloaded(true)}
                    className={`inline-flex cursor-pointer items-center text-xs px-3 py-1.5 rounded-md border transition-colors ${evalDownloaded ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-brand-blue-500 hover:bg-brand-blue-600 text-white border-brand-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'}`}
                  >
                    {evalDownloaded ? <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> : <DownloadCloud className="w-3.5 h-3.5 mr-1.5" />}
                    Diagnostic Eval
                  </a>
                )}
                {hasReferral && (
                  <a
                    href={referralUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setReferralDownloaded(true)}
                    className={`inline-flex cursor-pointer items-center text-xs px-3 py-1.5 rounded-md border transition-colors ${referralDownloaded ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-brand-blue-500 hover:bg-brand-blue-600 text-white border-brand-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'}`}
                  >
                    {referralDownloaded ? <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> : <DownloadCloud className="w-3.5 h-3.5 mr-1.5" />}
                    Physician Referral
                  </a>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  Outcome Notes & Resolution
                </label>
                <textarea
                  className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white focus:outline-none focus:border-brand-blue-500 transition-colors"
                  placeholder="E.g., Spoke with Dr. Smith. Overturned denial. 20 hours approved. Auth number to follow..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  disabled={isPending || !canResolve}
                  onClick={() => handleResolve(pa.id)}
                  className={`font-bold tracking-wide transition-all ${
                    canResolve
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)] cursor-pointer'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                  }`}
                >
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Mark as P2P Resolved
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
