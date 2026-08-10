'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Video, 
  UserCheck, 
  CheckCircle2, 
  ShieldCheck, 
  MessageSquare, 
  Send, 
  Users, 
  User, 
  Paperclip,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

interface Message {
  id: string;
  sender: string;
  role: string;
  text: string;
  time: string;
  isMe: boolean;
}

export default function RbtInterviewPage() {
  const hrAvailableHours: Record<string, string[]> = {
    'Eleanor Vance (Head of HR & Dispatch)': ['09:00 AM EST', '09:30 AM EST', '10:00 AM EST', '11:00 AM EST'],
    'Samantha Reed (ATS Recruiter)': ['01:00 PM EST', '01:30 PM EST', '02:30 PM EST', '03:30 PM EST'],
    'Marcus Vance (Compliance Lead)': ['04:00 PM EST', '04:30 PM EST', '05:30 PM EST', '06:30 PM EST']
  };

  const [selectedHr, setSelectedHr] = useState('Eleanor Vance (Head of HR & Dispatch)');
  const [interviewDate, setInterviewDate] = useState('2026-08-10');
  const [interviewTime, setInterviewTime] = useState('09:00 AM EST');
  const [isBooked, setIsBooked] = useState(false);

  const handleHrChange = (hrName: string) => {
    setSelectedHr(hrName);
    const availableSlots = hrAvailableHours[hrName] || ['10:00 AM EST'];
    setInterviewTime(availableSlots[0]);
  };

  // Communications Messenger State
  const [activeChannel, setActiveChannel] = useState<'HR' | 'CC' | 'BCBA' | 'CLIENT'>('HR');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    HR: [
      { id: '1', sender: 'Eleanor Vance', role: 'Head of HR', text: 'Welcome to Rise & Shine ABA! Your onboarding interview slot is confirmed.', time: '09:00 AM', isMe: false },
      { id: '2', sender: 'Samantha Reed', role: 'ATS Recruiter', text: 'Please reach out if you need any assistance uploading your compliance cards!', time: '09:05 AM', isMe: false }
    ],
    CC: [
      { id: '3', sender: 'Marcus Vance', role: 'Case Coordinator Lead', text: 'Hi! We have 2 potential client cases in Brooklyn (Park Slope) matching your afternoon availability grid.', time: 'Yesterday', isMe: false }
    ],
    BCBA: [
      { id: '4', sender: 'Dr. Sarah Jenkins, BCBA', role: 'Clinical Supervisor', text: 'Hello! I reviewed your DTT data collection simulation score (100% accuracy). Great work on prompt logging!', time: '10:15 AM', isMe: false }
    ],
    CLIENT: [
      { id: '5', sender: 'Elena Miller (Parent)', role: 'Caregiver - Client Leo M.', text: 'Hi! Looking forward to meeting you for our intake session next Tuesday!', time: 'Monday', isMe: false }
    ]
  });

  useEffect(() => {
    const interviewDone = localStorage.getItem('ras_rbt_interview_done') === 'true';
    if (interviewDone) setIsBooked(true);
  }, []);

  const handleBookInterview = (e: React.FormEvent) => {
    e.preventDefault();
    setIsBooked(true);
    const payload = {
      candidateName: 'David Miller (RBT Candidate)',
      hrInterviewer: selectedHr,
      date: interviewDate,
      time: interviewTime,
      status: 'SCHEDULED',
      bookedAt: new Date().toISOString()
    };
    localStorage.setItem('ras_rbt_interview_done', 'true');
    localStorage.setItem('ras_rbt_interview_payload', JSON.stringify(payload));
    window.dispatchEvent(new Event('rbt_interview_changed'));
    toast.success(`HR Interview scheduled with ${selectedHr} on ${interviewDate} at ${interviewTime}! HR Recruiter notified.`);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'Me (BT/RBT)',
      role: 'Behavior Technician',
      text: messageInput,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true
    };

    setMessages(prev => ({
      ...prev,
      [activeChannel]: [...(prev[activeChannel] || []), newMessage]
    }));

    setMessageInput('');
    toast.success('Message sent!');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-orange-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            {isBooked ? (
              <MessageSquare className="w-7 h-7 text-[#F97316]" />
            ) : (
              <Video className="w-7 h-7 text-[#F97316]" />
            )}
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              {isBooked ? 'Unified Team & Caregiver Communications Hub' : 'HR Onboarding Interview'}
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            {isBooked 
              ? 'Direct real-time messaging with HR Specialists, Case Coordinators, Supervising BCBAs, and Client Caregivers.'
              : 'Book an official 1-on-1 video onboarding interview slot with an HR Specialist.'}
          </p>
        </div>

        <span className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm ${
          isBooked ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-orange-100 text-[#F97316] border-orange-300'
        }`}>
          {isBooked ? '✓ COMMUNICATIONS UNLOCKED' : 'INTERVIEW PENDING'}
        </span>
      </div>

      {/* MODE 1: BOOK HR INTERVIEW */}
      {!isBooked ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {/* BOOKING FORM */}
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
            <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#F97316]" /> Select Interview Slot
            </h3>

            <form onSubmit={handleBookInterview} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">Select HR Interviewer</label>
                <select
                  value={selectedHr}
                  onChange={(e) => handleHrChange(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
                >
                  <option value="Eleanor Vance (Head of HR & Dispatch)">Eleanor Vance (Head of HR &amp; Dispatch)</option>
                  <option value="Samantha Reed (ATS Recruiter)">Samantha Reed (ATS Recruiter)</option>
                  <option value="Marcus Vance (Compliance Lead)">Marcus Vance (Compliance Lead)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">Interview Date</label>
                <input
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">Available Time Slots for {selectedHr.split(' ')[0]}</label>
                <select
                  value={interviewTime}
                  onChange={(e) => setInterviewTime(e.target.value)}
                  className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
                >
                  {(hrAvailableHours[selectedHr] || ['10:00 AM EST']).map(timeSlot => (
                    <option key={timeSlot} value={timeSlot}>{timeSlot}</option>
                  ))}
                </select>
              </div>

              <Button type="submit" className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-lg mt-2 cursor-pointer">
                Confirm &amp; Schedule Video Interview
              </Button>
            </form>
          </div>

          {/* STATUS CARD */}
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#F97316]" /> Interview Confirmation Details
              </h3>

              <div className="mt-4 p-5 bg-[#F0F7FF] rounded-2xl border-2 border-[#BFDBFE] text-center space-y-2">
                <Clock className="w-8 h-8 text-[#F97316] mx-auto" />
                <h4 className="font-extrabold text-xs text-slate-900">No Interview Booked Yet</h4>
                <p className="text-[11px] text-slate-600 font-medium">Select an HR specialist and date slot on the left to schedule your onboarding interview.</p>
              </div>
            </div>

            <div className="p-4 bg-orange-50 rounded-2xl border border-orange-200 text-xs text-slate-700 font-medium">
              💡 <strong>Note:</strong> Scheduling your interview instantly unlocks the <strong>Unified Communications Center</strong> to message HR, Case Coordinators, and BCBAs!
            </div>
          </div>
        </div>
      ) : (
        /* MODE 2: UNIFIED COMMUNICATIONS MESSENGER HUB */
        <div className="bg-white border-2 border-orange-200 rounded-3xl shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-3 min-h-[550px] animate-fade-in">
          {/* CHANNELS SIDEBAR */}
          <div className="border-r border-orange-100 bg-orange-50/50 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-orange-200 pb-3">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#F97316]" /> Active Channels
              </h3>
              <span className="dot-live bg-[#F97316]"></span>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setActiveChannel('HR')}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                  activeChannel === 'HR'
                    ? 'bg-white border-[#F97316] text-slate-900 shadow-md'
                    : 'bg-white/60 border-orange-100 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-orange-100 border border-orange-300 text-[#F97316] flex items-center justify-center font-bold text-xs">HR</div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900">HR Specialist Team</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Eleanor Vance, Samantha</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </button>

              <button
                onClick={() => setActiveChannel('CC')}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                  activeChannel === 'CC'
                    ? 'bg-white border-[#F97316] text-slate-900 shadow-md'
                    : 'bg-white/60 border-orange-100 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-300 text-blue-800 flex items-center justify-center font-bold text-xs">CC</div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900">Case Coordinators</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Marcus Vance (Caseloads)</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </button>

              <button
                onClick={() => setActiveChannel('BCBA')}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                  activeChannel === 'BCBA'
                    ? 'bg-white border-[#F97316] text-slate-900 shadow-md'
                    : 'bg-white/60 border-orange-100 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center font-bold text-xs">BA</div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900">Supervising BCBA</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Dr. Sarah Jenkins, BCBA</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </button>

              <button
                onClick={() => setActiveChannel('CLIENT')}
                className={`w-full p-3 rounded-2xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                  activeChannel === 'CLIENT'
                    ? 'bg-white border-[#F97316] text-slate-900 shadow-md'
                    : 'bg-white/60 border-orange-100 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-purple-100 border border-purple-300 text-purple-800 flex items-center justify-center font-bold text-xs">PAR</div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900">Client Caregiver</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Elena M. (Parent of Leo)</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-slate-300" />
              </button>
            </div>

            {/* CONFIRMED INTERVIEW SLOT INFO CARD */}
            <div className="p-3.5 bg-white rounded-2xl border border-orange-200 text-xs space-y-1.5 pt-3">
              <span className="text-[10px] font-black text-[#F97316] uppercase tracking-wide block">Confirmed HR Slot:</span>
              <p className="font-bold text-slate-900">{selectedHr}</p>
              <p className="text-slate-600 font-medium text-[11px]">{interviewDate} at {interviewTime}</p>
              <button 
                onClick={() => toast.info('Opening Google Meet video link...')}
                className="text-[11px] font-black text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Launch Google Meet Link</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* CHAT MESSENGER PANEL */}
          <div className="col-span-2 flex flex-col justify-between p-6 bg-white space-y-4">
            {/* CHAT HEADER */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 font-heading">
                  {activeChannel === 'HR' && 'HR Specialist Team Channel'}
                  {activeChannel === 'CC' && 'Case Coordinator Matching Channel'}
                  {activeChannel === 'BCBA' && 'Clinical Supervision Channel (BCBA)'}
                  {activeChannel === 'CLIENT' && 'Caregiver Parent Direct Channel'}
                </h3>
                <span className="text-[11px] text-slate-500 font-semibold">End-to-end encrypted HIPAA compliant portal chat</span>
              </div>

              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-black border border-emerald-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ACTIVE CHAT
              </span>
            </div>

            {/* MESSAGE HISTORY */}
            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar max-h-[380px] pr-2">
              {(messages[activeChannel] || []).map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold text-slate-500">{msg.sender} ({msg.role})</span>
                    <span className="text-[9px] font-mono text-slate-400">{msg.time}</span>
                  </div>
                  <div className={`p-3.5 rounded-2xl max-w-md text-xs font-semibold shadow-sm leading-relaxed ${
                    msg.isMe 
                      ? 'bg-[#F97316] text-white rounded-br-none' 
                      : 'bg-[#F0F7FF] border-2 border-[#BFDBFE] text-slate-900 rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* QUICK RESPONSE TEMPLATES */}
            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">QUICK TEMPLATES:</span>
              <button
                type="button"
                onClick={() => setMessageInput('Question regarding my upcoming session schedule.')}
                className="bg-orange-50 hover:bg-orange-100 text-[#F97316] text-[10px] font-bold px-2.5 py-1 rounded-xl border border-orange-200 whitespace-nowrap cursor-pointer"
              >
                💬 Session Schedule Question
              </button>
              <button
                type="button"
                onClick={() => setMessageInput('Submitted updated weekly availability grid for review.')}
                className="bg-blue-50 hover:bg-blue-100 text-blue-800 text-[10px] font-bold px-2.5 py-1 rounded-xl border border-blue-200 whitespace-nowrap cursor-pointer"
              >
                🕒 Availability Update
              </button>
            </div>

            {/* MESSAGE INPUT COMPOSITION */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => toast.info('File attachment feature ready!')}
                className="p-3 text-slate-400 hover:text-[#F97316] bg-slate-100 rounded-2xl cursor-pointer"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type your message to HR, Case Coordinators, or BCBA..."
                className="flex-1 bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs font-bold text-slate-900 outline-none focus:border-[#F97316]"
              />
              <Button type="submit" className="bg-[#F97316] hover:bg-orange-600 text-white font-bold px-5 py-3 rounded-2xl flex items-center gap-1.5 shadow-md cursor-pointer">
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
