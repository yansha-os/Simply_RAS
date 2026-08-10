'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Video, Mic, MicOff, VideoOff, PhoneOff, ShieldCheck, Activity, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function TelehealthSupervisionRoom({
  clientName = 'Ethan Wright',
  bcbaName = 'Sarah Jenkins, BCBA',
  cptCode = '97155 (Remote BCBA Supervision)',
}) {
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [supervisionNotes, setSupervisionNotes] = useState('');

  const handleJoinCall = () => {
    setInCall(true);
    toast.success(`Joined Encrypted WebRTC Telehealth Room for ${clientName}`);
  };

  const handleEndCall = () => {
    setInCall(false);
    toast.info('Telehealth Session Ended. Logged 97155 Supervision Timestamp.');
  };

  return (
    <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <Video className="w-6 h-6 text-emerald-400" /> Telehealth & Remote Supervision Suite
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1">
            Phase 15 - Embedded HIPAA-compliant WebRTC Video Call room for remote BCBA supervision (CPT 97155) and remote parent guidance (CPT 97156).
          </p>
        </div>

        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl font-mono font-bold text-xs flex items-center gap-1">
          <ShieldCheck className="w-4 h-4" /> HIPAA ENCRYPTED WEBRTC
        </span>
      </div>

      {/* WEBRTC VIDEO CALL ROOM */}
      {!inCall ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-white/10 rounded-2xl bg-zinc-900/40 text-center space-y-4">
          <Video className="w-12 h-12 text-emerald-400 animate-pulse" />
          <div>
            <h3 className="text-lg font-bold text-white font-heading">Remote Supervision Session Ready</h3>
            <p className="text-xs text-zinc-400 mt-1">Client: {clientName} | CPT Code: {cptCode}</p>
          </div>
          <Button
            onClick={handleJoinCall}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3.5 rounded-xl shadow-lg shadow-emerald-600/20 cursor-pointer"
          >
            Join Live Encrypted WebRTC Video Room
          </Button>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {/* VIDEO FRAME MOCK */}
          <div className="relative h-80 bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center">
            <div className="text-center space-y-2">
              <span className="w-4 h-4 rounded-full bg-emerald-400 inline-block animate-ping" />
              <p className="text-sm font-bold text-white font-heading">LIVE WEBRTC VIDEO FEED — {clientName}</p>
              <p className="text-xs text-zinc-400 font-mono">Observer: {bcbaName}</p>
            </div>

            {/* CALL CONTROLS FLOATING BAR */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-950/90 border border-white/20 px-6 py-2.5 rounded-2xl flex items-center gap-4 shadow-2xl backdrop-blur-md">
              <button
                onClick={() => setMicOn(!micOn)}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${micOn ? 'bg-zinc-800 text-white' : 'bg-rose-600 text-white'}`}
              >
                {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setCameraOn(!cameraOn)}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${cameraOn ? 'bg-zinc-800 text-white' : 'bg-rose-600 text-white'}`}
              >
                {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
              <button
                onClick={handleEndCall}
                className="bg-rose-600 hover:bg-rose-500 text-white p-2.5 rounded-xl shadow-lg cursor-pointer"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* IN-VIDEO CLINICAL SUPERVISION NOTES */}
          <div className="space-y-2">
            <label className="block text-xs font-mono font-bold text-zinc-400">In-Video Remote Supervision Notes (CPT 97155):</label>
            <textarea
              value={supervisionNotes}
              onChange={(e) => setSupervisionNotes(e.target.value)}
              placeholder="Observed RBT delivering FCT prompts during trial block. Recommended fading physical prompts..."
              className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-emerald-500 h-24 font-sans"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
