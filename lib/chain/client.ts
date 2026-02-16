import { createPublicClient, http, type PublicClient } from 'viem';
import { bsc, bscTestnet, opBNB } from 'viem/chains';

// Sync clients from env vars — safe for client-side bundle.
// For DB-aware async resolution, use lib/chain/server-client.ts instead.
const bscClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.RPC_URL_56 ?? 'https://bsc-dataseed.binance.org'),
});

const bscTestnetClient = createPublicClient({
  chain: bscTestnet,
  transport: http(process.env.RPC_URL_97 ?? 'https://bsc-testnet-dataseed.bnbchain.org'),
});

const opBNBClient = createPublicClient({
  chain: opBNB,
  transport: http(process.env.RPC_URL_204 ?? 'https://opbnb-mainnet-rpc.bnbchain.org'),
});

export function getPublicClient(chainId: number = 56): PublicClient {
  switch (chainId) {
    case 97:
      return bscTestnetClient;
    case 204:
      return opBNBClient;
    default:
      return bscClient;
  }
}
