'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Users, UserPlus, Search, CheckCircle2, ChevronRight, Phone, Mail, Filter, Sparkles, Key, Copy, Check, ShieldCheck, Activity, Award, TrendingUp, Clock } from 'lucide-react';
import { toast } from 'sonner';

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleApplied: 'RBT' | 'BCBA' | 'ADMIN';
  stage: 'APPLIED' | 'PHONE_SCREEN' | 'INTERVIEW' | 'OFFER' | 'HIRED';
  experienceYears: number;
  appliedDate: string;
  activationStatus: 'PENDING_HR_REVIEW' | 'INVITATION_SENT' | 'ACCOUNT_ACTIVE';
}

const INITIAL_CANDIDATES: Candidate[] = [
  { id: 'c1', name: 'Sarah Jenkins', email: 'sarah.j@gmail.com', phone: '(555) 234-5678', roleApplied: 'RBT', stage: 'INTERVIEW', experienceYears: 2, appliedDate: '2026-07-20', activationStatus: 'PENDING_HR_REVIEW' },
  { id: 'c2', name: 'Marcus Vance', email: 'marcus.v@outlook.com', phone: '(555) 876-5432', roleApplied: 'BCBA', stage: 'OFFER', experienceYears: 5, appliedDate: '2026-07-18', activationStatus: 'PENDING_HR_REVIEW' },
  { id: 'c3', name: 'Emily Taylor', email: 'emily.t@yahoo.com', phone: '(555) 345-6789', roleApplied: 'RBT', stage: 'PHONE_SCREEN', experienceYears: 1, appliedDate: '2026-07-25', activationStatus: 'PENDING_HR_REVIEW' },
  { id: 'c4', name: 'David Miller', email: 'david.m@gmail.com', phone: '(555) 901-2345', roleApplied: 'RBT', stage: 'HIRED', experienceYears: 3, appliedDate: '2026-07-15', activationStatus: 'ACCOUNT_ACTIVE' },
];

