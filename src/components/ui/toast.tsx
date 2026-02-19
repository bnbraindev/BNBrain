'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastInput {
  title: string;
  message?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  pushToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function iconForVariant(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="size-4 text-emerald-400" />;
    case 'warning':
      return <AlertCircle className="size-4 text-amber-400" />;
    case 'error':
      return <AlertCircle className="size-4 text-destructive" />;
    default:
      return <Info className="size-4 text-sky-400" />;
  }
}

function variantClasses(variant: ToastVariant): string {
  switch (variant) {
    case 'success':
      return 'border-emerald-500/30 bg-emerald-500/10';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10';
    case 'error':
      return 'border-destructive/30 bg-destructive/10';
    default:
      return 'border-sky-500/30 bg-sky-500/10';
  }
}

function nextToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: ToastInput) => {
      const id = nextToastId();
      const variant = toast.variant ?? 'info';
      const defaultDuration = variant === 'error' ? 8000 : variant === 'warning' ? 5000 : 3500;
      const item: ToastItem = {
        id,
        title: toast.title,
        message: toast.message,
        variant,
        durationMs: toast.durationMs ?? defaultDuration,
      };
      setToasts((prev) => [...prev, item].slice(-5));
      setTimeout(() => removeToast(id), item.durationMs);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed right-3 top-3 z-[100] flex w-[min(420px,calc(100vw-1.5rem))] flex-col gap-2 sm:right-4 sm:top-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-xl border px-3 py-2 shadow-lg backdrop-blur-sm animate-message-in',
              variantClasses(toast.variant)
            )}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{iconForVariant(toast.variant)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.message ? (
                  <p className="mt-0.5 text-xs text-muted-foreground break-words">
                    {toast.message}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

