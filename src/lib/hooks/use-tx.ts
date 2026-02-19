'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useSendTransaction,
  useWaitForTransactionReceipt,
  useAccount,
  useSwitchChain,
} from 'wagmi';
import { normalizeWalletError } from '@/lib/utils/wallet-error';
import { useToast } from '@/components/ui/toast';
import { useChatStore } from '@/lib/stores/chat-store';
import { useTxStatusStore } from '@/lib/stores/tx-status-store';
import type { PersistedTxRecord, TxStateSyncPayload, TxStatus } from '@/lib/tx/state';

export type { TxStatus } from '@/lib/tx/state';

interface TxState {
  status: TxStatus;
  hash?: `0x${string}`;
  error?: string;
  errorDetails?: string;
  updatedAt?: number;
}

interface SendTransactionParams {
  to?: string | null;
  data?: string;
  value?: string;
  chainId?: number;
}

interface UseTransactionExecutorOptions {
  cacheKey?: string;
  sync?: {
    conversationId?: string | null;
    txKey?: string | null;
    chainId?: number;
  };
}

const txStateCache = new Map<string, TxState>();

function getOwnerHeaders(): Record<string, string> {
  const { authenticatedAddress, guestId } = useChatStore.getState();
  return authenticatedAddress
    ? { 'x-bnb-owner-type': 'wallet', 'x-bnb-owner-id': authenticatedAddress.toLowerCase() }
    : { 'x-bnb-owner-type': 'guest', 'x-bnb-owner-id': guestId };
}

