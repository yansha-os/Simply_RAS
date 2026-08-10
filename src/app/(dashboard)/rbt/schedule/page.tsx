'use client';

import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Video, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  Send,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import Link from 'next/link';

interface ScheduledSession {
  id: string;
  client: string;
  age: number;
  bcba: string;
  date: string;
  dayOfWeek: string;
  time: string;
  location: string;
  status: 'CONFIRMED' | 'UPCOMING' | 'COVERAGE_REQUESTED';
  draftNoteCreated: boolean;
}

export default function RbtSchedulePage() {
  const [viewMode, setViewMode] = useState<'CALENDAR' | 'TIMELINE'>('CALENDAR');
  const [showSickDayModal, setShowSickDayModal] = useState(false);
  const [selectedSessionForSick, setSelectedSessionForSick] = useState<ScheduledSession | null>(null);

  // Sick Day Form State
  const [sickReason, setSickReason] = useState('Sudden Illness / Sick Day');
  const [sickNote, setSickNote] = useState('');

  const [sessions, setSessions] = useState<ScheduledSession[]>([
    { 
      id: 's1', 
      client: 'Leo Miller', 
      age: 6, 
      bcba: 'Dr. Sarah Jenkins, BCBA', 
      date: '2026-08-10', 
      dayOfWeek: 'Monday', 
      time: '02:00 PM - 04:00 PM', 
      location: '12 - Home Session · Park Slope, Brooklyn', 
      status: 'CONFIRMED',
      draftNoteCreated: true 
    },
    { 
      id: 's2', 
      client: 'Maya Rodriguez', 
      age: 4, 
      bcba: 'Marcus Vance, BCBA', 
      date: '2026-08-11', 
      dayOfWeek: 'Tuesday', 
      time: '03:30 PM - 05:30 PM', 
      location: '03 - School Session · Astoria, Queens', 
      status: 'UPCOMING',
      draftNoteCreated: true 
    },
    { 
      id: 's3', 
      client: 'Lucas Miller', 
      age: 8, 
      bcba: 'Dr. Sarah Jenkins, BCBA', 
      date: '2026-08-13', 
      dayOfWeek: 'Thursday', 
      time: '04:00 PM - 06:00 PM', 
      location: '11 - Clinic Session · Upper West Side, NY', 
      status: 'UPCOMING',
      draftNoteCreated: false 
    },
    { 
      id: 's4', 
      client: 'Ethan Vance', 
      age: 5, 
      bcba: 'Dr. Amanda Chen', 
      date: '2026-08-14', 
      dayOfWeek: 'Friday', 
      time: '01:00 PM - 03:00 PM', 
      location: '12 - Home Session · Riverdale, Bronx', 
      status: 'UPCOMING',
      draftNoteCreated: false 
    }
  ]);

  const handleOpenSickModal = (session?: ScheduledSession) => {
    setSelectedSessionForSick(session || null);
    setShowSickDayModal(true);
  };

  const handleSubmitSickDayRequest = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedSessionForSick) {
      setSessions(prev => prev.map(s => s.id === selectedSessionForSick.id ? { ...s, status: 'COVERAGE_REQUESTED' } : s));
    }

    setShowSickDayModal(false);
    toast.success('Sick Day & Emergency Coverage Request sent to Case Coordinator (Marcus Vance) & HR Dispatch!');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900 select-none">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-orange-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Calendar className="w-7 h-7 text-[#F97316]" />
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              My Therapy Session Schedule &amp; Calendar
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            View future scheduled client sessions, manage draft session notes, and dispatch emergency sick day call-outs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* VIEW MODE TOGGLE */}
          <div className="bg-[#F0F7FF] border-2 border-[#BFDBFE] p-1 rounded-2xl flex items-center gap-1">
            <button
              onClick={() => setViewMode('CALENDAR')}
              className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                viewMode === 'CALENDAR' ? 'bg-[#F97316] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              📅 Calendar Grid
            </button>
            <button
              onClick={() => setViewMode('TIMELINE')}
              className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                viewMode === 'TIMELINE' ? 'bg-[#F97316] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              📋 Timeline Feed
            </button>
          </div>

          {/* 🚨 REQUEST SICK DAY / CALL-OUT BUTTON */}
          <button
            onClick={() => handleOpenSickModal()}
            className="bg-rose-500 hover:bg-rose-600 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2 transition-all cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 text-yellow-200" />
            <span>Request Sick Day / Call-Out</span>
          </button>
        </div>
      </div>

      {/* MODE 1: INTERACTIVE WEEKLY CALENDAR GRID */}
      {viewMode === 'CALENDAR' ? (
        <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-slate-900 font-heading">August 2026 — Weekly Schedule</span>
              <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                4 Upcoming Sessions
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <button className="p-2 hover:bg-orange-50 rounded-xl cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
              <span>Aug 10 – Aug 16</span>
              <button className="p-2 hover:bg-orange-50 rounded-xl cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          {/* 7-DAY CALENDAR MATRIX */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {['Monday (Aug 10)', 'Tuesday (Aug 11)', 'Wednesday (Aug 12)', 'Thursday (Aug 13)', 'Friday (Aug 14)'].map((dayStr, idx) => {
              const dayName = dayStr.split(' ')[0];
              const daySessions = sessions.filter(s => s.dayOfWeek === dayName);

              return (
                <div key={dayStr} className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 space-y-3 min-h-[220px]">
                  <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 font-heading">{dayStr}</span>
                    <span className="text-[10px] font-mono font-bold text-slate-400">{daySessions.length}</span>
                  </div>

                  {daySessions.length === 0 ? (
                    <div className="text-[11px] text-slate-400 font-semibold italic text-center pt-8">
                      No sessions scheduled
                    </div>
                  ) : (
                    daySessions.map((session) => (
                      <div
                        key={session.id}
                        className={`p-3 rounded-2xl border-2 space-y-2 transition-all shadow-sm ${
                          session.status === 'COVERAGE_REQUESTED'
                            ? 'bg-rose-50 border-rose-300'
                            : 'bg-white border-orange-200 hover:border-[#F97316]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-extrabold text-slate-900">{session.client}</strong>
                          <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border ${
                            session.status === 'COVERAGE_REQUESTED'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}>
                            {session.status === 'COVERAGE_REQUESTED' ? 'SICK CALL-OUT' : session.status}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 font-semibold space-y-0.5">
                          <p className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#F97316]" /> {session.time}</p>
                          <p className="flex items-center gap-1 text-[10px] text-slate-500 truncate"><MapPin className="w-3 h-3 text-purple-600" /> {session.location}</p>
                        </div>

                        {/* CARD ACTIONS */}
                        <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100">
                          <Link
                            href="/rbt/simulation"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-xl text-center shadow-sm cursor-pointer"
                          >
                            EVV Start Session →
                          </Link>

                          {session.status !== 'COVERAGE_REQUESTED' && (
                            <button
                              onClick={() => handleOpenSickModal(session)}
                              className="text-[10px] font-bold text-rose-600 hover:underline text-left cursor-pointer"
                            >
                              🚨 Request Sick Call-Out
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* MODE 2: TIMELINE FEED VIEW */
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`bg-white border-2 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                session.status === 'COVERAGE_REQUESTED' ? 'border-rose-300 bg-rose-50/50' : 'border-orange-200 hover:border-[#F97316]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-black text-slate-900 font-heading">{session.client}</h3>
                  <span className="bg-orange-100 text-[#F97316] border border-orange-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    Age {session.age}
                  </span>
                  <span className={`text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full border ${
                    session.status === 'COVERAGE_REQUESTED'
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}>
                    {session.status === 'COVERAGE_REQUESTED' ? '🚨 SICK CALL-OUT PENDING' : `✓ ${session.status}`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5 text-slate-900 font-bold">
                    <Calendar className="w-4 h-4 text-[#F97316]" /> {session.dayOfWeek}, {session.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-[#F97316]" /> {session.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4 text-blue-600" /> {session.bcba}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-purple-600" /> {session.location}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/rbt/simulation"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-md cursor-pointer transition-all"
                >
                  EVV Start Session
                </Link>

                {session.status !== 'COVERAGE_REQUESTED' && (
                  <Button
                    onClick={() => handleOpenSickModal(session)}
                    className="bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 font-extrabold text-xs px-4 py-3 rounded-2xl cursor-pointer"
                  >
                    🚨 Sick Call-Out
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 🚨 SICK DAY / EMERGENCY TIME-OFF CALL-OUT MODAL */}
      {showSickDayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-300 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-fade-in text-slate-900">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center font-bold">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 font-heading">Request Sick Day / Call-Out</h3>
                  <span className="text-[11px] text-slate-500 font-semibold">Immediate Dispatch Alert to Case Coordinators &amp; HR</span>
                </div>
              </div>
              <button onClick={() => setShowSickDayModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSubmitSickDayRequest} className="space-y-4">
              {selectedSessionForSick && (
                <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 font-semibold space-y-1">
                  <strong>Affected Client Session:</strong>
                  <p>{selectedSessionForSick.client} · {selectedSessionForSick.dayOfWeek}, {selectedSessionForSick.date} ({selectedSessionForSick.time})</p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">Reason for Call-Out</label>
                <select
                  value={sickReason}
                  onChange={(e) => setSickReason(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-rose-500"
                >
                  <option value="Sudden Illness / Sick Day">Sudden Illness / Sick Day</option>
                  <option value="Family Emergency">Family Emergency</option>
                  <option value="Vehicle / Transportation Breakdown">Vehicle / Transportation Breakdown</option>
                  <option value="Planned Paid Time Off (PTO)">Planned Paid Time Off (PTO)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">Message for Case Coordinator (Marcus Vance)</label>
                <textarea
                  value={sickNote}
                  onChange={(e) => setSickNote(e.target.value)}
                  placeholder="Provide brief details for emergency RBT substitute matching..."
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-rose-500 h-24"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSickDayModal(false)}
                  className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="button"
                  onClick={handleSubmitSickDayRequest}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-6 py-3.5 rounded-2xl shadow-lg cursor-pointer"
                >
                  Submit Sick Day Call-Out &amp; Dispatch Alert
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
