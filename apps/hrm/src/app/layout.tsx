import React from 'react';
import { Inter, Fraunces, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
// Boot-time env-lock: fails the build/render loudly if dev tools are enabled in production.
import '@/lib/devToolsGate';
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
      className={`${inter.variable} ${fraunces.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var m = localStorage.getItem('ras_theme_mode') || 'professional-matte';
                  var a = localStorage.getItem('ras_theme_accent') || 'orange';
                  var c = localStorage.getItem('ras_rbt_color_mode') || 'light';
                  var o = localStorage.getItem('ras_theme_opacity') || '35';
                  var el = document.documentElement;
                  el.setAttribute('data-mode', m);
                  el.setAttribute('data-accent', a);
                  el.setAttribute('data-color-mode', c);
                  var isV2 = (m === 'supernova' || m === 'nebula-hyper-drift' || m === 'quantum-matrix' || m === 'synthwave-84' || m === 'aurora-borealis' || m === 'emerald-cyber' || m === 'holographic-prism' || m === 'solar-flare' || m === 'deep-space-void' || m === 'cyberpunk-neon');
                  el.setAttribute('data-engine', isV2 ? 'v2' : 'v1');
                  el.style.setProperty('--glass-opacity', (parseInt(o, 10) / 100).toString());
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
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
