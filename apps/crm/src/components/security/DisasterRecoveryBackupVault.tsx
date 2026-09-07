'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, Database, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

export default function DisasterRecoveryBackupVault() {
  const [isBackingUp, setIsBackingUp] = useState(false);

  const backupSnapshots = [
    { snapshotId: 'snap-20260803-0400', timestamp: 'Today at 04:00 AM', sizeMb: 248.5, status: 'ENCRYPTED_AES256' },
    { snapshotId: 'snap-20260802-0400', timestamp: 'Yesterday at 04:00 AM', sizeMb: 246.2, status: 'ENCRYPTED_AES256' },
    { snapshotId: 'snap-20260801-0400', timestamp: '2 days ago at 04:00 AM', sizeMb: 244.1, status: 'ENCRYPTED_AES256' },
  ];

  const handleCreateSnapshot = () => {
    setIsBackingUp(true);
    setTimeout(() => {
      setIsBackingUp(false);
      toast.message('Demo only — no backup was created. Enable Supabase PITR/backups for real recovery.');
    }, 1500);
  };

  return (
    <Card className="bg-[#FFFDF8] dark:bg-zinc-950/80 backdrop-blur-xl border border-[#E2D5B7] dark:border-white/10 p-6 rounded-3xl space-y-6 shadow-xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2D5B7] dark:border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-heading flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-600 dark:text-purple-400" /> Disaster Recovery Backup Demo
          </h2>
          <p className="text-xs text-slate-600 dark:text-zinc-400 font-sans mt-1">
            Phase 20 - Automated daily encrypted database backup snapshots (AES-256), Point-In-Time Recovery (PITR), and emergency access protocols.
          </p>
        </div>

        <Button
          onClick={handleCreateSnapshot}
          isLoading={isBackingUp}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
        >
          <Database className="w-4 h-4" /> Create On-Demand Encrypted Snapshot
        </Button>
      </div>

      {/* BACKUP SNAPSHOTS STREAM */}
      <div className="space-y-3">
        <span className="text-xs font-mono text-slate-500 dark:text-zinc-400 font-bold uppercase">Encrypted Backup Snapshots (AES-256 Vault):</span>
        {backupSnapshots.map((snap) => (
          <div key={snap.snapshotId} className="bg-[#F9F5EC] dark:bg-zinc-900/60 border border-[#E2D5B7] dark:border-white/10 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm font-mono">{snap.snapshotId}</h4>
                <p className="text-xs text-slate-600 dark:text-zinc-400 font-sans mt-0.5">
                  Timestamp: <span className="text-slate-800 dark:text-zinc-200 font-mono">{snap.timestamp}</span> | Size: <span className="font-mono text-cyan-600 dark:text-cyan-300">{snap.sizeMb} MB</span>
                </p>
              </div>
            </div>

            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 uppercase">
              {snap.status}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
