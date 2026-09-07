'use client';

import React, { useMemo, useState } from 'react';
import type { ClientStatus } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Users, Search, AlertCircle, ExternalLink, Filter } from 'lucide-react';
import Link from 'next/link';
import CaseCoordActionItems from './CaseCoordActionItems';

type StatusFilter = 'ALL' | 'STAFFING_PENDING' | 'ACTIVE';

type CoordinatorOption = {
  id: string;
  firstName: string;
  lastName: string;
};

type CaseCoordClient = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  status: ClientStatus;
  caseCoordinatorId: string | null;
  rbtId: string | null;
  rbtApproved: boolean;
  bcba: { firstName: string; lastName: string } | null;
  rbt: { firstName: string; lastName: string; email: string } | null;
};

export default function CaseCoordClientsView({
  coordinators,
  allClients,
  initialStatusFilter = 'ALL',
}: {
  coordinators: CoordinatorOption[];
  allClients: CaseCoordClient[];
  initialStatusFilter?: StatusFilter;
}) {
  const [selectedCoordId, setSelectedCoordId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);

  const { myClients, meetAndGreetQueue, filteredClients } = useMemo(() => {
    const scopedClients: CaseCoordClient[] = [];
    const meetAndGreet: CaseCoordClient[] = [];
    const filtered: CaseCoordClient[] = [];
    const normalizedSearch = searchQuery.trim().toLowerCase();

    for (const client of allClients) {
      if (selectedCoordId && client.caseCoordinatorId !== selectedCoordId) continue;
      scopedClients.push(client);
      if (client.rbtId && !client.rbtApproved) meetAndGreet.push(client);

      const matchesSearch = `${client.firstName} ${client.lastName} ${client.guardianName ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch);
      if (matchesSearch && (statusFilter === 'ALL' || client.status === statusFilter)) {
        filtered.push(client);
      }
    }

    return {
      myClients: scopedClients,
      meetAndGreetQueue: meetAndGreet,
      filteredClients: filtered,
    };
  }, [allClients, searchQuery, selectedCoordId, statusFilter]);

  return (
    <div className="space-y-8">
      {/* Header & Coordinator Identity Selector */}
      <div className="relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950/80 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-orange-500/10 blur-3xl" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white font-heading flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-orange-500" />
            Case Coordinator Workflows & Roster
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage field tickets, RBT meet & greets, and individual client schedules.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-zinc-900/90 px-3 py-2 rounded-xl border border-white/10 flex items-center">
            <span className="text-xs text-zinc-400 mr-2 font-bold uppercase font-mono">Coordinator:</span>
            <select
              className="bg-transparent text-white font-semibold text-xs outline-none cursor-pointer"
              value={selectedCoordId}
              onChange={e => setSelectedCoordId(e.target.value)}
            >
              <option value="">All Coordinators (Master View)</option>
              {coordinators.map(c => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </div>
          <Link
            href="/portal-case-coord/openings"
            className="hidden sm:inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 text-xs font-bold text-zinc-200 transition-all hover:border-cyan-500/40 hover:text-white"
          >
            Openings
          </Link>
        </div>
      </div>

      {/* 1. Action Items / Field Tickets Inbox */}
      <CaseCoordActionItems coordinatorId={selectedCoordId} />

      {/* 2. Pending RBT Meet & Greet Queue */}
      {meetAndGreetQueue.length > 0 && (
        <Card className="border-brand-orange-500/30 bg-zinc-950">
          <CardHeader className="pb-4 border-b border-white/5">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-brand-orange-400" />
              Pending RBT Meet & Greets ({meetAndGreetQueue.length})
            </CardTitle>
            <p className="text-xs text-zinc-400 mt-1">RBT applied via Job Board / was provisionally linked. Complete parent meet & greet, or manage from Job Openings.</p>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetAndGreetQueue.map(client => (
              <Card key={client.id} className="bg-zinc-900 border-white/10">
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div>
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-white text-base">{client.firstName} {client.lastName}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-orange-500/10 text-brand-orange-400 uppercase">
                        Candidate Assigned
                      </span>
                    </div>
                    <div className="mt-3 bg-zinc-950 p-3 rounded-lg border border-white/5 space-y-1 text-xs">
                      <p className="text-zinc-500 font-semibold uppercase text-[10px]">RBT Candidate</p>
                      <p className="text-white font-medium">{client.rbt?.firstName} {client.rbt?.lastName}</p>
                      <p className="text-zinc-400">{client.rbt?.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-white/5">
                    <Link
                      href="/portal-case-coord/openings"
                      className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-3 py-2 text-xs font-bold text-brand-orange-300 transition-all hover:border-brand-orange-500/50 hover:bg-brand-orange-500/15"
                    >
                      Resolve in Job Openings
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Searchable & Filterable Client Roster */}
      <Card className="border-white/10 bg-zinc-950">
        <CardHeader className="pb-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-blue-400" />
              Assigned Caseload Roster
            </CardTitle>
            <p className="text-xs text-zinc-400 mt-1">Browse, filter, and open client profiles for schedule activation.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search client or parent..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-brand-orange-500 w-56"
              />
            </div>

            {/* Status Filter */}
            <div className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 flex items-center text-xs text-zinc-400">
              <Filter className="w-3.5 h-3.5 mr-1 text-zinc-500" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                className="bg-transparent text-white outline-none cursor-pointer font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="STAFFING_PENDING">STAFFING PENDING</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {filteredClients.length === 0 ? (
            <div className="relative overflow-hidden py-12 px-6 text-center border border-dashed border-white/10 rounded-2xl bg-zinc-950/40 backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,107,0,0.05),transparent_60%)]" />
              <div className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/80">
                {myClients.length === 0 ? (
                  <Users className="h-5 w-5 text-zinc-500" />
                ) : (
                  <Search className="h-5 w-5 text-zinc-500" />
                )}
              </div>
              <p className="relative font-heading text-sm font-semibold text-white">
                {myClients.length === 0 ? 'No clients on this caseload' : 'No clients match your filters'}
              </p>
              <p className="relative mt-1.5 text-xs text-zinc-500 max-w-sm mx-auto">
                {myClients.length === 0
                  ? selectedCoordId
                    ? 'This coordinator has no assigned clients yet. Switch to the Master View or assign clients from a profile.'
                    : 'No clients are assigned to case coordination yet — they appear here once intake hands them off.'
                  : 'Try a different name, or reset the search and status filter.'}
              </p>
              {myClients.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                  }}
                  className="relative mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-brand-orange-500/30 bg-brand-orange-500/10 px-3 py-2 text-xs font-bold text-brand-orange-300 transition-all hover:bg-brand-orange-500/20"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.map(client => {
                const deepTab =
                  client.status === 'STAFFING_PENDING'
                    ? client.rbtId
                      ? 'first_session'
                      : 'staffing'
                    : undefined;
                const href = deepTab
                  ? `/client/${client.id}?mode=case-coord&tab=${deepTab}`
                  : `/client/${client.id}?mode=case-coord`;
                return (
                <Link key={client.id} href={href} className="block group cursor-pointer">
                  <Card className="bg-zinc-950/80 backdrop-blur-xl border-white/10 group-hover:border-brand-orange-500/40 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl">
                    <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-white text-base group-hover:text-brand-orange-400 transition-colors">
                            {client.firstName} {client.lastName}
                          </h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${
                            client.status === 'ACTIVE' 
                              ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                              : 'bg-brand-orange-500/10 text-brand-orange-400 border-brand-orange-500/20'
                          }`}>
                            {client.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-400 mt-1">Parent: {client.guardianName || 'N/A'}</p>

                        <div className="mt-3 bg-zinc-950 p-3 rounded-lg border border-white/5 space-y-1 text-xs text-zinc-300">
                          <p><span className="text-zinc-500">BCBA:</span> {client.bcba ? `${client.bcba.firstName} ${client.bcba.lastName}` : 'Unassigned'}</p>
                          <p><span className="text-zinc-500">RBT:</span> {client.rbt ? `${client.rbt.firstName} ${client.rbt.lastName}` : 'Unassigned'}</p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs font-bold text-brand-orange-400 group-hover:text-brand-orange-300">
                        <span>
                          {deepTab === 'first_session'
                            ? 'Open First Session & Activate'
                            : deepTab === 'staffing'
                              ? 'Open Staffing tab'
                              : 'Open Staffing · First Session'}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
