'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  ArrowRight,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import { getHrMembers, bookHrInterview } from '@/app/actions/hrInterviewActions';

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
    'Marcus Vance (HR Agent (Recruiter / Onboarding))': ['09:00 AM EST', '09:30 AM EST', '10:00 AM EST', '11:00 AM EST'],
    'Marcus Vance (HR Agent)': ['09:00 AM EST', '09:30 AM EST', '10:00 AM EST', '11:00 AM EST']
  };

  const [hrMembers, setHrMembers] = useState<{ id: string; name: string; role: string; email: string }[]>([]);
  const [selectedHrId, setSelectedHrId] = useState<string>('usr-2');
  const [selectedHr, setSelectedHr] = useState<string>('Marcus Vance (HR Agent)');
  const [interviewDate, setInterviewDate] = useState('2026-08-10');
  const [interviewTime, setInterviewTime] = useState('09:00 AM EST');
  const [isBooked, setIsBooked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Google Meet Green Room Lobby State
  const [showMeetLobby, setShowMeetLobby] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  useEffect(() => {
    async function loadHrTeam() {
      const res = await getHrMembers();
      if (res.success && res.data.length > 0) {
        setHrMembers(res.data);
        setSelectedHrId(res.data[0].id);
        setSelectedHr(`${res.data[0].name} (${res.data[0].role})`);
      }
    }
    loadHrTeam();
  }, []);

  const handleHrChange = (hrId: string) => {
    setSelectedHrId(hrId);
    const member = hrMembers.find(m => m.id === hrId);
    const hrDisplayName = member ? `${member.name} (${member.role})` : hrId;
    setSelectedHr(hrDisplayName);
    const availableSlots = hrAvailableHours[hrDisplayName] || hrAvailableHours['Marcus Vance (HR Agent)'] || ['10:00 AM EST'];
    setInterviewTime(availableSlots[0]);
  };

  // Communications Messenger State
  const [activeChannel, setActiveChannel] = useState<'HR' | 'CC' | 'BCBA' | 'CLIENT'>('HR');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    HR: [
      { id: '1', sender: 'Marcus Vance', role: 'HR Agent', text: 'Welcome to Rise & Shine ABA! Your onboarding interview slot is confirmed.', time: '09:00 AM', isMe: false },
      { id: '2', sender: 'Marcus Vance', role: 'HR Agent', text: 'Please reach out if you need any assistance uploading your compliance cards!', time: '09:05 AM', isMe: false }
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

  const [isMeetUnlocked, setIsMeetUnlocked] = useState(false);
  const [meetUrl, setMeetUrl] = useState('https://meet.google.com/ras-rbt-onboarding');
  const [interviewStatus, setInterviewStatus] = useState<'UNBOOKED' | 'SCHEDULED' | 'COMPLETED'>('UNBOOKED');
  const [scheduledDetails, setScheduledDetails] = useState<{ interviewer: string; date: string; time: string } | null>(null);

  // Check if meeting is within 5 minutes of designated date & time
  useEffect(() => {
    if (!scheduledDetails) return;

    const checkTimeSlot = () => {
      try {
        // Parse date and time string e.g. "2026-08-10" and "09:00 AM EST"
        const [year, month, day] = scheduledDetails.date.split('-').map(Number);
        const timePart = scheduledDetails.time.replace(' EST', '').trim();
        const [timeStr, period] = timePart.split(' ');
        let [hours, minutes] = timeStr.split(':').map(Number);
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        const scheduledDateTime = new Date(year, month - 1, day, hours, minutes);
        const now = new Date();
        const diffInMinutes = (scheduledDateTime.getTime() - now.getTime()) / (1000 * 60);

        // Eligible if current time is within 5 minutes before scheduled start or up to 60 mins after
        if (diffInMinutes <= 5 && diffInMinutes >= -60) {
          setIsMeetUnlocked(true);
        } else {
          setIsMeetUnlocked(false);
        }
      } catch (e) {
        setIsMeetUnlocked(false);
      }
    };

    checkTimeSlot();
    const interval = setInterval(checkTimeSlot, 10000);
    return () => clearInterval(interval);
  }, [scheduledDetails]);

  const [isHrPresent, setIsHrPresent] = useState(false);

  // Dynamically resolve exact shared meeting URL and HR Agent presence status
  useEffect(() => {
    const checkHrPresenceAndPayload = () => {
      const payloadStr = localStorage.getItem('ras_rbt_interview_payload');
      const hrJoined = localStorage.getItem('ras_hr_joined_meeting') === 'true';
      setIsHrPresent(hrJoined);

      if (payloadStr) {
        try {
          const payload = JSON.parse(payloadStr);
          if (payload.meetingLink) {
            setMeetUrl(payload.meetingLink);
            return;
          }
        } catch (e) {}
      }
      setMeetUrl('https://meet.jit.si/RiseAndShine_HR_Interview_cand_1');
    };

    checkHrPresenceAndPayload();
    window.addEventListener('storage', checkHrPresenceAndPayload);
    window.addEventListener('rbt_interview_changed', checkHrPresenceAndPayload);
    return () => {
      window.removeEventListener('storage', checkHrPresenceAndPayload);
      window.removeEventListener('rbt_interview_changed', checkHrPresenceAndPayload);
    };
  }, [scheduledDetails]);

  useEffect(() => {
    const checkStatus = () => {
      const interviewDataStr = localStorage.getItem('ras_rbt_interview_payload');
      if (interviewDataStr) {
        try {
          const payload = JSON.parse(interviewDataStr);
          if (payload.meetingLink) {
            setMeetUrl(payload.meetingLink);
          }
          setScheduledDetails({
            interviewer: payload.hrInterviewer || selectedHr,
            date: payload.date || interviewDate,
            time: payload.time || interviewTime,
          });
          if (payload.status === 'COMPLETED' || localStorage.getItem('ras_rbt_interview_passed') === 'true') {
            setInterviewStatus('COMPLETED');
            setIsBooked(true);
          } else {
            setInterviewStatus('SCHEDULED');
          }
        } catch (e) {
          // fallback
        }
      }
    };

    checkStatus();
    window.addEventListener('rbt_interview_changed', checkStatus);
    window.addEventListener('storage', checkStatus);
    return () => {
      window.removeEventListener('rbt_interview_changed', checkStatus);
      window.removeEventListener('storage', checkStatus);
    };
  }, []);

  const handleBookInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let candidateName = 'Jane Doe';
      let candidateEmail = '';
      let candidateId = '';
      try {
        const impId = localStorage.getItem('ras_active_impersonated_applicant_id') || localStorage.getItem('ras_active_applicant_id');
        const impEmail = localStorage.getItem('ras_active_impersonated_applicant_email');
        const impName = localStorage.getItem('ras_active_impersonated_applicant_name');

        const latestStr = localStorage.getItem('ras_latest_submitted_app');
        if (latestStr) {
          const parsed = JSON.parse(latestStr);
          if (parsed.fullName) candidateName = parsed.fullName;
          else if (parsed.name) candidateName = parsed.name;
          if (parsed.email) candidateEmail = parsed.email;
          if (parsed.applicantId) candidateId = parsed.applicantId;
        }

        if (impId) candidateId = impId;
        if (impEmail) candidateEmail = impEmail;
        if (impName) candidateName = impName;
      } catch (e) {}

      const bookingRes = await bookHrInterview({
        candidateName: `${candidateName} (RBT Applicant)`,
        hrInterviewerId: selectedHrId,
        hrInterviewerName: selectedHr,
        date: interviewDate,
        time: interviewTime,
      });

      if (bookingRes.success) {
        const roomName = `RiseAndShine_HR_Interview_${candidateId || 'cand-1'}`;
        const meetingLink = `https://meet.jit.si/${roomName}`;
        const payload = {
          candidateName: `${candidateName} (RBT Applicant)`,
          candidateEmail,
          candidateId,
          hrInterviewer: selectedHr,
          hrInterviewerId: selectedHrId,
          date: interviewDate,
          time: interviewTime,
          meetingCode: roomName,
          meetingLink: meetingLink,
          status: 'SCHEDULED',
          bookedAt: new Date().toISOString()
        };
        localStorage.setItem('ras_rbt_interview_done', 'true');
        localStorage.setItem('ras_rbt_interview_payload', JSON.stringify(payload));
        
        if (candidateId) {
          localStorage.setItem(`ras_rbt_interview_booked_${candidateId}`, 'true');
          localStorage.setItem(`ras_rbt_interview_done_${candidateId}`, 'true');
        }
        if (candidateEmail) {
          localStorage.setItem(`ras_rbt_interview_booked_${candidateEmail.toLowerCase().trim()}`, 'true');
          localStorage.setItem(`ras_rbt_interview_done_${candidateEmail.toLowerCase().trim()}`, 'true');
        }

        // Auto-move candidate to 3. Interview stage in ATS pipeline
        try {
          const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
          if (candidateId) {
            customStages[candidateId] = { stage: 'INTERVIEW', activationStatus: 'INVITATION_SENT' };
          }
          if (candidateEmail) {
            customStages[candidateEmail.toLowerCase().trim()] = { stage: 'INTERVIEW', activationStatus: 'INVITATION_SENT' };
          }
          customStages['cand-1'] = { stage: 'INTERVIEW', activationStatus: 'INVITATION_SENT' };
          customStages['c1'] = { stage: 'INTERVIEW', activationStatus: 'INVITATION_SENT' };
          localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
        } catch (e) {}

        setScheduledDetails({ interviewer: selectedHr, date: interviewDate, time: interviewTime });
        setInterviewStatus('SCHEDULED');
        window.dispatchEvent(new Event('rbt_interview_changed'));
        window.dispatchEvent(new Event('storage'));
        toast.success(bookingRes.message || `HR Interview scheduled with ${selectedHr} on ${interviewDate} at ${interviewTime}!`);
      } else {
        toast.error(bookingRes.error || 'Failed to schedule interview.');
      }
    } catch (err) {
      toast.error('An error occurred while booking.');
    } finally {
      setIsSubmitting(false);
    }
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

  if (interviewStatus === 'COMPLETED') {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6 text-center select-none space-y-6 animate-fade-in">
        <div className="bg-white border-4 border-emerald-300 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-emerald-100 border-2 border-emerald-300 text-emerald-700 flex items-center justify-center mx-auto shadow-md">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>

          <div className="space-y-2">
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono font-black px-3.5 py-1 rounded-full uppercase tracking-wider">
              ✓ REQUIREMENT COMPLETED
            </span>
            <h2 className="text-2xl font-black font-heading text-slate-900 tracking-tight">
              1-on-1 HR Interview Screening Completed &amp; Approved
            </h2>
            <p className="text-xs text-slate-600 font-semibold max-w-lg mx-auto leading-relaxed">
              Your onboarding video interview screen with assigned HR Specialist <span className="font-bold text-[#F97316]">{scheduledDetails?.interviewer || 'Marcus Vance'}</span> has been conducted and approved. Please complete any remaining requirements on your <strong>My Tasks</strong> page.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/rbt"
              className="inline-flex items-center justify-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-4 rounded-2xl shadow-xl transition-all cursor-pointer"
            >
              <span>Go to My Tasks to Finish Onboarding Requirements →</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-orange-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Video className="w-7 h-7 text-[#F97316]" />
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              HR Onboarding Interview
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            Book or view your official 1-on-1 video onboarding interview slot with an HR Specialist.
          </p>
        </div>

        <span className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm ${
          scheduledDetails ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-orange-100 text-[#F97316] border-orange-300'
        }`}>
          {scheduledDetails ? 'INTERVIEW SCHEDULED' : 'BOOKING PENDING'}
        </span>
      </div>

      {scheduledDetails ? (
        /* SINGLE FULL-WIDTH CENTERED STATUS CARD WHEN INTERVIEW IS SCHEDULED */
        <div className="max-w-2xl mx-auto w-full bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-orange-100 pb-4">
            <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-[#F97316]" /> Interview Confirmed &amp; Scheduled
            </h3>
            <span className="px-3 py-1 bg-orange-100 text-[#F97316] font-extrabold text-xs uppercase rounded-full border border-orange-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Confirmed Slot
            </span>
          </div>

            <div className="p-6 bg-gradient-to-br from-orange-50/90 to-blue-50/50 rounded-2xl border-2 border-[#BFDBFE] space-y-4 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#F97316] text-white flex items-center justify-center font-black text-base shadow-md">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">1-on-1 Video Onboarding Interview</h4>
                  <p className="text-xs text-slate-600 font-medium">Assigned HR Agent: <span className="font-bold text-[#F97316]">{scheduledDetails.interviewer}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-white/80 rounded-xl border border-orange-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Date</span>
                  <span className="text-xs font-black text-slate-900">{scheduledDetails.date}</span>
                </div>
                <div className="p-3 bg-white/80 rounded-xl border border-orange-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Time Slot</span>
                  <span className="text-xs font-black text-slate-900">{scheduledDetails.time}</span>
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS: JOIN GOOGLE MEET & RESCHEDULE */}
            <div className="space-y-3 pt-2">
              {isMeetUnlocked ? (
                isHrPresent ? (
                  <a
                    href={meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#1a73e8] hover:bg-blue-700 text-white font-extrabold text-xs py-4 px-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01]"
                  >
                    <Video className="w-4 h-4 text-white animate-pulse" />
                    <span>Join Video Call Now (Marcus Vance is Online) →</span>
                  </a>
                ) : (
                  <div className="p-5 bg-slate-900 border-2 border-amber-500/40 rounded-2xl text-center space-y-3 shadow-lg">
                    <div className="flex items-center justify-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      <span>Waiting Room — Recruiter Connecting</span>
                    </div>
                    <p className="text-xs text-slate-300 font-medium">
                      Welcome! Your HR Specialist (<strong className="text-white">{scheduledDetails.interviewer}</strong>) is currently setting up the video room lobby.
                    </p>
                    <div className="p-3 bg-slate-950 rounded-xl border border-white/10 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>Status: Waiting for Marcus Vance...</span>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem('ras_hr_joined_meeting', 'true');
                          window.dispatchEvent(new Event('storage'));
                          toast.success('🔓 Recruiter Marcus Vance has joined the meeting!');
                        }}
                        className="text-[#F97316] font-bold hover:underline cursor-pointer"
                      >
                        (Dev HR Join)
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-1.5">
                  <button
                    disabled
                    className="w-full bg-slate-200 text-slate-400 font-extrabold text-xs py-3.5 px-4 rounded-2xl border border-slate-300 flex items-center justify-center gap-2 cursor-not-allowed"
                  >
                    <Video className="w-4 h-4 text-slate-400" />
                    Join Video Call (Unlocks 5 Mins Before Meeting)
                  </button>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold px-2">
                    <span>🔒 Room opens 5 minutes before {scheduledDetails.time}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMeetUnlocked(true);
                        toast.success('🔓 Developer Override: Video room unlocked for testing!');
                      }}
                      className="text-[#F97316] font-bold hover:underline cursor-pointer"
                    >
                      (Dev Unlock)
                    </button>
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={() => {
                  localStorage.removeItem('ras_rbt_interview_payload');
                  localStorage.removeItem('ras_rbt_interview_done');
                  setInterviewStatus('UNBOOKED');
                  setScheduledDetails(null);
                  toast.info('Select a new HR Specialist, date, and time slot to reschedule.');
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-lg border border-purple-500 cursor-pointer transition-all hover:scale-[1.01]"
              >
                <Clock className="w-4 h-4 mr-1.5 text-purple-200" />
                Reschedule Interview Slot
              </Button>
            </div>

            <div className="p-4 bg-orange-50/70 rounded-2xl border border-orange-200 text-xs text-slate-700 font-medium text-center">
              💡 <strong>Next Step:</strong> Your HR Agent will evaluate clinical competencies during the Google Meet call. Upon approval, your <strong>Unified Communications Hub</strong> will unlock automatically!
            </div>
          </div>
        ) : (
          /* STANDARD TWO-COLUMN FORM UNTIL BOOKED */
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
                    suppressHydrationWarning
                    value={selectedHrId}
                    onChange={(e) => handleHrChange(e.target.value)}
                    className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316] cursor-pointer"
                  >
                    {hrMembers.length > 0 ? (
                      hrMembers.map((hr) => (
                        <option key={hr.id} value={hr.id}>
                          {hr.name} ({hr.role})
                        </option>
                      ))
                    ) : (
                      <option value="">Loading HR Team Members...</option>
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">Interview Date</label>
                  <input
                    suppressHydrationWarning
                    type="date"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 block">Available Time Slots for {selectedHr.split(' ')[0]}</label>
                  <select
                    suppressHydrationWarning
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    className="w-full bg-[#F0F7FF] border-2 border-[#BFDBFE] rounded-2xl p-3 text-xs text-slate-900 font-bold outline-none focus:border-[#F97316] cursor-pointer"
                  >
                    {(hrAvailableHours[selectedHr] || hrAvailableHours['Marcus Vance (HR Agent)'] || ['10:00 AM EST']).map(timeSlot => (
                      <option key={timeSlot} value={timeSlot}>{timeSlot}</option>
                    ))}
                  </select>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-lg mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Booking Interview...' : 'Confirm & Schedule Video Interview'}
                </Button>
              </form>
            </div>

            {/* STATUS CARD (UNBOOKED STATE) */}
            <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#F97316]" /> Interview Status
                </h3>

                <div className="mt-4 p-5 bg-[#F0F7FF] rounded-2xl border-2 border-[#BFDBFE] text-center space-y-2">
                  <Clock className="w-8 h-8 text-[#F97316] mx-auto" />
                  <h4 className="font-extrabold text-xs text-slate-900">No Interview Booked Yet</h4>
                  <p className="text-[11px] text-slate-600 font-medium">Select an HR specialist and date slot on the left to schedule your onboarding interview.</p>
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-2xl border border-orange-200 text-xs text-slate-700 font-medium">
                💡 <strong>Note:</strong> Completing your 1-on-1 interview unlocks the <strong>Unified Communications Center</strong> to message HR Agents, Case Coordinators, and Supervising BCBAs!
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
}
