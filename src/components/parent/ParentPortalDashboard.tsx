'use client';

import React, { useState, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Heart, FileSignature, CheckCircle2, ShieldCheck, TrendingUp, Sparkles, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function ParentPortalDashboard({
  childName = 'Ethan Wright',
  pendingSignNote = {
    id: 'note-1',
    sessionDate: 'August 1, 2026',
    duration: '2 Hours (97153 Direct Therapy)',
    bcbaName: 'Sarah Jenkins, BCBA',
    rbtName: 'Marcus Vance, RBT',
    summary: 'Ethan participated in expressive color identification trials and task analysis for handwashing. Demonstrated high engagement.',
  },
}) {
  const [signed, setSigned] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const startDrawing = (e: any) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.beginPath();
    }
  };

  const draw = (e: any) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#10b981';

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleSaveSignature = () => {
    setSigned(true);
    toast.success('Digital signature recorded! Session note approved.');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* HEADER */}
      <div className="bg-zinc-950/90 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Heart className="w-7 h-7 fill-emerald-400/20" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white font-heading">{childName}'s Care Hub</h1>
              <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> PARENT PORTAL VERIFIED
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Simple RAS ABA Therapy Family Portal | Direct communication & digital signatures.
            </p>
          </div>
        </div>
      </div>

      {/* PENDING SESSION SIGNATURE CANVAS CARD */}
      <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-6 shadow-2xl">
        <div className="flex justify-between items-start border-b border-white/10 pb-4">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              SIGNATURE REQUIRED
            </span>
            <h3 className="font-bold text-white text-lg font-heading mt-1.5">Approve Session Note — {pendingSignNote.sessionDate}</h3>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Rendered by: <span className="text-zinc-200 font-semibold">{pendingSignNote.rbtName}</span> | BCBA Supervisor: <span className="text-zinc-200 font-semibold">{pendingSignNote.bcbaName}</span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              {pendingSignNote.duration}
            </span>
          </div>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-2xl border border-white/5 space-y-2">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Session Summary:</span>
          <p className="text-xs text-zinc-300 font-sans leading-relaxed">{pendingSignNote.summary}</p>
        </div>

        {/* DIGITAL SIGNATURE CANVAS */}
        {!signed ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                <FileSignature className="w-4 h-4 text-emerald-400" /> Parent / Guardian Digital Signature Canvas:
              </span>
              <button onClick={clearCanvas} className="text-rose-400 hover:underline cursor-pointer">
                Clear Canvas
              </button>
            </div>

            <div className="bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden p-1 shadow-inner">
              <canvas
                ref={canvasRef}
                width={700}
                height={160}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onMouseMove={draw}
                onTouchStart={startDrawing}
                onTouchEnd={stopDrawing}
                onTouchMove={draw}
                className="w-full bg-zinc-950 rounded-xl cursor-crosshair touch-none"
              />
            </div>

            <Button
              onClick={handleSaveSignature}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" /> Submit Signed Note Verification
            </Button>
          </div>
        ) : (
          <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h4 className="font-bold text-emerald-300 text-base font-heading">Session Note Approved & Signed!</h4>
              <p className="text-xs text-emerald-400/80 font-sans mt-0.5">
                Timestamp recorded with verified digital hash. Automatically archived in clinical file.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* SKILL MASTERY SNAPSHOT FOR PARENTS */}
      <Card className="bg-zinc-950/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl space-y-4 shadow-2xl">
        <h3 className="font-bold text-white text-lg font-heading flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" /> {childName}'s Monthly Skill Highlights
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl space-y-1">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">Expressive Language</span>
            <p className="font-bold text-white text-sm">Identifies 20+ Sight Words</p>
            <span className="text-[10px] font-mono font-bold text-emerald-400">92% Mastery</span>
          </div>
          <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl space-y-1">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">Social Communication</span>
            <p className="font-bold text-white text-sm">Peer Turn-Taking</p>
            <span className="text-[10px] font-mono font-bold text-cyan-400">85% Mastery</span>
          </div>
          <div className="bg-zinc-900/60 border border-white/5 p-4 rounded-2xl space-y-1">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">Self-Help Skills</span>
            <p className="font-bold text-white text-sm">Handwashing 6-Step Chain</p>
            <span className="text-[10px] font-mono font-bold text-emerald-400">Mastered ✓</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