export function useTransactionExecutor(options?: UseTransactionExecutorOptions) {
  const cacheKey = options?.cacheKey;
  const syncConversationId = options?.sync?.conversationId?.trim() ?? '';
  const syncTxKey = options?.sync?.txKey?.trim() ?? '';
  const shouldSync = syncConversationId.length > 0 && syncTxKey.length > 0;
  const syncChainId = options?.sync?.chainId;
  const [state, setState] = useState<TxState>(() => {
    if (!cacheKey) return { status: 'idle' };
    return txStateCache.get(cacheKey) ?? { status: 'idle' };
  });
  // Track whether this is the initial server-sync (skip toast for restored terminal states)
  const initialSyncRef = useRef(true);
  const lastStatusRef = useRef<TxStatus>(state.status);
  const { chain, address: connectedWalletAddress } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { pushToast } = useToast();
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: state.hash,
  });

  const syncStateToServer = useCallback(
    async (nextState: TxState) => {
      if (!shouldSync) return;
      const payload: TxStateSyncPayload = {
        conversationId: syncConversationId,
        txKey: syncTxKey,
        status: nextState.status,
        hash: nextState.hash,
        chainId: syncChainId,
        error: nextState.error,
        errorDetails: nextState.errorDetails,
        updatedAt: nextState.updatedAt ?? Date.now(),
      };
      try {
        await fetch('/api/tx-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getOwnerHeaders() },
          body: JSON.stringify(payload),
        });
      } catch {
        // Keep UI responsive even if syncing fails.
      }
    },
    [shouldSync, syncConversationId, syncTxKey, syncChainId]
  );

  useEffect(() => {
    if (!receipt) return;
    setState((s) => {
      if (s.status !== 'pending') return s;
      const nextState: TxState = {
        ...s,
        status: 'success',
        updatedAt: Date.now(),
      };
      void syncStateToServer(nextState);
      return nextState;
    });
  }, [receipt, syncStateToServer]);

  useEffect(() => {
    if (!cacheKey) return;
    const cached = txStateCache.get(cacheKey);
    if (!cached) {
      setState({ status: 'idle' });
      return;
    }
    // Restoring from cache — suppress toast for already-reached terminal states
    lastStatusRef.current = cached.status;
    setState(cached);
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    txStateCache.set(cacheKey, state);
    // Broadcast to lightweight store so inline badges can react
    useTxStatusStore.getState().set(cacheKey, state.status);
  }, [cacheKey, state]);

  useEffect(() => {
    if (!shouldSync) return;
    // Skip initial fetch if local cache is already in a terminal state
    if (cacheKey) {
      const cached = txStateCache.get(cacheKey);
      if (cached && (cached.status === 'success' || cached.status === 'error' || cached.status === 'cancelled')) {
        initialSyncRef.current = false;
        return;
      }
    }
    let cancelled = false;

    const syncFromServer = async () => {
      try {
        const params = new URLSearchParams({
          conversationId: syncConversationId,
          txKey: syncTxKey,
        });
        const res = await fetch(`/api/tx-state?${params.toString()}`, {
          cache: 'no-store',
          headers: getOwnerHeaders(),
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { record?: PersistedTxRecord | null };
        const record = payload.record;
        if (!record || cancelled) return;

        const remoteState: TxState = {
          status: record.status,
          hash: record.hash,
          error: record.error,
          errorDetails: record.errorDetails,
          updatedAt: record.updatedAt,
        };

        setState((current) => {
          const localUpdatedAt = current.updatedAt ?? 0;
          const remoteUpdatedAt = remoteState.updatedAt ?? 0;
          if (localUpdatedAt > remoteUpdatedAt) return current;
          // On initial sync, suppress toast for terminal states already persisted
          if (initialSyncRef.current) {
            lastStatusRef.current = remoteState.status;
          }
          // Broadcast restored state to badge store
          if (cacheKey) {
            useTxStatusStore.getState().set(cacheKey, remoteState.status);
          }
          return remoteState;
        });
        initialSyncRef.current = false;
      } catch {
        // Ignore sync read failures; local state still works.
      }
    };

    void syncFromServer();
    return () => {
      cancelled = true;
    };
  }, [shouldSync, syncConversationId, syncTxKey]);

  useEffect(() => {
    if (state.status === lastStatusRef.current) return;
    lastStatusRef.current = state.status;

    if (state.status === 'success') {
      pushToast({
        title: 'Transaction confirmed',
        message: 'Your transaction has been confirmed on-chain.',
        variant: 'success',
      });
      return;
    }

    if (state.status === 'cancelled') {
      pushToast({
        title: 'Transaction cancelled',
        message: state.error ?? 'Wallet request was cancelled.',
        variant: 'warning',
      });
      return;
    }

    if (state.status === 'error') {
      pushToast({
        title: 'Transaction failed',
        message: state.error ?? 'Transaction execution failed.',
        variant: 'error',
      });
    }
  }, [state.status, state.error, pushToast]);

  const sendTransaction = useCallback(
    async (params: SendTransactionParams) => {
      try {
        const { authenticatedAddress } = useChatStore.getState();
        const normalizedAuthenticated = authenticatedAddress?.toLowerCase() ?? null;
        const normalizedConnected = connectedWalletAddress?.toLowerCase() ?? null;
        if (
          normalizedAuthenticated &&
          normalizedConnected &&
          normalizedAuthenticated !== normalizedConnected
        ) {
          const nextState: TxState = {
            status: 'error',
            error:
              'Connected wallet does not match your signed-in session wallet. Please switch wallet or sign out first.',
            updatedAt: Date.now(),
          };
          setState(nextState);
          void syncStateToServer(nextState);
          return undefined;
        }

        setState({ status: 'confirming', error: undefined, errorDetails: undefined });
        void syncStateToServer({
          status: 'confirming',
          error: undefined,
          errorDetails: undefined,
          updatedAt: Date.now(),
        });

        if (params.chainId && chain?.id !== params.chainId) {
          await switchChainAsync({ chainId: params.chainId });
        }

        const request: {
          to?: `0x${string}`;
          data?: `0x${string}`;
          value: bigint;
        } = {
          value: params.value ? BigInt(params.value) : 0n,
        };
        if (params.to) {
          request.to = params.to as `0x${string}`;
        }
        if (params.data && params.data !== '0x') {
          request.data = params.data as `0x${string}`;
        }
        if (!request.to && !request.data) {
          const nextState: TxState = {
            status: 'error',
            error: 'Invalid transaction: missing destination and calldata.',
            updatedAt: Date.now(),
          };
          setState(nextState);
          void syncStateToServer(nextState);
          return undefined;
        }

        const hash = await sendTransactionAsync(request);

        const nextState: TxState = { status: 'pending', hash, updatedAt: Date.now() };
        setState(nextState);
        void syncStateToServer(nextState);
        return hash;
      } catch (err) {
        const normalized = normalizeWalletError(err);
        const nextState: TxState = {
          status: normalized.kind === 'rejected' ? 'cancelled' : 'error',
          error: normalized.userMessage,
          errorDetails: normalized.technicalDetails,
          updatedAt: Date.now(),
        };
        setState(nextState);
        void syncStateToServer(nextState);
        return undefined;
      }
    },
    [chain, connectedWalletAddress, switchChainAsync, sendTransactionAsync, syncStateToServer]
  );

  const sendNativeTransfer = useCallback(
    async (params: { to: string; value: string; chainId?: number }) =>
      sendTransaction({
        to: params.to,
        value: params.value,
        chainId: params.chainId,
      }),
    [sendTransaction]
  );

  const sendContractCall = useCallback(
    async (params: { to: string; data: string; value?: string; chainId?: number }) => {
      return sendTransaction({
        to: params.to,
        data: params.data,
        value: params.value,
        chainId: params.chainId,
      });
    },
    [sendTransaction]
  );

  const reset = useCallback(() => {
    if (cacheKey) {
      txStateCache.delete(cacheKey);
    }
    const nextState: TxState = { status: 'idle', updatedAt: Date.now() };
    setState(nextState);
    void syncStateToServer(nextState);
  }, [cacheKey, syncStateToServer]);

  return {
    ...state,
    receipt,
    sendTransaction,
    sendNativeTransfer,
    sendContractCall,
    reset,
  };
}
