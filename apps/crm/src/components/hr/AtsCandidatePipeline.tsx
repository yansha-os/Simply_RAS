'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { UserPlus, ShieldCheck, Mail } from 'lucide-react';
import { verifyBacbCertification } from '@/lib/hr/BacbRegistryVerifier';
import { toast } from 'sonner';

export default function AtsCandidatePipeline() {
  const [candidates, setCandidates] = useState([
    {
      id: 'cand-1',
      name: 'Jessica Miller',
      role: 'RBT',
      email: 'jessica.m@example.com',
      stage: 'APPLIED',
      bacbNumber: 'RBT-99124',
      bacbVerified: true,
    },
    {
      id: 'cand-2',
      name: 'Daniel Cruz',
      role: 'BCBA',
      email: 'daniel.cruz@example.com',
      stage: 'INTERVIEW_SCHEDULED',
      bacbNumber: 'BCBA-44821',
      bacbVerified: true,
    },
    {
      id: 'cand-3',
      name: 'Ashley Taylor',
      role: 'RBT',
      email: 'ashley.t@example.com',
      stage: 'OFFER_EXTENDED',
      bacbNumber: 'RBT-33120',
      bacbVerified: false,
    },
  ]);

  const handleVerifyBacb = (candId: string, bacbNumber: string, name: string) => {
    const res = verifyBacbCertification(bacbNumber, name);
    if (res.status === 'ACTIVE') {
      setCandidates((prev) =>
        prev.map((c) => (c.id === candId ? { ...c, bacbVerified: true } : c))
      );
      toast.success(`Verified active ${res.certificationType} certification for ${name}! Expires ${res.expirationDate}`);
    } else {
      toast.error(`BACB Registry record not found for ${bacbNumber}`);
    }
  };

  const handleSendMagicLinkOnboarding = (name: string, email: string) => {
    toast.success(`Sent Candidate Onboarding Magic Link to ${email}!`);
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-emerald-400" /> Automated HR Recruiting & Candidate ATS Pipeline
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 13 - Applicant tracking, automated BACB registry verification, and passwordless candidate magic link onboarding.
          </p>
        </div>

        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl font-mono font-bold text-xs">
          Active Candidates: {candidates.length}
        </span>
      </div>

      {/* CANDIDATES STREAM */}
      <div className="space-y-4">
        {candidates.map((c) => (
          <div key={c.id} className="bg-zinc-900/60 border border-white/10 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-white text-base">{c.name}</h4>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/10">
                  {c.role}
                </span>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase">
                  {c.stage.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-sans">
                Email: <span className="text-zinc-200">{c.email}</span> | BACB #: <span className="font-mono text-cyan-300">{c.bacbNumber}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              {!c.bacbVerified ? (
                <Button
                  onClick={() => handleVerifyBacb(c.id, c.bacbNumber, c.name)}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                >
                  Verify BACB Status
                </Button>
              ) : (
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" /> BACB ACTIVE
                </span>
              )}

              <Button
                onClick={() => handleSendMagicLinkOnboarding(c.name, c.email)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer shadow-sm flex items-center gap-1"
              >
                <Mail className="w-3.5 h-3.5" /> Send Magic Link Onboarding
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
