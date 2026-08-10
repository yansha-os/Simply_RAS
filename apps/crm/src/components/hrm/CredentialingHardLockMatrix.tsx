'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, ShieldAlert, Lock, Unlock, AlertTriangle, Calendar, UserCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export interface CredentialItem {
  id: string;
  staffName: string;
  role: string;
  credentialType: string;
  credentialNumber: string;
  payerName: string;
  isCredentialed: boolean;
  expirationDate: string;
}

export default function CredentialingHardLockMatrix({
  credentialsList = [],
}: {
  credentialsList?: CredentialItem[];
}) {
  // Mock data if list is empty
  const defaultCredentials: CredentialItem[] = credentialsList.length > 0 ? credentialsList : [
    {
      id: '1',
      staffName: 'Sarah Jenkins, BCBA',
      role: 'BCBA',
      credentialType: 'BACB License & Medicaid Provider ID',
      credentialNumber: 'BCBA-19284',
      payerName: 'Sunshine Health (Medicaid)',
      isCredentialed: true,
      expirationDate: '2026-11-30',
    },
    {
      id: '2',
      staffName: 'Marcus Vance, RBT',
      role: 'RBT',
      credentialType: 'BACB RBT Certification',
      credentialNumber: 'RBT-88491',
      payerName: 'Simply Healthcare',
      isCredentialed: true,
      expirationDate: '2026-08-10', // Expiring soon (<14 days)
    },
    {
      id: '3',
      staffName: 'Elena Rostova, RBT',
      role: 'RBT',
      credentialType: 'CPR & Medicaid Credential',
      credentialNumber: 'RBT-33219',
      payerName: 'Aetna Commercial',
      isCredentialed: false, // HARD LOCKED
      expirationDate: '2026-06-15',
    },
  ];

  const [credentials, setCredentials] = useState<CredentialItem[]>(defaultCredentials);

  const toggleCredentialLock = (id: string) => {
    setCredentials((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const nextState = !c.isCredentialed;
          if (!nextState) {
            toast.error(`HARD LOCK ENFORCED: ${c.staffName} is blocked from scheduling & billing for ${c.payerName}!`);
          } else {
            toast.success(`Credential Verified: ${c.staffName} cleared for ${c.payerName}.`);
          }
          return { ...c, isCredentialed: nextState };
        }
        return c;
      })
    );
  };

  const getDaysUntilExpiration = (dateStr: string) => {
    const exp = new Date(dateStr).getTime();
    const now = new Date().getTime();
    const diff = Math.ceil((exp - now) / (1000 * 3600 * 24));
    return diff;
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-400" /> Payer-Staff Credentialing Hard-Lock Matrix
            </h2>
          </div>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Enforcing strict HIPAA & payer compliance. Hard-locks scheduling & X12 837 claim generation if staff is uncredentialed or within 14 days of expiration.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-xs font-mono font-bold">
            Cleared: {credentials.filter((c) => c.isCredentialed).length}
          </div>
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-xl text-xs font-mono font-bold">
            Hard Locked: {credentials.filter((c) => !c.isCredentialed).length}
          </div>
        </div>
      </div>

      {/* MATRIX TABLE */}
      <div className="space-y-4">
        {credentials.map((item) => {
          const daysLeft = getDaysUntilExpiration(item.expirationDate);
          const isExpiringSoon = daysLeft <= 14 && daysLeft > 0;
          const isExpired = daysLeft <= 0;
          const isHardLocked = !item.isCredentialed || isExpired;

          return (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                isHardLocked
                  ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                  : isExpiringSoon
                  ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                  : 'bg-zinc-900/60 border-white/10 hover:border-emerald-500/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                    isHardLocked
                      ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                      : isExpiringSoon
                      ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {isHardLocked ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-base">{item.staffName}</h4>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/10">
                      {item.role}
                    </span>
                    {isHardLocked && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 uppercase">
                        <Lock className="w-3 h-3" /> HARD LOCKED
                      </span>
                    )}
                    {isExpiringSoon && !isHardLocked && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 uppercase">
                        <AlertTriangle className="w-3 h-3" /> EXPIRING IN {daysLeft} DAYS
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-400 mt-1 font-sans">
                    <span className="font-mono text-zinc-300 font-bold">{item.credentialType}</span> ({item.credentialNumber}) | Payer:{' '}
                    <span className="text-cyan-400 font-semibold">{item.payerName}</span>
                  </p>
                  <p className="text-[10px] font-mono text-zinc-500 mt-1">
                    Expiration Date: {new Date(item.expirationDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* ACTION TOGGLE */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => toggleCredentialLock(item.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    item.isCredentialed
                      ? 'bg-rose-900/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                  }`}
                >
                  {item.isCredentialed ? (
                    <>
                      <Lock className="w-3.5 h-3.5 mr-1.5" /> Enforce Hard Lock
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5 mr-1.5" /> Verify & Unlock
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
