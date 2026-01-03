import { ethers } from "ethers";
import { clientStorage, type StoredTransaction } from "./client-storage";

export interface ExplorerTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError: string;
  blockNumber: string;
  gasUsed: string;
}

export interface TokenTransfer {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

export interface ParsedTransaction {
  id: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  timestamp: string;
  type: "send" | "receive";
  status: "confirmed" | "failed";
  chainId: string;
  tokenSymbol: string;
  walletId: string;
  isTokenTransfer?: boolean;
  contractAddress?: string;
}

const CHAIN_SYMBOLS: Record<number, string> = {
  1: "ETH",
  56: "BNB",
  137: "MATIC",
  43114: "AVAX",
  42161: "ETH",
  10: "ETH",
};

const BLOCKSCOUT_APIS: Record<number, string> = {
  1: "https://eth.blockscout.com/api",
  137: "https://polygon.blockscout.com/api",
  42161: "https://arbitrum.blockscout.com/api",
  10: "https://optimism.blockscout.com/api",
};

const PUBLIC_RPC_ENDPOINTS: Record<number, string> = {
  56: "https://bsc-mainnet.public.blastapi.io",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

let fetchCache: Map<string, { data: ParsedTransaction[]; timestamp: number }> = new Map();
const CACHE_DURATION = 60000;

async function fetchTokenTransfersViaRpc(
  address: string,
  chainId: number,
  walletId: string,
  walletChainId: string
): Promise<ParsedTransaction[]> {
  const rpcUrl = PUBLIC_RPC_ENDPOINTS[chainId];
  if (!rpcUrl) return [];

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const currentBlock = await provider.getBlockNumber();
    
    const paddedAddress = "0x" + address.slice(2).toLowerCase().padStart(64, "0");
    const transactions: ParsedTransaction[] = [];
    const lowerAddress = address.toLowerCase();
    
    const blockRange = 2000;
    const iterations = 5;
    
    for (let i = 0; i < iterations; i++) {
      const toBlock = currentBlock - (i * blockRange);
      const fromBlock = toBlock - blockRange + 1;
      if (fromBlock < 0) break;

      try {
        const [receivedLogs, sentLogs] = await Promise.all([
          provider.getLogs({
            fromBlock,
            toBlock,
            topics: [ERC20_TRANSFER_TOPIC, null, paddedAddress],
          }),
          provider.getLogs({
            fromBlock,
            toBlock,
            topics: [ERC20_TRANSFER_TOPIC, paddedAddress, null],
          }),
        ]);

        for (const log of [...receivedLogs, ...sentLogs]) {
          const fromAddr = "0x" + log.topics[1]?.slice(26);
          const toAddr = "0x" + log.topics[2]?.slice(26);
          const isReceive = toAddr.toLowerCase() === lowerAddress;

          let decimals = 18;
          let symbol = "TOKEN";
          try {
            const erc20 = new ethers.Contract(log.address, [
              "function decimals() view returns (uint8)",
              "function symbol() view returns (string)",
            ], provider);
            [decimals, symbol] = await Promise.all([erc20.decimals(), erc20.symbol()]);
          } catch {}

          const amount = ethers.formatUnits(log.data, decimals);
          const block = await provider.getBlock(log.blockNumber);

          transactions.push({
            id: `rpc-${log.transactionHash}-${log.index}`,
            txHash: log.transactionHash,
            fromAddress: fromAddr,
            toAddress: toAddr,
            amount,
            timestamp: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : new Date().toISOString(),
            type: isReceive ? "receive" : "send",
            status: "confirmed",
            chainId: walletChainId,
            tokenSymbol: symbol,
            walletId,
            isTokenTransfer: true,
            contractAddress: log.address,
          });
        }
      } catch (e) {
        console.error(`Error fetching block range ${fromBlock}-${toBlock}:`, e);
      }
    }

    return transactions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, 50);
  } catch (error) {
    console.error("Error fetching via RPC:", error);
    return [];
  }
}

