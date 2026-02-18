'use client';

import { createContext, useContext } from 'react';
import type { ToolPart } from '../tool-invocation';

export type PanelCard = {
  id: string;
  toolName: string;
  state: 'loading' | 'completed' | 'error';
  output?: Record<string, unknown>;
  input?: Record<string, unknown>;
  messageId: string;
  messageIndex: number;
  toolPart: ToolPart;
};

interface PanelContextValue {
  hasPanel: boolean;
  onBadgeClick?: (cardId: string) => void;
}

export const PanelContext = createContext<PanelContextValue>({ hasPanel: false });

export function usePanelContext() {
  return useContext(PanelContext);
}
