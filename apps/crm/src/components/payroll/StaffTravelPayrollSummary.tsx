'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Navigation, DollarSign, Clock, Car, ShieldCheck } from 'lucide-react';
import { calculateStaffTravelPayroll, SessionTravelLeg } from '@/lib/payroll/MileageDriveTimeCalculator';

export default function StaffTravelPayrollSummary() {
  const sampleLegs: SessionTravelLeg[] = [
    {
      fromAddress: '100 Healthcare Way, Miami, FL',
      toAddress: '1420 Brickell Ave, Miami, FL (Ethan Wright)',
      distanceMiles: 8.4,
      driveTimeMinutes: 18,
      mileageRatePerMile: 0.67,
      driveTimeHourlyRate: 15.0,
    },
    {
      fromAddress: '1420 Brickell Ave, Miami, FL (Ethan Wright)',
      toAddress: '880 Ocean Dr, Miami Beach, FL (Lucas Vance)',
      distanceMiles: 12.1,
      driveTimeMinutes: 24,
      mileageRatePerMile: 0.67,
      driveTimeHourlyRate: 15.0,
    },
  ];

  const travelSummary = calculateStaffTravelPayroll(sampleLegs);

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <Car className="w-6 h-6 text-emerald-400" /> GPS Mileage & Travel Payroll Engine
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 6 - Automatically calculates drive-time and mileage between in-home client sessions using GPS geolocation matrices.
          </p>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl flex items-center gap-3 font-mono font-bold text-xs">
          <span>Total Travel Pay:</span>
          <span className="text-xl font-black">${travelSummary.totalTravelPayroll.toFixed(2)}</span>
        </div>
      </div>

      {/* SUMMARY STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Total Miles Logged</span>
          <p className="text-2xl font-black text-white font-mono mt-0.5">{travelSummary.totalMiles} Mi</p>
          <p className="text-xs text-emerald-400 font-mono mt-1">Reimbursement: ${travelSummary.mileageReimbursementPay.toFixed(2)}</p>
        </div>
        <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Total Drive Time</span>
          <p className="text-2xl font-black text-white font-mono mt-0.5">{travelSummary.totalDriveTimeMinutes} Mins</p>
          <p className="text-xs text-cyan-400 font-mono mt-1">Hourly Travel Pay: ${travelSummary.driveTimeHourlyPay.toFixed(2)}</p>
        </div>
        <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-mono text-zinc-500 uppercase block">Travel Legs</span>
          <p className="text-2xl font-black text-white font-mono mt-0.5">{travelSummary.totalLegs} Routes</p>
          <p className="text-xs text-zinc-400 font-sans mt-1">IRS Standard Rate ($0.67/mi)</p>
        </div>
      </div>

      {/* TRAVEL LEGS STREAM */}
      <div className="space-y-3">
        <span className="text-xs font-mono text-zinc-400 uppercase font-bold">Session Route Travel Logs:</span>
        {sampleLegs.map((leg, idx) => (
          <div key={idx} className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Navigation className="w-5 h-5 text-emerald-400 mt-1 shrink-0" />
              <div>
                <h4 className="font-bold text-white text-sm font-sans">{leg.fromAddress} ➔ {leg.toAddress}</h4>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  {leg.distanceMiles} miles ({leg.driveTimeMinutes} mins)
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-emerald-400 font-mono">
                +${((leg.distanceMiles * leg.mileageRatePerMile) + ((leg.driveTimeMinutes / 60) * leg.driveTimeHourlyRate)).toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
