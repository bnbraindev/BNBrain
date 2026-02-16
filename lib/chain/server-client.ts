/**
 * Server-only RPC client — resolves RPC URLs from DB config with env fallback.
 *
 * Use this in server-only code (API routes, AI tools, server services).
 * For code in the client bundle path, use lib/chain/client.ts instead.
 */
import { createPublicClient, http, type PublicClient } from 'viem';
import { bsc, bscTestnet, opBNB } from 'viem/chains';
import { resolveRpcUrls } from '@/lib/server/setup-store';

let clientCache: {
  urls: { url56: string; url97: string; url204: string };
  clients: Map<number, PublicClient>;
} | null = null;

function urlsMatch(
  a: { url56: string; url97: string; url204: string },
  b: { url56: string; url97: string; url204: string }
): boolean {
  return a.url56 === b.url56 && a.url97 === b.url97 && a.url204 === b.url204;
}

function buildClient(
  chainId: number,
  urls: { url56: string; url97: string; url204: string }
): PublicClient {
  switch (chainId) {
    case 97:
      return createPublicClient({ chain: bscTestnet, transport: http(urls.url97) });
    case 204:
      return createPublicClient({ chain: opBNB, transport: http(urls.url204) });
    default:
      return createPublicClient({ chain: bsc, transport: http(urls.url56) });
  }
}

export async function getPublicClient(chainId: number = 56): Promise<PublicClient> {
  const urls = await resolveRpcUrls();
  if (clientCache && urlsMatch(clientCache.urls, urls)) {
    const existing = clientCache.clients.get(chainId);
    if (existing) return existing;
    const client = buildClient(chainId, urls);
    clientCache.clients.set(chainId, client);
    return client;
  }
  clientCache = { urls, clients: new Map() };
  const client = buildClient(chainId, urls);
  clientCache.clients.set(chainId, client);
  return client;
}

export function invalidateRpcClients(): void {
  clientCache = null;
}
