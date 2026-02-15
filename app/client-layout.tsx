'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const Providers = dynamic(
  () => import('./providers').then((m) => m.Providers),
  {
    ssr: false,
    loading: () => (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background">
        {/* Match main page radial gradient */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,oklch(0.78_0.16_85/0.10),transparent_44%),radial-gradient(circle_at_100%_100%,oklch(0.78_0.16_85/0.06),transparent_42%)]" />

        {/* Shield icon — no border, just glow */}
        <div className="animate-shield-glow relative mb-5 flex size-16 items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-10 text-primary"
          >
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="relative mb-3 text-xl font-bold tracking-tight text-foreground">
          BNBrain
        </h1>

        {/* Pulsing dots */}
        <div className="relative flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:200ms]" />
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:400ms]" />
        </div>
      </div>
    ),
  }
);

export function ClientLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
