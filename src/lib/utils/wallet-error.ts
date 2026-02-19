export type WalletErrorKind =
  | 'rejected'
  | 'insufficient_funds'
  | 'pending_request'
  | 'network'
  | 'rpc'
  | 'unknown';

export interface NormalizedWalletError {
  kind: WalletErrorKind;
  userMessage: string;
  technicalDetails?: string;
}

export function sanitizeErrorMessage(message: string): string {
  let clean = message;

  // Remove viem request payload dump.
  clean = clean.replace(/Request Arguments:[\s\S]*?(Details:|Version:|$)/gi, '');
  // Remove viem version suffix.
  clean = clean.replace(/Version:\s*viem@[^\s)]+/gi, '');
  // Hide local absolute paths if any are leaked.
  clean = clean.replace(/\/Users\/[^\s:]+/g, '[local-path]');
  // Normalize spaces/new lines.
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

function extractCode(error: unknown): number | string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as Record<string, unknown>;
  const direct = err.code;
  if (typeof direct === 'number' || typeof direct === 'string') return direct;

  const cause = err.cause;
  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>;
    const causeCode = c.code;
    if (typeof causeCode === 'number' || typeof causeCode === 'string') {
      return causeCode;
    }
  }

  return undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as Record<string, unknown>).message;
    if (typeof maybeMessage === 'string') return maybeMessage;
  }
  return 'Unknown wallet error';
}

export function normalizeWalletError(error: unknown): NormalizedWalletError {
  const raw = extractMessage(error);
  const cleaned = sanitizeErrorMessage(raw);
  const lower = cleaned.toLowerCase();
  const code = extractCode(error);
  const codeText = String(code ?? '').toLowerCase();
  const name = error && typeof error === 'object'
    ? String((error as Record<string, unknown>).name ?? '').toLowerCase()
    : '';

  const isRejected =
    code === 4001 ||
    codeText === 'action_rejected' ||
    lower.includes('user rejected') ||
    lower.includes('rejected request') ||
    lower.includes('denied transaction signature') ||
    name.includes('userrejectedrequesterror');

  if (isRejected) {
    return {
      kind: 'rejected',
      userMessage: 'Transaction canceled in wallet.',
      technicalDetails: cleaned || undefined,
    };
  }

  if (lower.includes('insufficient funds')) {
    return {
      kind: 'insufficient_funds',
      userMessage: 'Insufficient balance to cover amount and gas.',
      technicalDetails: cleaned || undefined,
    };
  }

  if (lower.includes('already pending') || lower.includes('request already pending')) {
    return {
      kind: 'pending_request',
      userMessage: 'You already have a pending wallet request. Please finish it first.',
      technicalDetails: cleaned || undefined,
    };
  }

  if (lower.includes('switch') && lower.includes('chain')) {
    return {
      kind: 'network',
      userMessage: 'Please switch to the required network in wallet.',
      technicalDetails: cleaned || undefined,
    };
  }

  if (lower.includes('rpc') || lower.includes('json-rpc') || lower.includes('execution reverted')) {
    return {
      kind: 'rpc',
      userMessage: 'Transaction could not be executed by RPC node. Please try again.',
      technicalDetails: cleaned || undefined,
    };
  }

  return {
    kind: 'unknown',
    userMessage: 'Transaction failed. Please try again.',
    technicalDetails: cleaned || undefined,
  };
}

