'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Download, MessageSquare, Printer, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { OnboardingConfirmModal } from '@/components/rbt/OnboardingConfirmModal';
import {
  Ls54NoticeDocument,
  downloadLs54Html,
  printLs54Notice,
} from '@/components/hrm/Ls54NoticeDocument';
import {
  declineWageOffer,
  discussWageOffer,
  getMyWageOffer,
  signWageOffer,
  type WageOfferDto,
} from '@/app/actions/wageOfferActions';
import type { Ls54Payload } from '@/lib/onboardingDocuments';

export function WageOfferApplicantCard({ packComplete }: { packComplete: boolean }) {
  const [offer, setOffer] = useState<WageOfferDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [langEnglish, setLangEnglish] = useState(true);
  const [langOther, setLangOther] = useState('');
  const [englishOnlyNoTemplate, setEnglishOnlyNoTemplate] = useState(false);
  const [checkRead, setCheckRead] = useState(false);
  const [checkAck, setCheckAck] = useState(false);
  const [checkAgree, setCheckAgree] = useState(false);
  const [checkESign, setCheckESign] = useState(false);
  const [confirmKind, setConfirmKind] = useState<'SIGN' | 'DECLINE' | null>(null);
  const [pending, setPending] = useState(false);
  const [showFullNotice, setShowFullNotice] = useState(true);

  const reload = async () => {
    const res = await getMyWageOffer();
    if (res.success && res.data) setOffer(res.data);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void getMyWageOffer().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) setOffer(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!packComplete) return null;
  if (loading) {
    return (
      <div className="rounded-3xl border-2 border-orange-200 bg-white p-6 text-sm text-slate-600 shadow-xl">
        Checking wage offer status…
      </div>
    );
  }

  const status = offer?.status || 'NONE';
  const payload = (offer?.payload || null) as Ls54Payload | null;

  const noticeMeta = {
    version: offer?.version,
    signedAt: offer?.signedAt,
    signerName: status === 'SIGNED' ? signerName || payload?.employeeName : null,
    primaryLanguageEnglish: langEnglish,
    primaryLanguageOther: langEnglish ? null : langOther,
    englishOnlyNoTemplate: !langEnglish && englishOnlyNoTemplate,
  };

  if (status === 'SIGNED' && payload) {
    const signedMeta = {
      version: offer?.version,
      signedAt: offer?.signedAt,
      signerName: offer?.signatureMeta?.signerName || payload.employeeName,
      primaryLanguageEnglish: offer?.signatureMeta?.primaryLanguageEnglish ?? true,
      primaryLanguageOther: offer?.signatureMeta?.primaryLanguageOther,
      englishOnlyNoTemplate: offer?.signatureMeta?.englishOnlyNoTemplate,
    };
    return (
      <div className="space-y-4 rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-800">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="font-heading text-lg font-black">Wage notice signed</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (!printLs54Notice(payload, signedMeta)) {
                  toast.error('Pop-up blocked — allow pop-ups to print / save PDF.');
                }
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-900"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={() => downloadLs54Html(payload, signedMeta)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-900"
            >
              <Download className="h-3.5 w-3.5" />
              Download copy
            </button>
          </div>
        </div>
        <p className="text-sm text-emerald-900">
          Your LS-54 is on file at ${Number(payload.rateOfPay).toFixed(2)}/hr. Keep a copy for your
          records (NY employers must retain the original for 6 years).
        </p>
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Head HR must complete the separate final hire review. Signing this notice does not create
          Supabase password credentials or independently activate a staff login.
        </p>
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
          <Ls54NoticeDocument payload={payload} meta={signedMeta} />
        </div>
      </div>
    );
  }

  if (status === 'SENT' || status === 'IN_DISCUSSION' || status === 'DECLINED') {
    return (
      <div className="space-y-4 rounded-3xl border-2 border-orange-200 bg-white p-6 text-slate-900 shadow-xl">
        <div>
          <h3 className="font-heading text-xl font-black">Official wage notice (LS-54)</h3>
          <p className="font-mono text-xs text-slate-500">
            N.Y. Labor Law § 195.1 · version {offer?.version || 1}
            {status === 'IN_DISCUSSION' ? ' · discussion open' : ''}
            {status === 'DECLINED' ? ' · previously declined — Head HR can resend' : ''}
          </p>
        </div>

        {payload && (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowFullNotice((v) => !v)}
                className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
              >
                {showFullNotice ? 'Hide full notice' : 'Show full notice'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!printLs54Notice(payload, noticeMeta)) {
                    toast.error('Pop-up blocked — allow pop-ups to print / save PDF.');
                  }
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
              >
                <Printer className="h-3.5 w-3.5" />
                Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => downloadLs54Html(payload, noticeMeta)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                Download copy
              </button>
              <a
                href="/onboarding-docs/ls-54-wage-notice.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
              >
                Official blank LS-54 (DOL)
              </a>
            </div>

            {showFullNotice && (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Ls54NoticeDocument payload={payload} meta={noticeMeta} />
              </div>
            )}
          </>
        )}

        {(status === 'SENT' || status === 'IN_DISCUSSION') && (
          <>
            <div className="space-y-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-xs">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={checkRead}
                  onChange={(e) => setCheckRead(e.target.checked)}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="font-semibold">
                  I have reviewed this wage notice (rate, overtime, allowances, and payday).
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={checkAck}
                  onChange={(e) => setCheckAck(e.target.checked)}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="font-semibold">
                  On this day I have been notified of my pay rate, overtime rate (if eligible),
                  allowances, and designated payday. I told my employer what my primary language is.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={checkAgree}
                  onChange={(e) => setCheckAgree(e.target.checked)}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="font-semibold">
                  I agree to the rate of pay and payday stated in this notice.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={checkESign}
                  onChange={(e) => setCheckESign(e.target.checked)}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="font-semibold">
                  My electronic signature is the legal equivalent of my handwritten signature (E-SIGN
                  / N.Y. ESRA)
                </span>
              </label>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Primary language (LS-54 §8)
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  checked={langEnglish}
                  onChange={() => {
                    setLangEnglish(true);
                    setEnglishOnlyNoTemplate(false);
                  }}
                  className="mt-1 cursor-pointer"
                />
                <span>
                  I have been given this pay notice in English because it is my primary language.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  checked={!langEnglish}
                  onChange={() => setLangEnglish(false)}
                  className="mt-1 cursor-pointer"
                />
                <span className="flex-1 space-y-2">
                  <span className="block">
                    My primary language is not English. I am receiving this notice in English only
                    because the Department of Labor does not yet offer a pay notice form in my
                    primary language.
                  </span>
                  <input
                    type="text"
                    disabled={langEnglish}
                    value={langOther}
                    onChange={(e) => setLangOther(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-50"
                    placeholder="Primary language"
                  />
                  <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      disabled={langEnglish}
                      checked={englishOnlyNoTemplate}
                      onChange={(e) => setEnglishOnlyNoTemplate(e.target.checked)}
                      className="mt-0.5 cursor-pointer disabled:cursor-not-allowed"
                    />
                    I confirm the English-only notice for that reason.
                  </label>
                </span>
              </label>
            </div>

            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              It is unlawful for an employee to be paid less than an employee of the opposite sex for
              equal work. Employers also may not prohibit employees from discussing wages with their
              co-workers. You must receive a signed copy of this notice; the employer must keep the
              original for 6 years.
            </p>

            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Type your full legal name to sign"
              className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 px-3 py-3 text-base font-medium"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirmKind('SIGN')}
                className="cursor-pointer rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-bold text-white"
              >
                Accept &amp; sign
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  const res = await discussWageOffer();
                  setPending(false);
                  if (!res.success) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success('Discussion opened with Head HR.');
                  window.location.href = '/rbt/help-desk';
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800"
              >
                <MessageSquare className="h-4 w-4" />
                Discuss with Head HR
              </button>
              <button
                type="button"
                onClick={() => setConfirmKind('DECLINE')}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700"
              >
                <XCircle className="h-4 w-4" />
                Decline offer
              </button>
            </div>
          </>
        )}

        {status === 'DECLINED' && (
          <p className="text-sm text-slate-600">
            You declined this offer. Head HR can revise the rate and resend. You can also{' '}
            <Link href="/rbt/help-desk" className="font-bold text-[#F97316] underline">
              open help desk
            </Link>
            .
          </p>
        )}

        <OnboardingConfirmModal
          open={confirmKind === 'SIGN'}
          title="Confirm electronic signature"
          body={
            <p>
              You are about to electronically sign <strong>NYS Wage Notice (LS-54)</strong>
              {payload ? ` at $${Number(payload.rateOfPay).toFixed(2)}/hr` : ''}. This is a legally
              binding action. Are you sure?
            </p>
          }
          confirmLabel="Sign now"
          pending={pending}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => {
            void (async () => {
              if (!offer?.noticeContentSha256) {
                toast.error('This wage notice changed. Reload it before signing.');
                setConfirmKind(null);
                await reload();
                return;
              }
              setPending(true);
              const res = await signWageOffer({
                signerName,
                primaryLanguageEnglish: langEnglish,
                primaryLanguageOther: langOther,
                englishOnlyNoTemplate,
                noticeVersion: offer.version,
                noticeContentSha256: offer.noticeContentSha256,
                consents: {
                  read: checkRead,
                  agree: checkAgree,
                  eSign: checkESign,
                  ackNotice: checkAck,
                },
              });
              setPending(false);
              if (!res.success) {
                toast.error(res.error);
                return;
              }
              setConfirmKind(null);
              toast.success(
                'Wage notice signed. Head HR must complete final hire review.'
              );
              await reload();
              window.dispatchEvent(new Event('rbt_progress_synced'));
            })();
          }}
        />

        <OnboardingConfirmModal
          open={confirmKind === 'DECLINE'}
          title="Decline this wage offer?"
          body={
            <p>
              Declining keeps you in the offer stage. You will not be hired unless Head HR revises
              and you later accept a new notice.
            </p>
          }
          confirmLabel="Decline offer"
          pending={pending}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => {
            void (async () => {
              setPending(true);
              const res = await declineWageOffer();
              setPending(false);
              if (!res.success) {
                toast.error(res.error);
                return;
              }
              setConfirmKind(null);
              toast.success('Offer declined. Head HR has been notified via the audit trail.');
              await reload();
            })();
          }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-3xl border-2 border-slate-200 bg-white p-8 text-center shadow-xl">
      <Clock className="mx-auto h-10 w-10 text-slate-400" />
      <h3 className="mt-3 font-heading text-xl font-black text-slate-900">Waiting for Head HR</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
        Your onboarding documents are complete. Head HR is reviewing your interview notes and
        recording. If they extend an offer, you will receive an official NYS wage notice (LS-54)
        here to review and sign.
      </p>
    </div>
  );
}
