export const TX_STATUS_VALUES = [
  'idle',
  'confirming',
  'pending',
  'success',
  'cancelled',
  'error',
] as const;

export type TxStatus = (typeof TX_STATUS_VALUES)[number];

export interface PersistedTxRecord {
  conversationId: string;
  txKey: string;
  status: TxStatus;
  hash?: `0x${string}`;
  chainId?: number;
  error?: string;
  errorDetails?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TxStateSyncPayload {
  conversationId: string;
  txKey: string;
  status: TxStatus;
  hash?: `0x${string}`;
  chainId?: number;
  error?: string;
  errorDetails?: string;
  updatedAt?: number;
}
