'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Users,
  HeartHandshake,
  Sparkles,
  MapPin,
  Check,
  ArrowRight,
  UserCheck,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  Clock,
  ShieldCheck,
  GraduationCap,
  Award,
  Smile,
  Zap,
} from 'lucide-react';

export default function RbtPublicLanding() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Do I need RBT certification to apply?',
      a: 'No. Candidates may apply before certification. Training and study resources may be available; confirm current certification requirements with BACB and HR.',
    },
    {
      q: 'What are the typical work hours?',
      a: 'Most therapy sessions take place after school (between 2:00 PM and 7:00 PM) on weekdays and anytime on weekends. We match your schedule to nearby clients.',
    },
    {
      q: 'How much does the job pay?',
      a: 'We offer competitive hourly rates for RBTs in NYC depending on your experience, BACB certification status, and location flexibility.',
    },
    {
      q: 'Do I need a car?',
      a: 'Not necessarily. While personal vehicles are helpful, many of our RBTs utilize NYC subway and bus public transit for home-based client sessions.',
    },
    {
      q: 'How long does hiring take?',
      a: 'Most candidates go from online application to their first client session within 2 to 4 weeks depending on background check clearance.',
    },
    {
      q: 'What training do you provide?',
      a: 'Training support may include access to a 40-hour course, clinical orientation, and exam-prep resources. Confirm any supervision arrangements with HR and the assigned qualified supervisor.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFDF9] via-white to-[#FFF4EA] text-slate-900 font-sans relative overflow-x-hidden">
      {/* SUNNY BRIGHT AMBIENT LIGHT GLOW ORBS */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-orange-300/30 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-1/3 -left-32 w-[550px] h-[550px] bg-amber-300/35 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-[600px] h-[600px] bg-orange-200/25 rounded-full blur-3xl pointer-events-none animate-pulse" />

      {/* COMBINED STICKY CONTAINER FOR ANNOUNCEMENT BAR + HEADER (NO CHUNK, STAYS WITH SCROLL) */}
      <div className="sticky top-0 z-50 w-full shadow-lg shadow-orange-500/10 bg-white">
        {/* TOP ANNOUNCEMENT BAR IN VIBRANT ORANGE */}
        <div className="bg-[#F97316] text-white text-xs py-2.5 px-4 shadow-sm">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold">
              <span className="bg-white text-[#F97316] px-2.5 py-0.5 rounded-full font-extrabold font-mono uppercase text-[10px] shadow-sm flex items-center gap-1">
                <Zap className="w-3 h-3 fill-current" /> NYC HIRING
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

        {/* MAIN HEADER NAVBAR (SOLID PURE WHITE WITH SUNNY ORANGE ACCENTS) */}
        <header className="bg-white border-b border-orange-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between transition-all">
          <Link href="/" className="flex items-center gap-3.5 group">
            <div className="w-12 h-12 rounded-full bg-orange-100 border-2 border-orange-300 shadow-md shadow-orange-500/15 flex items-center justify-center p-1.5 overflow-hidden group-hover:scale-105 transition-transform shrink-0">
              <Image
                src="/logo.png"
                alt="Rise & Shine ABA Logo"
                width={48}
                height={48}
                className="h-full w-full rounded-full object-contain"
                priority
              />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-xl tracking-tight font-heading group-hover:text-[#F97316] transition-colors block leading-snug">
                Rise &amp; Shine <span className="text-[#F97316]">ABA</span>
              </span>
              <span className="block text-[11px] text-[#F97316] font-mono font-bold">RBT Recruitment Portal</span>
            </div>
          </Link>

          {/* CENTER NAVIGATION PILLS */}
          <nav className="hidden md:flex items-center gap-1.5 bg-orange-50/90 p-1.5 rounded-2xl border border-orange-200 text-xs font-extrabold text-slate-700">
            <a href="#about" className="px-4 py-2 rounded-xl hover:bg-white hover:text-[#F97316] hover:shadow-md transition-all">About</a>
            <a href="#benefits" className="px-4 py-2 rounded-xl hover:bg-white hover:text-[#F97316] hover:shadow-md transition-all">Benefits</a>
            <a href="#requirements" className="px-4 py-2 rounded-xl hover:bg-white hover:text-[#F97316] hover:shadow-md transition-all">Requirements</a>
            <a href="#process" className="px-4 py-2 rounded-xl hover:bg-white hover:text-[#F97316] hover:shadow-md transition-all">How It Works</a>
            <a href="#faq" className="px-4 py-2 rounded-xl hover:bg-white hover:text-[#F97316] hover:shadow-md transition-all">FAQ</a>
          </nav>

          {/* RIGHT ACTION CLUSTER */}
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs font-extrabold text-slate-700 hover:text-[#F97316] transition-colors hidden sm:block">
              Returning RBT? Log In
            </Link>
            <Link
              href="/apply"
              className="bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-xl shadow-orange-500/30 transition-all hover:scale-105 cursor-pointer flex items-center gap-2"
            >
              <span>Apply Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </header>
      </div>

      {/* HERO BANNER SECTION (BRIGHT SUNNY FUN LIGHT AESTHETIC) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10 animate-slide-up border-b border-orange-100">
        <div className="grid lg:grid-cols-5 gap-10 items-center">
          <div className="lg:col-span-3 space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-xs font-extrabold text-[#F97316] border border-orange-300 shadow-sm">
              <Sparkles className="w-4 h-4 text-[#F97316]" /> Now Hiring RBT Technicians across all 5 NYC Boroughs!
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 font-heading leading-tight tracking-tight">
              Make a Real Impact.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F97316] via-orange-500 to-amber-500">
                Build a Fun &amp; Rewarding Career.
              </span>
            </h1>

            <p className="text-base text-slate-700 max-w-2xl leading-relaxed font-sans font-medium">
              Join Rise &amp; Shine ABA as a Registered Behavior Technician (RBT). Work 1-on-1 with children with autism, build skills with training and case support, and confirm assignment-specific supervision arrangements with HR and your qualified supervisor.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href="/apply"
                className="bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-sm px-8 py-4 rounded-2xl shadow-xl shadow-orange-500/30 transition-all hover:scale-105 cursor-pointer flex items-center gap-2.5"
              >
                <span>Apply Online (Takes 5 Mins)</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#benefits"
                className="bg-white hover:bg-orange-50 text-slate-900 font-extrabold text-sm px-7 py-4 rounded-2xl border-2 border-orange-200 shadow-md transition-all flex items-center gap-2"
              >
                <Smile className="w-5 h-5 text-[#F97316]" />
                <span>See What We Offer</span>
              </a>
            </div>

            {/* 4 CHECK HIGHLIGHTS */}
            <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-800 pt-4">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center font-black">✓</div>
                <span>No prior experience required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center font-black">✓</div>
                <span>Free 40-hour RBT training course</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center font-black">✓</div>
                <span>Flexible afternoon &amp; weekend shifts</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center font-black">✓</div>
                <span>Bi-weekly competitive hourly pay</span>
              </div>
            </div>
          </div>

          {/* RIGHT COL: 4 METRIC STAT CARDS WITH SUNNY LIGHT BORDERS */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-6">
            <div className="bg-white border-2 border-orange-200/90 rounded-3xl p-6 shadow-xl shadow-orange-500/10 hover:-translate-y-2 hover:shadow-2xl hover:border-[#F97316] transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[#F97316] flex items-center justify-center border border-orange-300">
                <Users className="w-6 h-6" />
              </div>
              <p className="text-3xl font-black text-slate-900 mt-4 font-heading">NYC</p>
              <p className="text-xs text-slate-600 font-mono font-bold mt-0.5">Local Service Team</p>
            </div>

            <div className="bg-white border-2 border-emerald-200/90 rounded-3xl p-6 shadow-xl shadow-emerald-500/10 hover:-translate-y-2 hover:shadow-2xl hover:border-emerald-500 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-300">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <p className="text-3xl font-black text-slate-900 mt-4 font-heading">Flexible</p>
              <p className="text-xs text-slate-600 font-mono font-bold mt-0.5">Scheduling Options</p>
            </div>

            <div className="bg-white border-2 border-amber-200/90 rounded-3xl p-6 shadow-xl shadow-amber-500/10 hover:-translate-y-2 hover:shadow-2xl hover:border-amber-500 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-300">
                <Award className="w-6 h-6" />
              </div>
              <p className="text-3xl font-black text-slate-900 mt-4 font-heading">Support</p>
              <p className="text-xs text-slate-600 font-mono font-bold mt-0.5">Training &amp; Case Resources</p>
            </div>

            <div className="bg-white border-2 border-cyan-200/90 rounded-3xl p-6 shadow-xl shadow-cyan-500/10 hover:-translate-y-2 hover:shadow-2xl hover:border-cyan-500 transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-300">
                <MapPin className="w-6 h-6" />
              </div>
              <p className="text-xl font-black text-slate-900 mt-4 font-heading leading-tight">All 5 NYC Boroughs</p>
              <p className="text-xs text-slate-600 font-mono font-bold mt-0.5">Service Area</p>
            </div>
          </div>
        </div>
      </section>

      {/* CONTINUOUS NEWS SLIDESHOW MARQUEE TICKER BANNER */}
      <section className="bg-[#F97316] py-4 overflow-hidden shadow-lg shadow-orange-500/20 w-full relative z-10">
        <div className="animate-marquee flex whitespace-nowrap text-white font-mono font-black text-xs sm:text-sm tracking-wider uppercase">
          <span className="px-6">Flexible Hours • NYC Service Area • Competitive Pay • Free 40-hr Training • Supervision Plan Guidance • Career Growth • Make a Difference •</span>
          <span className="px-6">Flexible Hours • NYC Service Area • Competitive Pay • Free 40-hr Training • Supervision Plan Guidance • Career Growth • Make a Difference •</span>
          <span className="px-6">Flexible Hours • NYC Service Area • Competitive Pay • Free 40-hr Training • Supervision Plan Guidance • Career Growth • Make a Difference •</span>
          <span className="px-6">Flexible Hours • NYC Service Area • Competitive Pay • Free 40-hr Training • Supervision Plan Guidance • Career Growth • Make a Difference •</span>
        </div>
      </section>

      {/* SECTION 1: WHAT YOU'ALL ACTUALLY DO (PY-16 BRIGHT LIGHT CARDS) */}
      <section id="about" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10 relative z-10 animate-slide-up border-b border-orange-100">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-mono font-black text-[#F97316] uppercase tracking-wider">01 • Clinical Role</span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 font-heading">What You&apos;ll Actually Do</h2>
          <p className="text-sm text-slate-700 font-medium">
            As an RBT at Rise &amp; Shine, you&apos;ll help children build communication, social, and daily living skills through structured 1-on-1 therapy sessions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border-2 border-orange-200/90 rounded-3xl p-7 space-y-4 shadow-xl hover:-translate-y-2 hover:shadow-2xl hover:border-[#F97316] transition-all duration-300">
            <div className="p-4 rounded-2xl bg-orange-100 text-[#F97316] border border-orange-300 w-max">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Work One-on-One</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Direct therapy sessions with children in home settings, building meaningful relationships and tracking behavioral progress.
            </p>
          </div>

          <div className="bg-white border-2 border-emerald-200/90 rounded-3xl p-7 space-y-4 shadow-xl hover:-translate-y-2 hover:shadow-2xl hover:border-emerald-500 transition-all duration-300">
            <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-300 w-max">
              <HeartHandshake className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Support Families</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Be the consistent clinical presence families rely on, coaching parents on behavior management strategies.
            </p>
          </div>

          <div className="bg-white border-2 border-cyan-200/90 rounded-3xl p-7 space-y-4 shadow-xl hover:-translate-y-2 hover:shadow-2xl hover:border-cyan-500 transition-all duration-300">
            <div className="p-4 rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-300 w-max">
              <UserCheck className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 font-heading">Grow Your Skills</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Build skills through training and case support. Ask HR how assignment-specific supervision would be coordinated with an assigned qualified supervisor.
            </p>
          </div>
        </div>

        {/* CANDIDATE TESTIMONIAL */}
        <div className="bg-white border-2 border-orange-300 rounded-3xl p-6 text-slate-800 text-sm italic shadow-lg border-l-8 border-l-[#F97316]">
          &ldquo;Rise &amp; Shine actually trained me and supported me through the whole process. I went from having no ABA experience to running sessions within weeks.&rdquo;
          <footer className="mt-2 not-italic font-extrabold text-[#F97316] font-mono">— Maria R., Registered Behavior Technician since 2024</footer>
        </div>
      </section>

      {/* SECTION 2: 6 BENEFITS CARDS (PY-16 SUNNY LIGHT SPACING) */}
      <section id="benefits" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10 relative z-10 animate-slide-up border-b border-orange-100">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-mono font-black text-[#F97316] uppercase tracking-wider">02 • Why Join Us</span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 font-heading">Why RBTs Choose Rise &amp; Shine</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Competitive Pay',
              desc: 'Fair bi-weekly compensation reflecting your clinical dedication and RBT credentials.',
              icon: Award,
              color: 'text-[#F97316]',
              bg: 'bg-orange-100 border-orange-300',
              hoverBorder: 'hover:border-[#F97316]',
            },
            {
              title: 'Flexible Hours',
              desc: 'Sessions after 2PM and weekends — built flexibly around your life and availability.',
              icon: CalendarDays,
              color: 'text-emerald-600',
              bg: 'bg-emerald-50 border-emerald-300',
              hoverBorder: 'hover:border-emerald-500',
            },
            {
              title: 'Free Training Support',
              desc: 'We guide you step-by-step through the 40-hour course and BACB certification exam.',
              icon: GraduationCap,
              color: 'text-cyan-600',
              bg: 'bg-cyan-50 border-cyan-300',
              hoverBorder: 'hover:border-cyan-500',
            },
            {
              title: 'Supervision Plan Guidance',
              desc: 'Supervision requirements depend on current certification standards, the assigned qualified supervisor, agency policy, payer contract, and jurisdiction. Certification, agency, payer, and jurisdictional requirements remain separate. Confirm your current supervision plan with HR and your qualified supervisor. This site does not calculate or verify supervision compliance.',
              icon: ShieldCheck,
              color: 'text-purple-600',
              bg: 'bg-purple-50 border-purple-300',
              hoverBorder: 'hover:border-purple-500',
            },
            {
              title: 'Local to You',
              desc: 'Client sessions matched to your NYC neighborhood and public transit preference.',
              icon: MapPin,
              color: 'text-amber-600',
              bg: 'bg-amber-50 border-amber-300',
              hoverBorder: 'hover:border-amber-500',
            },
            {
              title: 'Career Pathway',
              desc: 'Explore training and role-development options with HR; availability and eligibility are confirmed individually.',
              icon: ArrowRight,
              color: 'text-rose-600',
              bg: 'bg-rose-50 border-rose-300',
              hoverBorder: 'hover:border-rose-500',
            },
          ].map((b, i) => {
            const IconComp = b.icon;
            return (
              <div
                key={i}
                className={`bg-white border-2 border-orange-100 rounded-3xl p-6 space-y-3 shadow-lg hover:-translate-y-2.5 hover:shadow-2xl transition-all duration-300 ${b.hoverBorder}`}
              >
                <div className={`p-4 rounded-2xl ${b.bg} ${b.color} w-max border`}>
                  <IconComp className="w-6 h-6" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 font-heading">{b.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 3: REQUIREMENTS (PY-16 SUNNY LIGHT SPACING) */}
      <section id="requirements" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10 animate-slide-up border-b border-orange-100">
        <div className="bg-white border-2 border-orange-200 rounded-3xl p-8 sm:p-10 space-y-6 shadow-xl">
          <div className="space-y-2">
            <span className="text-xs font-mono font-black text-[#F97316] uppercase tracking-wider">03 • Candidate Eligibility</span>
            <h2 className="text-3xl font-black text-slate-900 font-heading">What We&apos;re Looking For</h2>
            <p className="text-sm text-slate-700 font-medium">You don&apos;t need years of prior experience — you need heart and dedication.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-800">
            {[
              '18 years of age or older',
              'High school diploma or equivalent',
              'Able to pass a criminal background screening & fingerprinting',
              'Available afternoons (2PM-7PM) and/or weekends',
              'Genuine passion for working with children with autism',
              'Reliable transit to client home locations in NYC',
              'Willing to complete the 40-hour RBT training course (we guide you!)',
              'Certification documents, if submitted, are reviewed by staff before assignment decisions.',
            ].map((req, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-orange-50/70 border border-orange-200 font-bold">
                <Check className="w-5 h-5 text-[#F97316] shrink-0 stroke-[3]" />
                <span>{req}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: 4-STEP TIMELINE (PY-16 SUNNY LIGHT SPACING) */}
      <section id="process" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10 relative z-10 animate-slide-up border-b border-orange-100">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-mono font-black text-cyan-600 uppercase tracking-wider">04 • Hiring Timeline</span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 font-heading">From Application to First Session</h2>
          <p className="text-sm text-slate-700 font-medium">Most candidates go from applying to working within 2-4 weeks.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { step: '1', title: 'Apply (5 Mins)', desc: 'Fill out our online application form. No resume required.' },
            { step: '2', title: 'Phone Screen', desc: 'A quick 15-minute phone call to learn about you and answer questions.' },
            { step: '3', title: 'Interview', desc: 'A relaxed video interview with our HR recruitment team.' },
            { step: '4', title: 'Onboard & Start', desc: 'Complete onboarding documents and get matched to your first client.' },
          ].map((t) => (
            <div key={t.step} className="bg-white border-2 border-orange-100 rounded-3xl p-6 space-y-3 shadow-lg hover:-translate-y-2 hover:border-[#F97316] transition-all duration-300">
              <div className="w-12 h-12 rounded-2xl bg-[#F97316] text-white font-black flex items-center justify-center text-base shadow-md font-mono">
                {t.step}
              </div>
              <h3 className="text-base font-extrabold text-slate-900 font-heading">{t.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 5: FAQ ACCORDION (PY-16 SUNNY LIGHT SPACING) */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-8 relative z-10 animate-slide-up border-b border-orange-100">
        <div className="text-center space-y-2">
          <span className="text-xs font-mono font-black text-purple-600 uppercase tracking-wider">05 • Common Questions</span>
          <h2 className="text-3xl font-black text-slate-900 font-heading">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, i) => {
            const isOpen = openFaqIndex === i;
            return (
              <div
                key={i}
                className="bg-white border-2 border-orange-100 rounded-2xl overflow-hidden shadow-md transition-all"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                  className="w-full px-6 py-4.5 flex items-center justify-between text-left cursor-pointer hover:bg-orange-50/60 transition-colors"
                >
                  <span className="text-sm font-extrabold text-slate-900 font-sans">{faq.q}</span>
                  {isOpen ? <ChevronUp className="w-5 h-5 text-[#F97316]" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>

                {isOpen && (
                  <p className="px-6 pb-5 text-xs text-slate-700 leading-relaxed border-t border-orange-100 pt-3.5 font-medium">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA BANNER (PY-16 SUNNY LIGHT SPACING) */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
        <div className="bg-gradient-to-r from-[#F97316] via-orange-600 to-amber-500 rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-2xl shadow-orange-500/30">
          <h2 className="text-3xl sm:text-4xl font-black text-white font-heading">Ready to Start Your RBT Career?</h2>
          <p className="text-sm text-white/95 max-w-lg mx-auto font-medium">
            Applications take under 5 minutes. No resume required. Start making a difference today!
          </p>
          <Link
            href="/apply"
            className="inline-flex items-center gap-2 bg-white text-[#F97316] font-extrabold text-sm px-9 py-4.5 rounded-2xl shadow-xl hover:bg-orange-50 transition-all cursor-pointer hover:scale-105"
          >
            <span>Apply Now</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ULTRA-PROFESSIONAL VIBRANT ORANGE FOOTER */}
      <footer className="bg-gradient-to-br from-[#F97316] via-orange-600 to-amber-600 text-white text-xs mt-12 relative z-10 w-full shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
          {/* TOP SECTION: BRAND LOGO + CONTACT BADGES */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-10 border-b border-white/20">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white border-2 border-orange-200 shadow-xl flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                <Image
                  src="/logo.png"
                  alt="Rise & Shine ABA Logo"
                  width={56}
                  height={56}
                  className="h-full w-full rounded-full object-contain"
                />
              </div>
              <div>
                <span className="font-black text-white text-xl tracking-tight font-heading block">
                  Rise &amp; Shine ABA
                </span>
                <span className="text-xs text-orange-100 font-sans font-medium">NYC Registered Behavior Technician Recruitment &amp; Clinical Suite</span>
              </div>
            </div>

            {/* QUICK CONTACT BADGES */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="tel:9293526469"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/20 transition-all font-bold"
              >
                <Phone className="w-4 h-4 text-amber-200" />
                <span>(929) 352-6469</span>
              </a>
              <a
                href="mailto:info@riseandshine.nyc"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/20 transition-all font-bold"
              >
                <Mail className="w-4 h-4 text-amber-200" />
                <span>info@riseandshine.nyc</span>
              </a>
              <Link
                href="/apply"
                className="flex items-center gap-2 bg-white text-[#F97316] hover:bg-orange-50 px-5 py-2.5 rounded-xl font-extrabold shadow-lg transition-all cursor-pointer"
              >
                <span>Apply Online</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* 4 LINK COLUMNS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-orange-50">
            <div className="space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">RBT Opportunities</h4>
              <ul className="space-y-2 text-orange-100 font-medium">
                <li><a href="#benefits" className="hover:text-white transition-colors">Free 40-Hour RBT Training</a></li>
                <li><a href="#benefits" className="hover:text-white transition-colors">Competitive Hourly Pay Rates</a></li>
                <li><a href="#benefits" className="hover:text-white transition-colors">Supervision Plan Guidance</a></li>
                <li><a href="#benefits" className="hover:text-white transition-colors">Flexible After-School &amp; Weekends</a></li>
                <li><Link href="/apply" className="hover:text-white transition-colors">Application &amp; Certification Details</Link></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">NYC Service Regions</h4>
              <ul className="space-y-2 text-orange-100 font-medium">
                <li><span className="hover:text-white transition-colors">Brooklyn (Kings County)</span></li>
                <li><span className="hover:text-white transition-colors">Queens Borough</span></li>
                <li><span className="hover:text-white transition-colors">Manhattan (New York County)</span></li>
                <li><span className="hover:text-white transition-colors">The Bronx &amp; Staten Island</span></li>
                <li><span className="hover:text-white transition-colors">Nassau County &amp; Long Island</span></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">Candidate Resources</h4>
              <ul className="space-y-2 text-orange-100 font-medium">
                <li><a href="#requirements" className="hover:text-white transition-colors">Application Requirements</a></li>
                <li><a href="#process" className="hover:text-white transition-colors">4-Step Hiring Timeline</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">Candidate FAQ Accordion</a></li>
                <li><a href="https://www.bacb.com/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">BACB Certification Resources</a></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Returning RBT Employee Login</Link></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">HR Office &amp; Support</h4>
              <div className="space-y-2 text-orange-100 font-medium text-xs">
                <p className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-amber-200 shrink-0 mt-0.5" />
                  <span>Serving families &amp; clinicians across all 5 boroughs of New York City.</span>
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-200 shrink-0" />
                  <span>Mon – Sun: 9:00 AM – 7:00 PM EST</span>
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-200 shrink-0" />
                  <span>Current Standards Vary by Assignment</span>
                </p>
              </div>
            </div>
          </div>

          {/* EEO NOTICE BANNER */}
          <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-[11px] text-orange-100 leading-relaxed font-sans">
            <strong className="text-white">Equal Opportunity Employer (EEO):</strong> Rise &amp; Shine ABA LLC provides equal employment opportunities to all applicants for employment without regard to race, color, religion, sex, national origin, age, disability, genetics, or protected veteran status.
          </div>

          {/* BOTTOM COPYRIGHT & LEGAL LINKS */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/20 text-[11px] text-orange-200 font-medium">
            <p>© 2026 Rise &amp; Shine ABA LLC. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">HIPAA Compliance</a>
              <a href="#" className="hover:text-white transition-colors">Certification Standards</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
