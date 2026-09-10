'use client';

import React, { useActionState, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { login } from './actions';
import { ArrowRight } from 'lucide-react';

const initialState = {
  error: '',
};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#FFFDF9] via-white to-[#FFF4EA] text-slate-900 px-4 relative overflow-hidden">
      {/* AMBIENT SUNLIGHT GLOW ORBS */}
      <div className="absolute top-1/4 -left-32 w-[550px] h-[550px] bg-orange-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-[600px] h-[600px] bg-amber-300/30 rounded-full blur-3xl pointer-events-none animate-pulse" />

      <div className="w-full max-w-md space-y-6 relative z-10 animate-fade-in my-8">
        {/* LOGO & BRAND HEADER */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-block group">
            <div className="w-20 h-20 rounded-full bg-white border-2 border-orange-200 shadow-2xl flex items-center justify-center p-2 mx-auto group-hover:scale-105 transition-transform">
              <Image src="/logo.png" alt="Rise & Shine ABA Logo" width={80} height={80} className="h-full w-full rounded-full object-contain" priority />
            </div>
          </Link>

          <div>
            <h1 className="text-3xl font-black text-slate-900 font-heading tracking-tight">
              Rise &amp; Shine <span className="text-[#F97316]">HRM &amp; CRM</span>
            </h1>
            <p className="text-xs font-bold text-slate-600 mt-1">
              Enterprise Employee Portal &amp; RBT Clinical Management Suite
            </p>
          </div>
        </div>

        {/* LOGIN CARD */}
        <Card className="bg-white border-2 border-orange-200/90 rounded-3xl shadow-2xl overflow-hidden">
          <CardHeader className="border-b border-orange-100 bg-orange-50/50 pb-4">
            <CardTitle className="text-xl font-black text-slate-900 font-heading flex items-center justify-between">
              <span>Employee Sign In</span>
              <span className="bg-white text-[#F97316] border border-orange-200 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold">
                SECURE
              </span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-600 font-semibold">
              Enter your official credentials to enter your portal.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-5">

            <form action={formAction} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-800 block">Email Address *</label>
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@riseandshine.nyc"
                  className="bg-white border-slate-300 text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-800 block">Password *</label>
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="bg-white border-slate-300 text-slate-900 font-bold focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20 text-sm"
                  required
                />
              </div>

              {state?.error && (
                <div className="text-rose-600 text-xs font-bold bg-rose-50 p-3 rounded-xl border border-rose-200">
                  {state.error}
                </div>
              )}

              <Button
                className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs py-3.5 rounded-xl shadow-xl shadow-orange-500/30 transition-all hover:scale-[1.02] cursor-pointer flex items-center justify-center gap-2"
                size="lg"
                type="submit"
                isLoading={isPending}
              >
                <span>Sign In to Portal</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* BOTTOM HELPER FOOTER */}
        <div className="text-center space-y-2 text-xs text-slate-600 font-bold">
          <p>
            Are you an RBT Applicant?{' '}
            <Link href="/apply" className="text-[#F97316] hover:underline font-extrabold">
              Apply Online Here
            </Link>
          </p>
          <p className="text-[11px] text-slate-500 font-mono font-medium">
            Secured with staff authentication and role-based access controls
          </p>
        </div>
      </div>
    </div>
  );
}
