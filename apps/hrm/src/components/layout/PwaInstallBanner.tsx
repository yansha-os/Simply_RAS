'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Share, PlusSquare, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useHrmRole } from '@/lib/useHrmRole';
import { toast } from 'sonner';

export default function PwaInstallBanner() {
  const { role } = useHrmRole();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  
  // Close confirmation state
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    // Check if never show again was previously selected
    const neverShow = localStorage.getItem('ras_rbt_pwa_never_show') === 'true';
    if (neverShow) {
      setDismissed(true);
    }

    // Check if running in standalone mode (already installed)
    const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneApp);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIphoneOrIpad = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIphoneOrIpad);

    // Capture Android / Chrome beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // Only show banner for RBT or APPLICANT roles, and if not already installed or dismissed
  if (isStandalone || dismissed || (role !== 'RBT' && role !== 'APPLICANT')) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success('🎉 Rise & Shine RBT Portal App installed to your Home Screen!');
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosModal(true);
    } else {
      setShowIosModal(true);
    }
  };

  const handleConfirmDismiss = () => {
    if (dontShowAgain) {
      localStorage.setItem('ras_rbt_pwa_never_show', 'true');
      toast.info('PWA install prompt hidden permanently.');
    }
    setDismissed(true);
    setShowDismissConfirm(false);
  };

  return (
    <>
      {/* Sleek Floating Install Banner */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-brand-orange-500/30 px-4 py-2.5 text-white shadow-xl relative z-30 flex items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-orange-500/20 border border-brand-orange-500/40 flex items-center justify-center text-brand-orange-400 font-bold shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white font-heading flex items-center gap-2">
              <span>Install Rise &amp; Shine RBT App</span>
              <span className="text-[9px] bg-brand-orange-500/20 text-brand-orange-400 border border-brand-orange-500/30 px-2 py-0.5 rounded-full font-mono">1-Click Home Screen</span>
            </h4>
            <p className="text-[11px] text-zinc-400 font-mono hidden sm:block">
              Add app to your home screen for full-screen data collection &amp; instant auto-login.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstallClick}
            className="bg-brand-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-lg shadow-brand-orange-500/25 flex items-center gap-1.5 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install App</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDismissConfirm(true)}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Dismiss app install banner"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* DISMISS CONFIRMATION MODAL WITH "DON'T SHOW AGAIN" CHECKBOX */}
      {showDismissConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-950 border-2 border-brand-orange-500/50 rounded-3xl p-6 sm:p-7 max-w-sm w-full space-y-5 shadow-2xl relative text-white">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white font-heading">Dismiss App Banner?</h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">Are you sure you want to close the RBT app installer?</p>
              </div>
            </div>

            {/* CHECKBOX: DON'T SHOW AGAIN */}
            <div className="p-3.5 bg-zinc-900/90 rounded-2xl border border-white/10 flex items-center gap-3">
              <input
                type="checkbox"
                id="pwaDontShowAgain"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 accent-[#F97316] rounded cursor-pointer"
              />
              <label htmlFor="pwaDontShowAgain" className="text-xs text-zinc-200 font-bold cursor-pointer select-none">
                Don't show this prompt again
              </label>
            </div>

            {/* YES / NO BUTTONS */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowDismissConfirm(false)}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs py-3 rounded-xl border border-white/10 transition-all cursor-pointer"
              >
                No, Keep Banner
              </button>
              <button
                type="button"
                onClick={handleConfirmDismiss}
                className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs py-3 rounded-xl shadow-lg transition-all cursor-pointer"
              >
                Yes, Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS / Guided Installation Modal */}
      {showIosModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-brand-orange-500/50 rounded-3xl p-6 max-w-sm w-full space-y-5 shadow-2xl animate-fade-in relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-brand-orange-400" />
                <h3 className="text-sm font-black text-white font-heading">Add RBT App to Home Screen</h3>
              </div>
              <button onClick={() => setShowIosModal(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-zinc-300 font-mono">
              <div className="p-3 bg-zinc-900 rounded-xl border border-white/10 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">Tap Safari Share Button</span>
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                    Tap the <Share className="w-4 h-4 text-blue-400" /> Share icon at the bottom of Safari.
                  </span>
                </div>
              </div>

              <div className="p-3 bg-zinc-900 rounded-xl border border-white/10 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-orange-600/20 text-brand-orange-400 border border-brand-orange-500/30 flex items-center justify-center font-bold shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">Select "Add to Home Screen"</span>
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                    Scroll down and tap <PlusSquare className="w-4 h-4 text-brand-orange-400" /> Add to Home Screen (+).
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-emerald-400 font-bold text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Instant auto-login &amp; frameless full-screen experience enabled!</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs py-2.5 rounded-xl border border-white/10 cursor-pointer"
            >
              Got It!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
