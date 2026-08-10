import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { BookOpen, ExternalLink, ShieldCheck, Bookmark, FileText } from 'lucide-react';

export default function RbtResourcesPage() {
  const resources = [
    { title: 'BACB Ethics Code for Behavior Technicians', desc: 'Official BACB professional compliance guidelines and boundary guidelines.', category: 'Ethics & Legal' },
    { title: 'Discrete Trial Teaching (DTT) Data Collection Guide', desc: 'Step-by-step trial recording, prompt hierarchy, and error correction protocols.', category: 'Clinical Practice' },
    { title: 'Behavior Reduction Plan (BRP) De-escalation Protocol', desc: 'Safety care techniques, antecedent strategies, and crisis management procedures.', category: 'Safety & BRP' },
    { title: 'Artemis EMR Data Entry & Trial Logging Manual', desc: 'How to accurately log trial percentages, duration timers, and ABC data.', category: 'EMR Systems' },
  ];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-black-800 p-6 rounded-xl border border-white/5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-brand-orange-500" />
            RBT Clinical Resources &amp; Protocol Library
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            BACB guidelines, DTT data collection manuals, BRP safety protocols, and EMR tutorials.
          </p>
        </div>
      </div>

      {/* Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resources.map((res, idx) => (
          <Card key={idx} className="border-white/10 bg-zinc-950 shadow-md hover:border-brand-orange-500/30 transition-all">
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-brand-orange-500/10 text-brand-orange-400">
                  {res.category}
                </span>
                <Bookmark className="w-4 h-4 text-zinc-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{res.title}</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{res.desc}</p>
              </div>

              <div className="border-t border-white/5 pt-3 flex justify-end">
                <button className="text-xs font-bold text-[#F97316] hover:text-orange-400 flex items-center gap-1 cursor-pointer">
                  <span>Open Protocol Guide</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
