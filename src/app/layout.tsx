import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ClientLayout } from './client-layout';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3099'),
  title: 'BNBrain - AI-Powered Security Agent for BNB Chain',
  description:
    'Speak naturally, execute on-chain. AI agent with token scanning, wallet health, smart swap, and on-chain proof for BNB Chain.',
  keywords: ['BNB Chain', 'AI Agent', 'Blockchain Security', 'Token Scanner', 'DeFi', 'PancakeSwap'],
  openGraph: {
    title: 'BNBrain',
    description: 'AI-Powered Security Agent for BNB Chain',
    type: 'website',
    images: ['/api/og'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BNBrain',
    description: 'AI-Powered Security Agent for BNB Chain',
    images: ['/api/og'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only z-[120] rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip to main content
        </a>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
