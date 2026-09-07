import React from 'react';
import Image from 'next/image';
import RbtApplicationForm from '@/components/public-rbt/RbtApplicationForm';
import { Lightbulb, Phone, Mail, Clock } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Apply Now | RBT Job Application | Rise & Shine ABA',
  description: 'Apply to become a Registered Behavior Technician (RBT) with Rise & Shine ABA in New York City.',
};

export default function ApplyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/70 via-white to-amber-50/50 text-slate-900 font-sans relative flex flex-col justify-between overflow-x-hidden">
      {/* FLOATING AMBIENT ORBS */}
      <div className="absolute -top-32 -right-32 w-[450px] h-[450px] bg-orange-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-32 w-[400px] h-[400px] bg-amber-300/20 rounded-full blur-3xl pointer-events-none" />

      {/* COMBINED STICKY CONTAINER FOR ANNOUNCEMENT BAR + HEADER (NO CHUNK, STAYS WITH SCROLL) */}
      <div className="sticky top-0 z-50 w-full shadow-lg shadow-orange-500/10 bg-white">
        {/* TOP ANNOUNCEMENT BAR IN VIBRANT ORANGE */}
        <div className="bg-[#F97316] text-white text-xs py-2 px-4 shadow-sm">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <span className="bg-white/20 text-white border border-white/30 px-2 py-0.5 rounded-full font-bold font-mono uppercase text-[10px]">
                NYC HIRING
              </span>
              <span className="hidden sm:inline">Now Hiring RBT Candidates &amp; Certified Technicians across all 5 NYC Boroughs!</span>
            </div>

            <div className="hidden md:flex items-center gap-4 text-[11px] font-bold">
              <a href="tel:9293526469" className="hover:text-amber-100 flex items-center gap-1.5 transition-colors">
                <Phone className="w-3.5 h-3.5" />
                <span>(929) 352-6469</span>
              </a>
              <span>•</span>
              <a href="mailto:info@riseandshine.nyc" className="hover:text-amber-100 flex items-center gap-1.5 transition-colors">
                <Mail className="w-3.5 h-3.5" />
                <span>info@riseandshine.nyc</span>
              </a>
            </div>
          </div>
        </div>

        {/* MAIN HEADER NAVBAR (SOLID WHITE WITH CRISP BORDER, NO CHUNK) */}
        <header className="bg-white border-b border-orange-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between transition-all">
          <Link href="/" className="flex items-center gap-3.5 group">
            <div className="w-11 h-11 rounded-full bg-orange-50 border border-orange-200 shadow-md shadow-orange-500/10 flex items-center justify-center p-1.5 overflow-hidden group-hover:scale-105 transition-transform shrink-0">
              <Image src="/logo.png" alt="Rise & Shine ABA Logo" width={44} height={44} className="h-full w-full rounded-full object-contain" priority />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-base tracking-tight font-heading group-hover:text-[#F97316] transition-colors block leading-snug">
                Rise &amp; Shine <span className="text-[#F97316]">ABA</span>
              </span>
              <span className="block text-[10px] text-slate-500 font-mono font-semibold">RBT Job Application Portal</span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs font-bold text-slate-700 hover:text-[#F97316] transition-colors hidden sm:block">
              Returning RBT? Log In
            </Link>
            <Link
              href="/"
              className="bg-white hover:bg-orange-50 text-slate-800 font-bold text-xs px-4 py-2 rounded-xl border border-orange-200 shadow-sm transition-all"
            >
              Back to Home
            </Link>
          </div>
        </header>
      </div>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full relative z-10 animate-slide-up">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* LEFT 2 COLS: 6-STEP FORM */}
          <div className="lg:col-span-2">
            <RbtApplicationForm />
          </div>

          {/* RIGHT COL: TIPS BEFORE YOU APPLY SIDEBAR CARD (EXACT SCREENSHOT MATCH) */}
          <div className="space-y-6 my-4">
            <div className="bg-[#FFF8F5] border border-[#FFE8DD] rounded-3xl p-6 shadow-md space-y-4">
              <div className="flex items-center gap-2.5 text-[#F97316]">
                <Lightbulb className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-base font-bold text-slate-900 font-heading">Tips Before You Apply</h3>
              </div>
              <p className="text-xs text-slate-500 font-medium">Helpful information to prepare your application</p>

              <ul className="space-y-3.5 text-xs text-slate-700 font-medium pt-1">
                <li className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                    ✓
                  </div>
                  <span>Have your resume ready (PDF, DOC, or DOCX format)</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                    ✓
                  </div>
                  <span>Most sessions occur after 2PM on weekdays and on weekends</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                    ✓
                  </div>
                  <span>Weekend availability is highly valued</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                    ✓
                  </div>
                  <span>If you don&apos;t have RBT certification, we can help you obtain it</span>
                </li>
              </ul>
            </div>

            {/* CONTACT ASSISTANCE CARD */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-3">
              <h4 className="text-xs font-mono font-bold text-[#F97316] uppercase tracking-wider">Need Assistance?</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Have questions about the application or RBT training process? Speak with an HR specialist.
              </p>
              <div className="space-y-2 pt-1 text-xs text-slate-800 font-bold">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#F97316]" />
                  <span>(929) 352-6469</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#F97316]" />
                  <span>info@riseandshine.nyc</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#F97316]" />
                  <span>Mon–Sun: 9:00 AM – 7:00 PM</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* VIBRANT ORANGE PROFESSIONAL FOOTER */}
      <footer className="bg-gradient-to-br from-[#F97316] via-orange-600 to-amber-600 text-white text-xs mt-16 relative z-10 w-full shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/20 pb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white border border-orange-200 shadow-md p-1 overflow-hidden shrink-0">
                <Image src="/logo.png" alt="Rise & Shine ABA Logo" width={40} height={40} className="h-full w-full rounded-full object-contain" />
              </div>
              <span className="font-extrabold text-white text-base tracking-tight font-heading">
                Rise &amp; Shine ABA
              </span>
            </div>
            <p className="text-[11px] text-orange-100 font-medium">
              Need Help? Call <a href="tel:9293526469" className="text-white font-bold hover:underline">(929) 352-6469</a> or Email <a href="mailto:info@riseandshine.nyc" className="text-white font-bold hover:underline">info@riseandshine.nyc</a>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-orange-200 font-medium">
            <p>© 2026 Rise &amp; Shine ABA LLC. All rights reserved. • NYC Registered Behavior Technician Portal</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Service</a>
              <a href="#" className="hover:text-white">EEO Statement</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
