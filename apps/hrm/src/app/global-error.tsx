'use client';

import Link from 'next/link';
import './globals.css';

/**
 * Root error boundary — replaces the entire root layout when an uncaught
 * render/server error escapes every nested boundary.
 *
 * Non-leaky by design: shows only the opaque error digest (safe — it is a
 * hash, not a message). The real error is logged server-side as one
 * structured JSON line by `onRequestError` in src/instrumentation.ts.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-screen flex items-center justify-center bg-zinc-950 font-sans text-white">
        {/* Radial brand glow behind the card */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{
            background:
              'radial-gradient(60% 45% at 50% 35%, rgba(249,115,22,0.10) 0%, rgba(9,9,11,0) 70%)',
          }}
        />
        <main className="relative mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/80 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/10">
            <svg
              className="h-6 w-6 text-orange-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            An unexpected error interrupted this page. Our team can trace it
            with the reference below — nothing you entered was exposed.
          </p>
          {error.digest && (
            <p className="mt-4 inline-block rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-zinc-400">
              Ref: {error.digest}
            </p>
          )}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="cursor-pointer rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-300 transition-all duration-300 hover:scale-[1.02] hover:border-orange-500/60 hover:bg-orange-500/20"
            >
              Try again
            </button>
            <Link
              href="/"
              className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition-all duration-300 hover:scale-[1.02] hover:border-white/20 hover:bg-white/10"
            >
              Back to portal
            </Link>
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            Rise &amp; Shine HRM
          </p>
        </main>
      </body>
    </html>
  );
}
