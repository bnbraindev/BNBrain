'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ChatErrorBoundaryProps {
  children: React.ReactNode;
}

export class ChatErrorBoundary extends React.Component<
  ChatErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 px-6 py-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangle className="size-6 text-amber-500" />
          </div>
          <div className="text-center">
            <h2 className="text-sm font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              A rendering error occurred. This is likely a temporary issue.
            </p>
            {this.state.error?.message && (
              <p className="mt-2 max-w-sm rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs font-mono text-muted-foreground/80">
                {this.state.error.message.slice(0, 200)}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={this.handleReset}
          >
            <RotateCcw className="size-3.5" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
