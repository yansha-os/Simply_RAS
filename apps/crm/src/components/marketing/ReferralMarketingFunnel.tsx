'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Megaphone, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function ReferralMarketingFunnel() {
  const referralSources = [
    { partnerName: 'Dr. Robert Vance, Pediatrician', specialty: 'Pediatric Medical Home', totalReferrals: 18, conversionRate: 88, status: 'ACTIVE_PARTNER' },
    { partnerName: 'South Florida Diagnostic Clinic', specialty: 'Psychological Eval Center', totalReferrals: 12, conversionRate: 91, status: 'ACTIVE_PARTNER' },
    { partnerName: 'Miami-Dade School District', specialty: 'IEP & ESE Services', totalReferrals: 8, conversionRate: 75, status: 'ACTIVE_PARTNER' },
  ];

  const handleTriggerDripCampaign = (name: string) => {
    toast.success(`Triggered Automated Family Drip Campaign (SMS & Email) for ${name}!`);
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-cyan-400" /> Automated Client Referral & Marketing Funnel Engine
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 19 - Pediatrician & diagnostic evaluator referral source tracking + automated family SMS/Email intake drip campaigns.
          </p>
        </div>

        <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-4 py-2 rounded-2xl font-mono font-bold text-xs">
          Partner Network: {referralSources.length} Key Sources
        </span>
      </div>

      {/* REFERRAL PARTNERS STREAM */}
      <div className="space-y-4">
        {referralSources.map((partner, idx) => (
          <div key={idx} className="bg-zinc-900/60 border border-white/10 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-white text-base">{partner.partnerName}</h4>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {partner.conversionRate}% Lead Conversion
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-sans">
                Specialty: <span className="text-zinc-200">{partner.specialty}</span> | Total Clients Referred: <span className="font-mono text-cyan-300 font-bold">{partner.totalReferrals}</span>
              </p>
            </div>

            <Button
              onClick={() => handleTriggerDripCampaign(partner.partnerName)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Trigger Automated Family Drip
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