async function fetchFromExplorerApi(
  address: string,
  chainId: number,
  walletId: string,
  walletChainId: string,
  chainSymbol: string
): Promise<ParsedTransaction[]> {
  const apiUrl = BLOCKSCOUT_APIS[chainId];
  if (!apiUrl) return [];

  try {
    const url = `${apiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data.status !== "1" || !Array.isArray(data.result)) return [];

    const lowerAddress = address.toLowerCase();
    const symbol = CHAIN_SYMBOLS[chainId] || chainSymbol || "ETH";

    return data.result.map((tx: ExplorerTransaction) => {
      const isReceive = tx.to.toLowerCase() === lowerAddress;
      const valueInEth = ethers.formatEther(tx.value || "0");
      
      return {
        id: `explorer-${tx.hash}`,
        txHash: tx.hash,
        fromAddress: tx.from,
        toAddress: tx.to,
        amount: valueInEth,
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        type: isReceive ? "receive" : "send",
        status: tx.isError === "0" ? "confirmed" : "failed",
        chainId: walletChainId,
        tokenSymbol: symbol,
        walletId: walletId,
        isTokenTransfer: false,
      };
    });
  } catch {
    return [];
  }
}

async function fetchBtcTransactions(
  address: string,
  walletId: string,
  walletChainId: string
): Promise<ParsedTransaction[]> {
  try {
    const response = await fetch(
      `https://blockstream.info/api/address/${address}/txs`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return [];
    
    const txs = await response.json();
    if (!Array.isArray(txs)) return [];

    return txs.slice(0, 50).map((tx: any) => {
      const isReceive = tx.vout?.some((out: any) => 
        out.scriptpubkey_address === address
      );
      
      let amount = 0;
      if (isReceive) {
        amount = tx.vout
          .filter((out: any) => out.scriptpubkey_address === address)
          .reduce((sum: number, out: any) => sum + (out.value || 0), 0) / 100000000;
      } else {
        amount = tx.vin?.reduce((sum: number, input: any) => {
          if (input.prevout?.scriptpubkey_address === address) {
            return sum + (input.prevout.value || 0);
          }
          return sum;
        }, 0) / 100000000 || 0;
      }

      return {
        id: `btc-${tx.txid}`,
        txHash: tx.txid,
        fromAddress: isReceive ? "Unknown" : address,
        toAddress: isReceive ? address : "Unknown",
        amount: amount.toString(),
        timestamp: tx.status?.block_time 
          ? new Date(tx.status.block_time * 1000).toISOString()
          : new Date().toISOString(),
        type: isReceive ? "receive" : "send",
        status: tx.status?.confirmed ? "confirmed" : "failed",
        chainId: walletChainId,
        tokenSymbol: "BTC",
        walletId: walletId,
        isTokenTransfer: false,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchTransactionHistory(
  address: string,
  chainId: number,
  walletId: string,
  walletChainId: string,
  chainSymbol: string,
  blockExplorerUrl?: string
): Promise<ParsedTransaction[]> {
  const cacheKey = `native-${address}-${chainId}-${chainSymbol}`;
  const cached = fetchCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  let transactions: ParsedTransaction[] = [];

  if (chainId === 0) {
    switch (chainSymbol.toUpperCase()) {
      case 'BTC':
        transactions = await fetchBtcTransactions(address, walletId, walletChainId);
        break;
      default:
        transactions = [];
    }
  } else {
    transactions = await fetchFromExplorerApi(address, chainId, walletId, walletChainId, chainSymbol);
  }

  if (transactions.length > 0) {
    fetchCache.set(cacheKey, { data: transactions, timestamp: Date.now() });
  }

  return transactions;
}

export async function fetchTokenTransfers(
  address: string,
  chainId: number,
  walletId: string,
  walletChainId: string,
  blockExplorerUrl?: string
): Promise<ParsedTransaction[]> {
  if (chainId === 0) return [];

  const cacheKey = `tokens-${address}-${chainId}`;
  const cached = fetchCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const apiUrl = BLOCKSCOUT_APIS[chainId];
  
  if (PUBLIC_RPC_ENDPOINTS[chainId] && !apiUrl) {
    const rpcTransactions = await fetchTokenTransfersViaRpc(address, chainId, walletId, walletChainId);
    if (rpcTransactions.length > 0) {
      fetchCache.set(cacheKey, { data: rpcTransactions, timestamp: Date.now() });
    }
    return rpcTransactions;
  }
  
  if (!apiUrl) return [];

  try {
    const url = `${apiUrl}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) return [];

    const data = await response.json();
    if (data.status !== "1" || !Array.isArray(data.result)) return [];

    const lowerAddress = address.toLowerCase();

    const parsed: ParsedTransaction[] = data.result.map((tx: TokenTransfer) => {
      const isReceive = tx.to.toLowerCase() === lowerAddress;
      const decimals = parseInt(tx.tokenDecimal) || 18;
      const amount = ethers.formatUnits(tx.value || "0", decimals);

      return {
        id: `token-${tx.hash}-${tx.contractAddress}`,
        txHash: tx.hash,
        fromAddress: tx.from,
        toAddress: tx.to,
        amount: amount,
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        type: isReceive ? "receive" : "send",
        status: "confirmed",
        chainId: walletChainId,
        tokenSymbol: tx.tokenSymbol || "TOKEN",
        walletId: walletId,
        isTokenTransfer: true,
        contractAddress: tx.contractAddress,
      };
    });

    fetchCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
    return parsed;
  } catch {
    return [];
  }
}

function convertStoredToParesed(stored: StoredTransaction): ParsedTransaction {
  return {
    id: stored.id,
    txHash: stored.txHash || '',
    fromAddress: stored.fromAddress,
    toAddress: stored.toAddress,
    amount: stored.amount,
    timestamp: stored.timestamp,
    type: stored.type,
    status: stored.status === 'pending' ? 'confirmed' : stored.status,
    chainId: stored.chainId,
    tokenSymbol: stored.tokenSymbol,
    walletId: stored.walletId,
    isTokenTransfer: stored.tokenSymbol !== 'ETH' && stored.tokenSymbol !== 'BNB' && 
                     stored.tokenSymbol !== 'MATIC' && stored.tokenSymbol !== 'AVAX' &&
                     stored.tokenSymbol !== 'BTC' && stored.tokenSymbol !== 'SOL' &&
                     stored.tokenSymbol !== 'TRX' && stored.tokenSymbol !== 'DOGE' &&
                     stored.tokenSymbol !== 'LTC' && stored.tokenSymbol !== 'BCH' &&
                     stored.tokenSymbol !== 'XRP',
  };
}

export async function fetchAllTransactions(
  wallets: Array<{
    id: string;
    address: string;
    chainId: string;
    numericChainId: number;
    chainSymbol: string;
    blockExplorerUrl?: string;
  }>
): Promise<ParsedTransaction[]> {
  const allTransactions: ParsedTransaction[] = [];

  const results = await Promise.all(
    wallets.flatMap((wallet) => {
      return [
        fetchTransactionHistory(
          wallet.address,
          wallet.numericChainId,
          wallet.id,
          wallet.chainId,
          wallet.chainSymbol,
          wallet.blockExplorerUrl
        ),
        wallet.numericChainId > 0
          ? fetchTokenTransfers(
              wallet.address,
              wallet.numericChainId,
              wallet.id,
              wallet.chainId,
              wallet.blockExplorerUrl
            )
          : Promise.resolve([]),
      ];
    })
  );

  for (const txs of results) {
    allTransactions.push(...txs);
  }

  // Also fetch locally stored transactions (sent from our app)
  try {
    const localTxs = await clientStorage.getAllTransactions();
    const relevantChainIds = new Set(wallets.map(w => w.chainId));
    
    for (const storedTx of localTxs) {
      // Only include transactions for the chains we're querying
      if (relevantChainIds.has(storedTx.chainId)) {
        allTransactions.push(convertStoredToParesed(storedTx));
      }
    }
  } catch (err) {
    console.error("Failed to fetch local transactions:", err);
  }

  // Deduplicate by txHash (prefer blockchain data over local)
  const uniqueTxs = new Map<string, ParsedTransaction>();
  for (const tx of allTransactions) {
    // Use txHash for deduplication if available, otherwise use id
    const key = tx.txHash || tx.id;
    // Only add if not already present (first one wins - blockchain comes first)
    if (!uniqueTxs.has(key)) {
      uniqueTxs.set(key, tx);
    }
  }

  const sortedTxs = Array.from(uniqueTxs.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return sortedTxs;
}

export function clearExplorerCache() {
  fetchCache.clear();
}
