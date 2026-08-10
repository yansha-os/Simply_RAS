import React from 'react';
import { Inter, Fraunces, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeContext';
import { HrmLayoutWrapper } from '@/components/layout/HrmLayoutWrapper';
import { Toaster } from 'sonner';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: 'Rise & Shine HRM | RBT Careers & HR System',
  description: 'Human Resource Management & RBT Recruitment Portal for Rise & Shine ABA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Rise & Shine RBT',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${ibmPlexMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[var(--navy-950)] text-[var(--ink-100)] overflow-x-hidden">
        <ThemeProvider>
          <div className="star-layer star-layer-1"></div>
          <div className="star-layer star-layer-2"></div>
          <div className="star-layer star-layer-3"></div>
          <div className="shooting-star-container">
            <div className="shooting-star shooting-star-1"></div>
            <div className="shooting-star shooting-star-2"></div>
          </div>

          <HrmLayoutWrapper>{children}</HrmLayoutWrapper>
          <Toaster position="bottom-right" theme="dark" toastOptions={{ style: { background: '#09090b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' } }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
