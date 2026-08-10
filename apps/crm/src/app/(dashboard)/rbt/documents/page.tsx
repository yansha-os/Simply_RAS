'use client';

import React, { useState } from 'react';
import { 
  FileText, 
  ShieldCheck, 
  Download, 
  Upload, 
  CheckCircle2, 
  Award, 
  ExternalLink,
  BookOpen,
  Sparkles,
  Clock,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

export default function RbtDocumentsPage() {
  const [completedHours, setCompletedHours] = useState(0);
  const [certUploaded, setCertUploaded] = useState(false);
  const [certFileName, setCertFileName] = useState<string | null>(null);

  const documents = [
    { name: '40-Hour ABA Training Completion Form', status: certUploaded ? 'VERIFIED' : 'PENDING UPLOAD', expiry: 'Permanent', category: 'Training' },
    { name: 'BACB RBT Credential Certificate', status: 'VERIFIED', expiry: '2027-05-15', category: 'Compliance' },
    { name: 'CPR & First Aid Certification Card', status: 'VERIFIED', expiry: '2026-11-30', category: 'Safety' },
    { name: 'HIPAA & PHI Security Acknowledgement', status: 'VERIFIED', expiry: '2027-01-10', category: 'Legal' },
    { name: 'NYS Background Clearance Check', status: 'VERIFIED', expiry: '2028-03-01', category: 'Compliance' },
  ];

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCertFileName(file.name);
      setCertUploaded(true);
      setCompletedHours(40);
      toast.success(`Uploaded ${file.name}! Official 40-Hour BACB Certificate verified.`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-orange-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-[#F97316]" />
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              Compliance &amp; Credential Vault
            </h1>
          </div>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            Official BACB 40-Hour Training certificate, CPR card, HIPAA clearance, and annual compliance files.
          </p>
        </div>

        <label
          htmlFor="vault-upload"
          className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-5 py-3 rounded-2xl flex items-center gap-2 cursor-pointer shadow-lg transition-all w-max"
        >
          <Upload className="w-4 h-4" /> Upload Updated Document
          <input type="file" id="vault-upload" className="hidden" onChange={handleCertUpload} />
        </label>
      </div>

      {/* 🌟 100% FREE 40-HOUR RBT TRAINING & CERTIFICATE HUB CARD */}
      <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-orange-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 text-[#F97316] flex items-center justify-center shrink-0 shadow-md">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 font-heading">
                  Get Your 40-Hour RBT Training for 100% Free
                </h2>
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                  $0 Cost to RBT Candidates
                </span>
              </div>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                Rise &amp; Shine ABA partners with Autism Partnership Foundation (APF) to provide a 100% free BACB-approved 40-Hour RBT Course.
              </p>
            </div>
          </div>

          <a
            href="https://autismpartnershipfoundation.org/free-rbt-training/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg transition-all shrink-0"
          >
            <span>Register for Free Course on APF</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* 4-STEP GUIDANCE & PROGRESS TRACKER */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* STEP-BY-STEP GUIDE */}
          <div className="space-y-3 bg-[#F0F7FF] p-5 rounded-2xl border-2 border-[#BFDBFE]">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#F97316]" /> 4-Step Free Training Guide:
            </h3>

            <div className="space-y-2.5 text-xs text-slate-800 font-medium">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#F97316] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                <p>Register for free on the <strong>Autism Partnership Foundation (APF)</strong> portal.</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#F97316] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                <p>Watch the 40 hours of online video modules covering BACB Task List 2nd Edition.</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#F97316] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                <p>Pass the final module quizzes and download your official <strong>BACB 40-Hour Certificate PDF</strong>.</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#F97316] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">4</span>
                <p>Upload your Certificate PDF below for instant HR verification &amp; clinical service clearance!</p>
              </div>
            </div>
          </div>

          {/* IN-APP 40-HOUR PROGRESS LOG & UPLOADER */}
          <div className="space-y-4 bg-orange-50/60 p-5 rounded-2xl border-2 border-orange-200 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">Training Hours Progress:</span>
                <span className="text-xs font-extrabold text-[#F97316]">{completedHours} / 40 Hours Logged</span>
              </div>

              <input
                type="range"
                min="0"
                max="40"
                step="1"
                value={completedHours}
                onChange={(e) => {
                  const hrs = parseInt(e.target.value, 10);
                  setCompletedHours(hrs);
                  if (hrs === 40) toast.success('40 / 40 Hours Logged! Please upload your PDF Certificate below.');
                }}
                className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#F97316]"
              />

              <div className="flex justify-between text-[10px] font-bold text-slate-600">
                <span>0 Hours (Started)</span>
                <span>20 Hours (Halfway)</span>
                <span>40 Hours (Complete)</span>
              </div>
            </div>

            <div className="space-y-2 border-t border-orange-200 pt-3">
              <label className="text-xs font-black text-slate-900 block">Submit 40-Hour BACB Certificate PDF</label>
              
              <input
                type="file"
                accept=".pdf,.png,.jpg"
                onChange={handleCertUpload}
                id="40hr-cert-input"
                className="hidden"
              />

              <label
                htmlFor="40hr-cert-input"
                className={`w-full py-3 px-4 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  certUploaded
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                    : 'bg-white border-orange-300 text-[#F97316] hover:bg-orange-50'
                }`}
              >
                {certUploaded ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>✓ Certificate Uploaded ({certFileName})</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-[#F97316]" />
                    <span>Click to Upload 40-Hour Certificate PDF</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* DOCUMENT LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documents.map((doc, idx) => (
          <div key={idx} className="bg-white border-2 border-orange-200 rounded-3xl p-5 space-y-3 shadow-md">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-slate-900">{doc.name}</h3>
                <span className="text-[10px] font-mono text-slate-500 block font-bold">Category: {doc.category}</span>
              </div>
              <span className={`text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                doc.status === 'VERIFIED'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-orange-100 text-[#F97316] border-orange-300'
              }`}>
                {doc.status === 'VERIFIED' ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-[#F97316]" />}
                {doc.status}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600 font-semibold">
              <span>Expires: <strong className="text-slate-900">{doc.expiry}</strong></span>
              <button onClick={() => toast.info(`Downloading ${doc.name}...`)} className="text-[#F97316] hover:text-orange-600 font-black flex items-center gap-1 cursor-pointer">
                <Download className="w-3.5 h-3.5" /> Download PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
