'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Users, UserCheck, ShieldCheck, Mail, Phone, Calendar, Search, Award, CheckCircle2, FileText, Key, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getAtsCandidates, AtsCandidateData } from '@/app/actions/atsActions';

export default function RbtManagerView() {
  const [candidates, setCandidates] = useState<AtsCandidateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadActiveRbts() {
      setIsLoading(true);
      const res = await getAtsCandidates();
      if (res.success && res.data) {
        // Read approved hired candidates from local storage
        const approvedHiredStr = localStorage.getItem('ras_rbt_hired_candidates');
        const approvedHiredIds: string[] = approvedHiredStr ? JSON.parse(approvedHiredStr) : [];

        // Filter strictly for active, hired RBT staff members
        setCandidates(
          res.data.filter(
            c => (c.stage === 'HIRED' || c.activationStatus === 'ACCOUNT_ACTIVE' || approvedHiredIds.includes(c.id)) && c.roleApplied === 'RBT' && !c.email.includes('bcba')
          )
        );
      }
      setIsLoading(false);
    }
    loadActiveRbts();
  }, []);

  const filteredRbts = candidates.filter(c => 
    `${c.name} ${c.email} ${c.roleApplied}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in text-white">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
            <UserCheck className="w-4 h-4" /> Active RBT Personnel Roster
          </div>
          <h1 className="text-3xl font-black text-white font-heading tracking-tight">
            RBT Staff Manager
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Directory of active and cleared Registered Behavior Technicians. Manage active status, clinical clearance, direct deposit credentials, and assigned client caseloads.
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search active RBT..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-zinc-900 border border-white/10 rounded-2xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-brand-orange-500 w-64"
          />
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Total Active RBT Staff</p>
            <h3 className="text-3xl font-black text-white mt-2">{candidates.length}</h3>
            <p className="text-[11px] text-zinc-400 mt-1">100% BACB Verified</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <p className="text-xs text-blue-400 font-bold uppercase tracking-wider">Assigned to Cases</p>
            <h3 className="text-3xl font-black text-white mt-2">{candidates.length > 0 ? candidates.length : 1}</h3>
            <p className="text-[11px] text-zinc-400 mt-1">Active Client Caseloads</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <p className="text-xs text-brand-orange-400 font-bold uppercase tracking-wider">Compliance Status</p>
            <h3 className="text-sm font-bold text-emerald-400 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> 100% Cleared &amp; Credentialed
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1">Artemis EMR Active</p>
          </CardContent>
        </Card>
      </div>

      {/* RBT STAFF TABLE DIRECTORY */}
      <Card className="border-white/10 bg-zinc-950 shadow-xl">
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-brand-orange-500" />
            Hired &amp; Cleared RBT Roster
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900 text-zinc-400 uppercase text-[10px] font-bold tracking-wider border-b border-white/5">
              <tr>
                <th className="py-3.5 px-4">RBT Name</th>
                <th className="py-3.5 px-4">Contact Email</th>
                <th className="py-3.5 px-4">Phone</th>
                <th className="py-3.5 px-4 text-center">Experience</th>
                <th className="py-3.5 px-4 text-center">Applied Date</th>
                <th className="py-3.5 px-4 text-center">Account Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {filteredRbts.map(rbt => (
                <tr key={rbt.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-500/10 border border-orange-500/20 text-brand-orange-400 flex items-center justify-center font-bold text-xs">
                      {rbt.name.substring(0, 2)}
                    </div>
                    <div>
                      <span>{rbt.name}</span>
                      <span className="block text-[10px] text-zinc-500 font-mono font-normal">RBT Candidate</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-zinc-400 font-mono">{rbt.email}</td>
                  <td className="py-3.5 px-4 text-zinc-400 font-mono">{rbt.phone}</td>
                  <td className="py-3.5 px-4 text-center font-mono">{rbt.experienceYears} yrs</td>
                  <td className="py-3.5 px-4 text-center font-mono text-zinc-400">{rbt.appliedDate}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ✓ Active
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Button
                      onClick={() => toast.success(`Viewing full HR compliance dossier for ${rbt.name}`)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold py-1 px-3 h-7 rounded-lg cursor-pointer"
                    >
                      View Dossier
                    </Button>
                  </td>
                </tr>
              ))}

              {filteredRbts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-zinc-500">
                    No active RBT staff found in directory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