export default function AtsPipelineView() {
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Magic Link Activation Modal State
  const [activeInviteCandidate, setActiveInviteCandidate] = useState<Candidate | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // New Candidate Modal
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'RBT' | 'BCBA' | 'ADMIN'>('RBT');
  const [newExp, setNewExp] = useState('1');

  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    const newCandidate: Candidate = {
      id: crypto.randomUUID(),
      name: newName,
      email: newEmail,
      phone: newPhone || '(555) 000-0000',
      roleApplied: newRole,
      stage: 'APPLIED',
      experienceYears: parseInt(newExp) || 0,
      appliedDate: new Date().toISOString().split('T')[0],
      activationStatus: 'PENDING_HR_REVIEW',
    };

    setCandidates([newCandidate, ...candidates]);
    toast.success(`Applicant ${newName} added to ATS pipeline!`);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setShowAddForm(false);
  };

  const handleAdvanceStage = (id: string) => {
    const stageOrder: Candidate['stage'][] = ['APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER', 'HIRED'];
    
    setCandidates(prev => prev.map(c => {
      if (c.id !== id) return c;
      const currentIndex = stageOrder.indexOf(c.stage);
      if (currentIndex < stageOrder.length - 1) {
        const nextStage = stageOrder[currentIndex + 1];
        toast.success(`${c.name} moved to ${nextStage.replace('_', ' ')} stage!`);
        return { ...c, stage: nextStage };
      }
      return c;
    }));
  };

  const handleApproveAndInvite = (candidate: Candidate) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidate.id
          ? { ...c, stage: 'HIRED', activationStatus: 'INVITATION_SENT' }
          : c
      )
    );
    setActiveInviteCandidate(candidate);
    toast.success(`Approved ${candidate.name}! Activation magic link generated.`);
  };

  const copyInviteLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    toast.success('Magic link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const filteredCandidates = candidates.filter(c => {
    const matchesSearch = `${c.name} ${c.email} ${c.roleApplied}`.toLowerCase().includes(searchQuery.toLowerCase());
    if (roleFilter === 'ALL') return matchesSearch;
    return matchesSearch && c.roleApplied === roleFilter;
  });

  const stages: { key: Candidate['stage']; title: string; color: string }[] = [
    { key: 'APPLIED', title: '1. Applied (HR Review)', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
    { key: 'PHONE_SCREEN', title: '2. Phone Screen', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
    { key: 'INTERVIEW', title: '3. Interview', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
    { key: 'OFFER', title: '4. Offer Extended', color: 'border-brand-orange-500/30 bg-brand-orange-500/10 text-brand-orange-400' },
    { key: 'HIRED', title: '5. Hired / Portal Active', color: 'border-green-500/30 bg-green-500/10 text-green-400' },
  ];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-black-800 p-6 rounded-xl border border-white/5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-orange-500" />
            ATS Applicant Tracking &amp; HR Recruiter Analytics
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time candidate funnel, time-to-hire metrics, and 6-point compliance onboarding logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search candidate..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-brand-orange-500 w-48"
            />
          </div>

          <div className="bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center text-xs text-zinc-400">
            <Filter className="w-3.5 h-3.5 mr-1 text-zinc-500" />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-transparent text-white outline-none cursor-pointer font-medium text-xs"
            >
              <option value="ALL">All Roles</option>
              <option value="RBT">RBT Candidates</option>
              <option value="BCBA">BCBA Candidates</option>
              <option value="ADMIN">Admin Staff</option>
            </select>
          </div>

          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs px-4 h-9 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 mr-1.5" /> Add Applicant
          </Button>
        </div>
      </div>

      {/* RECRUITER ANALYTICS & STATISTICS KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-brand-orange-400 font-bold uppercase tracking-wider">Total Pipeline Candidates</p>
                <h3 className="text-3xl font-black text-white mt-2">{candidates.length}</h3>
              </div>
              <div className="p-3 bg-brand-orange-500/10 border border-brand-orange-500/20 rounded-xl text-brand-orange-400">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Avg Time to Hire</p>
                <h3 className="text-3xl font-black text-white mt-2">14 Days</h3>
              </div>
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                <Clock className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-purple-400 font-bold uppercase tracking-wider">40-Hr Course Pass Rate</p>
                <h3 className="text-3xl font-black text-white mt-2">84%</h3>
              </div>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
                <Award className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-zinc-950 shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Offer Acceptance Ratio</p>
                <h3 className="text-3xl font-black text-white mt-2">92%</h3>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Add Form Modal */}
      {showAddForm && (
        <Card className="border-brand-orange-500/30 bg-zinc-950 shadow-xl">
          <CardContent className="p-6">
            <form onSubmit={handleAddCandidate} className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Add New Job Applicant</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="Candidate Name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="(555) 000-0000"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Role Applied For</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                  >
                    <option value="RBT">Registered Behavior Technician (RBT)</option>
                    <option value="BCBA">Board Certified Behavior Analyst (BCBA)</option>
                    <option value="ADMIN">Administrative Staff</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Years of ABA Experience</label>
                  <input
                    type="number"
                    value={newExp}
                    onChange={e => setNewExp(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-brand-orange-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)} className="text-xs bg-zinc-800 text-zinc-300">
                  Cancel
                </Button>
                <Button type="submit" className="text-xs bg-brand-orange-500 text-white font-bold">
                  Save to Pipeline
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ACTIVATION MAGIC LINK INVITATION MODAL */}
      {activeInviteCandidate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-brand-orange-500/50 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">HR Activation Magic Link Generated</h3>
              </div>
              <button
                onClick={() => setActiveInviteCandidate(null)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p>
                Candidate <strong className="text-white">{activeInviteCandidate.name}</strong> ({activeInviteCandidate.email}) has been approved by HR.
              </p>
              <div className="bg-zinc-900 border border-white/10 rounded-xl p-3.5 space-y-2">
                <span className="text-[10px] font-mono font-bold text-brand-orange-400 uppercase tracking-wider block">Activation Magic Link URL:</span>
                <div className="flex items-center justify-between gap-2 bg-black/50 p-2.5 rounded-lg border border-white/10 text-xs font-mono text-emerald-400 break-all">
                  <span>{`http://localhost:3001/magic-link/${activeInviteCandidate.id}`}</span>
                  <button
                    onClick={() => copyInviteLink(`http://localhost:3001/magic-link/${activeInviteCandidate.id}`)}
                    className="p-1.5 rounded-md bg-zinc-800 hover:bg-brand-orange-500 text-white shrink-0 transition-colors cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 italic">
                An automated email containing this single-use activation link has been dispatched to {activeInviteCandidate.email}.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setActiveInviteCandidate(null)}
                className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs px-6 h-9 cursor-pointer"
              >
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5-Column Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const stageCandidates = filteredCandidates.filter(c => c.stage === stage.key);

          return (
            <div key={stage.key} className="bg-zinc-950 p-4 rounded-xl border border-white/5 flex flex-col justify-between min-w-[220px]">
              <div>
                <div className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between mb-4 ${stage.color}`}>
                  <span>{stage.title}</span>
                  <span className="bg-white/10 px-2 py-0.5 rounded-full">{stageCandidates.length}</span>
                </div>

                <div className="space-y-3">
                  {stageCandidates.map(c => (
                    <div key={c.id} className="bg-zinc-900 p-4 rounded-lg border border-white/10 hover:border-brand-orange-500/40 transition-all space-y-3">
                      <div>
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-white text-sm">{c.name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-orange-500/10 text-brand-orange-400">
                            {c.roleApplied}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                          <Mail className="w-3 h-3 text-zinc-500" /> {c.email}
                        </p>
                        <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-zinc-500" /> {c.phone}
                        </p>
                      </div>

                      <div className="text-[11px] text-zinc-500 border-t border-white/5 pt-2 flex items-center justify-between">
                        <span>{c.experienceYears} yrs exp</span>
                        <span className="text-emerald-400 font-mono text-[10px]">
                          {c.activationStatus === 'ACCOUNT_ACTIVE' ? '✓ Active' : c.activationStatus === 'INVITATION_SENT' ? '✉ Invited' : '⏳ Pending HR'}
                        </span>
                      </div>

                      {/* HR ACTION BUTTONS */}
                      <div className="space-y-1.5 pt-1">
                        {c.stage !== 'HIRED' && (
                          <Button
                            onClick={() => handleApproveAndInvite(c)}
                            className="w-full bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-xs py-1.5 h-8 font-extrabold transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-md"
                          >
                            <Key className="w-3.5 h-3.5" /> Approve &amp; Send Magic Link
                          </Button>
                        )}

                        {c.stage !== 'HIRED' && (
                          <Button
                            onClick={() => handleAdvanceStage(c.id)}
                            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-1.5 h-7 font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            Advance Stage <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {stageCandidates.length === 0 && (
                    <div className="p-6 text-center text-xs text-zinc-600 border border-dashed border-white/5 rounded-lg">
                      No candidates in stage
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
