'use client';

import React from 'react';
import { BookOpen, ExternalLink, Bookmark, Award } from 'lucide-react';
import { toast } from 'sonner';

export default function RbtResourcesPage() {
  const resources = [
    { title: 'Free 40-Hour RBT Course (Autism Partnership Foundation)', desc: '100% free BACB-approved online 40-hour training course for RBT candidates.', category: 'Free 40-Hr Training', link: 'https://autismpartnershipfoundation.org/free-rbt-training/' },
    { title: 'BACB 2nd Edition RBT Task List & Exam Outline', desc: 'Official BACB task list outline covering measurement, assessment, and ethics.', category: 'Exam Prep', link: 'https://www.bacb.com/rbt/' },
    { title: 'BACB Ethics Code for Behavior Technicians', desc: 'Official BACB professional compliance guidelines and dual-relationship boundaries.', category: 'Ethics & Legal', link: '#' },
    { title: 'Discrete Trial Teaching (DTT) Data Collection Guide', desc: 'Step-by-step trial recording, prompt hierarchy (+/+P/-), and error correction protocols.', category: 'Clinical Practice', link: '#' },
    { title: 'Behavior Reduction Plan (BRP) De-escalation Protocol', desc: 'Safety care techniques, antecedent strategies, and crisis management procedures.', category: 'Safety & BRP', link: '#' },
    { title: 'Session Trial Logging & EMR Manual', desc: 'How to accurately log trial percentages, duration timers, and ABC data.', category: 'EMR Systems', link: '#' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-orange-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-7 h-7 text-[#F97316]" />
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              Clinical Resources &amp; Protocol Library
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            Free 40-Hour RBT Training, BACB task list guidelines, DTT data collection manuals, and BRP protocols.
          </p>
        </div>
      </div>

      {/* 🌟 FREE 40-HOUR RBT TRAINING FEATURED BANNER */}
      <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center shrink-0 shadow-md">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 font-heading">
              100% Free 40-Hour BACB RBT Training Portal
            </h2>
            <p className="text-xs text-slate-600 font-semibold mt-1 max-w-xl">
              Complete your required 40-hour training online at $0 cost via Autism Partnership Foundation (APF). Once completed, upload your certificate PDF to get cleared for active client service.
            </p>
          </div>
        </div>

        <a
          href="https://autismpartnershipfoundation.org/free-rbt-training/"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg transition-all shrink-0 cursor-pointer"
        >
          <span>Access Free APF Course</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Resource Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resources.map((res, idx) => (
          <div key={idx} className="bg-white border-2 border-orange-200 rounded-3xl p-6 space-y-4 shadow-md hover:border-[#F97316] transition-all flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-mono font-extrabold px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                  {res.category}
                </span>
                <Bookmark className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 font-heading">{res.title}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">{res.desc}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end">
              <a
                href={res.link}
                target={res.link.startsWith('http') ? '_blank' : '_self'}
                rel="noopener noreferrer"
                onClick={() => {
                  if (res.link === '#') toast.info(`Opening ${res.title}...`);
                }}
                className="text-xs font-black text-[#F97316] hover:text-orange-600 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Open Protocol Resource</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
