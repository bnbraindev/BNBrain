export type WalletAuthPurpose = 'user' | 'admin';

export interface WalletAuthChallengePayload {
  nonce: string;
  message: string;
  expiresAt: number;
  issuedAt: number;
  purpose: WalletAuthPurpose;
  address: string;
}

export interface WalletAuthSessionPayload {
  ok: boolean;
  address: string;
  purpose: WalletAuthPurpose;
  expiresAt: number;
  renewAt: number;
  isAdmin: boolean;
  adminWalletAddress: string | null;
  adminWalletAddresses?: string[];
}

export interface WalletSessionState {
  authenticated: boolean;
  address?: string;
  purpose?: WalletAuthPurpose;
  expiresAt?: number;
  renewAt?: number;
  isAdmin?: boolean;
}

export async function requestWalletAuthChallenge(params: {
  address: string;
  chainId?: number;
  purpose?: WalletAuthPurpose;
}): Promise<WalletAuthChallengePayload> {
  const response = await fetch('/api/auth/siwe/challenge', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: params.address,
      chainId: params.chainId,
      purpose: params.purpose ?? 'user',
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Challenge request failed (${response.status})`);
  }
  return (await response.json()) as WalletAuthChallengePayload;
}

export async function verifyWalletAuthSignature(params: {
  address: string;
  nonce: string;
  signature: string;
  chainId?: number;
  singleDevice?: boolean;
  purpose?: WalletAuthPurpose;
}): Promise<WalletAuthSessionPayload> {
  const response = await fetch('/api/auth/siwe/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: params.address,
      nonce: params.nonce,
      signature: params.signature,
      chainId: params.chainId,
      singleDevice: params.singleDevice ?? false,
      purpose: params.purpose ?? 'user',
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Signature verification failed (${response.status})`);
  }
  return (await response.json()) as WalletAuthSessionPayload;
}

export async function getWalletSessionState(options?: {
  forceRenew?: boolean;
}): Promise<WalletSessionState | null> {
  const path = options?.forceRenew ? '/api/auth/session?renew=force' : '/api/auth/session';
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Session request failed (${response.status})`);
  }
  return (await response.json()) as WalletSessionState;
}

export async function clearWalletSession(options?: { allDevices?: boolean }): Promise<void> {
  const path = options?.allDevices ? '/api/auth/session?scope=all' : '/api/auth/session';
  await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
  });
}
