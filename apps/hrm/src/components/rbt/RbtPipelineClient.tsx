'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock3,
  FileCheck2,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';

type AssignedBcba = {
  firstName: string;
  lastName: string;
};

type ActiveClient = {
  id: string;
  firstName: string;
  lastName: string;
  rbtId?: string | null;
  bcbaId?: string | null;
  bcba?: AssignedBcba | null;
};

type ReturnedNote = {
  id: string;
  description: string;
  note: {
    id: string;
    session: {
      scheduledStart: string | Date;
      client: {
        firstName: string;
        lastName: string;
      };
    };
  };
};

type RbtPipelineClientProps = {
  activeClients?: ActiveClient[];
  returnedNotes?: ReturnedNote[];
  rbtId?: string | null;
};

function formatSessionDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default function RbtPipelineClient({
  activeClients = [],
  returnedNotes = [],
}: RbtPipelineClientProps) {
  return (
    <div className="relative mx-auto mt-8 max-w-6xl space-y-8 text-slate-900">
      <div
        className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-brand-orange-500/[0.07] blur-3xl"
        aria-hidden="true"
      />

      <section className="relative space-y-4" aria-labelledby="returned-notes-heading">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-900">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Action queue
            </div>
            <h2
              id="returned-notes-heading"
              className="font-heading text-2xl font-black tracking-tight text-slate-900"
            >
              Returned session notes
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Reopen the scheduled session in Session Studio, correct the content, and submit a
              new signed revision. The deficiency closes only through that canonical submission.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-rose-300 bg-rose-100 px-3 py-1 font-mono text-xs font-black text-rose-900">
            {returnedNotes.length} open
          </span>
        </header>

        {returnedNotes.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-emerald-300 bg-emerald-50 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-100 text-emerald-700">
              <FileCheck2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-heading text-base font-black text-slate-900">
              Documentation queue clear
            </h3>
            <p className="mt-1 text-xs text-slate-600">No returned notes require attention.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {returnedNotes.map((deficiency) => {
              const clientName = `${deficiency.note.session.client.firstName} ${deficiency.note.session.client.lastName}`;
              return (
                <article
                  key={deficiency.id}
                  className="group relative overflow-hidden rounded-2xl border border-rose-300 bg-[#FFFDF8] p-5 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:border-rose-400 hover:shadow-md"
                >
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-base font-black text-slate-900">
                        {clientName}
                      </h3>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        Session {formatSessionDate(deficiency.note.session.scheduledStart)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-900">
                      Returned
                    </span>
                  </div>

                  <blockquote className="relative mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs leading-5 text-rose-950">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-rose-800">
                      Coordinator feedback
                    </span>
                    “{deficiency.description}”
                  </blockquote>

                  <Link
                    href="/rbt/schedule"
                    aria-label={`Open Session Studio correction for ${clientName}`}
                    className="relative mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-rose-300 bg-rose-100 px-3 text-xs font-black text-rose-900 transition-all duration-300 hover:bg-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <Clock3 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    Correct in Session Studio
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="relative space-y-4 border-t border-[#E2D5B7] pt-8"
        aria-labelledby="therapy-work-heading"
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#C2410C]">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Staff workspace
            </div>
            <h2
              id="therapy-work-heading"
              className="font-heading text-2xl font-black tracking-tight text-slate-900"
            >
              Active therapy assignments
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Open assigned scheduled sessions from Schedule and document them in Session Studio.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 font-mono text-xs font-black text-emerald-800">
            {activeClients.length} assigned
          </span>
        </header>

        {activeClients.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border border-[#E2D5B7] bg-[#FFFDF8] p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E2D5B7] bg-[#F9F5EC] text-slate-500">
              <UserRoundCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-heading text-base font-black text-slate-900">
              No active client assignments
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Assigned therapy clients will appear here after staffing is complete.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeClients.map((client) => {
              const clientName = `${client.firstName} ${client.lastName}`;
              return (
                <article
                  key={client.id}
                  className="group relative overflow-hidden rounded-2xl border border-[#E2D5B7] bg-[#FFFDF8] p-5 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:border-brand-orange-500/40 hover:shadow-md"
                >
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-lg font-black text-slate-900">
                        {clientName}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        Supervising BCBA:{' '}
                        <span className="font-bold text-slate-900">
                          {client.bcba
                            ? `${client.bcba.firstName} ${client.bcba.lastName}`
                            : 'Not assigned'}
                        </span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                      <span className="dot-live h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </div>

                  {!client.rbtId && (
                    <div
                      role="alert"
                      className="relative mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                      RBT assignment is missing. Ask Case Coordination to assign the client
                      before opening Session Studio.
                    </div>
                  )}

                  <Link
                    href="/rbt/schedule"
                    aria-label={`Open assigned schedule for ${clientName}`}
                    className="relative mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-black text-white transition-all duration-300 hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Clock3 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    Open scheduled Session Studio
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
