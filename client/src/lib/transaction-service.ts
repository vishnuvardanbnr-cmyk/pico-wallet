import { ethers } from "ethers";

export interface TransactionParams {
  chainId: string;
  from: string;
  to: string;
  amount: string;
  tokenSymbol?: string;
  tokenContractAddress?: string;
  isNativeToken: boolean;
  decimals?: number;
}

export interface UnsignedTransaction {
  chainType: "evm" | "solana" | "tron" | "bitcoin";
  chainId: number;
  to: string;
  value: string;
  data?: string;
  nonce?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

const CHAIN_ID_MAP: Record<string, { evmChainId: number; type: "evm" | "solana" | "tron" | "bitcoin" }> = {
  "chain-0": { evmChainId: 1, type: "evm" },      // Ethereum
  "chain-1": { evmChainId: 0, type: "bitcoin" }, // Bitcoin
  "chain-2": { evmChainId: 56, type: "evm" },    // BNB Smart Chain
  "chain-3": { evmChainId: 137, type: "evm" },   // Polygon
  "chain-4": { evmChainId: 43114, type: "evm" }, // Avalanche
  "chain-5": { evmChainId: 42161, type: "evm" }, // Arbitrum
  "chain-6": { evmChainId: 0, type: "bitcoin" }, // XRP (unsupported, fallback to bitcoin type)
  "chain-7": { evmChainId: 0, type: "bitcoin" }, // Dogecoin
  "chain-8": { evmChainId: 0, type: "tron" },    // TRON
  "chain-9": { evmChainId: 0, type: "bitcoin" }, // Litecoin
  "chain-10": { evmChainId: 0, type: "bitcoin" }, // Bitcoin Cash
  "chain-11": { evmChainId: 0, type: "solana" }, // Solana
};

const RPC_ENDPOINTS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon-rpc.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
};

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export function getChainInfo(chainId: string): { evmChainId: number; type: "evm" | "solana" | "tron" | "bitcoin" } | null {
  return CHAIN_ID_MAP[chainId] || null;
}

export function getChainSymbol(chainId: string): string {
  const symbols: Record<string, string> = {
    "chain-0": "ETH",      // Ethereum
    "chain-1": "BTC",      // Bitcoin
    "chain-2": "BNB",      // BNB Smart Chain
    "chain-3": "MATIC",    // Polygon
    "chain-4": "AVAX",     // Avalanche
    "chain-5": "ARB",      // Arbitrum (uses ETH for gas but different symbol)
    "chain-6": "XRP",      // XRP
    "chain-7": "DOGE",     // Dogecoin
    "chain-8": "TRX",      // TRON
    "chain-9": "LTC",      // Litecoin
    "chain-10": "BCH",     // Bitcoin Cash
    "chain-11": "SOL",     // Solana
  };
  return symbols[chainId] || "ETH";
}

export async function getProvider(chainId: number): Promise<ethers.JsonRpcProvider | null> {
  const rpcUrl = RPC_ENDPOINTS[chainId];
  if (!rpcUrl) return null;
  return new ethers.JsonRpcProvider(rpcUrl, chainId);
}

export async function buildEvmNativeTransaction(
  params: TransactionParams,
  evmChainId: number
): Promise<ethers.TransactionRequest | null> {
  try {
    const provider = await getProvider(evmChainId);
    if (!provider) return null;

    const [gasPrice, nonce, feeData] = await Promise.all([
      provider.getFeeData().then(f => f.gasPrice),
      provider.getTransactionCount(params.from),
      provider.getFeeData(),
    ]);

    const value = ethers.parseEther(params.amount);
    
    const tx: ethers.TransactionRequest = {
      to: params.to,
      value,
      chainId: evmChainId,
      gasLimit: BigInt(21000),
      nonce,
    };

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      tx.maxFeePerGas = feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else {
      tx.gasPrice = gasPrice || BigInt(20000000000);
    }

    return tx;
  } catch (error) {
    console.error("Failed to build EVM native transaction:", error);
    return null;
  }
}

export async function buildErc20Transaction(
  params: TransactionParams,
  evmChainId: number
): Promise<ethers.TransactionRequest | null> {
  try {
    if (!params.tokenContractAddress) {
      console.error("Token contract address required for ERC20 transfer");
      return null;
    }

    const provider = await getProvider(evmChainId);
    if (!provider) return null;

    const contract = new ethers.Contract(params.tokenContractAddress, ERC20_ABI, provider);
    
    const decimals = params.decimals || await contract.decimals();
    const amount = ethers.parseUnits(params.amount, decimals);
    
    const data = contract.interface.encodeFunctionData("transfer", [params.to, amount]);

    const [gasPrice, nonce, feeData] = await Promise.all([
      provider.getFeeData().then(f => f.gasPrice),
      provider.getTransactionCount(params.from),
      provider.getFeeData(),
    ]);

    const gasEstimate = await provider.estimateGas({
      from: params.from,
      to: params.tokenContractAddress,
      data,
    });

    const tx: ethers.TransactionRequest = {
      to: params.tokenContractAddress,
      value: BigInt(0),
      data,
      chainId: evmChainId,
      gasLimit: gasEstimate * BigInt(12) / BigInt(10),
      nonce,
    };

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      tx.maxFeePerGas = feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else {
      tx.gasPrice = gasPrice || BigInt(20000000000);
    }

    return tx;
  } catch (error) {
    console.error("Failed to build ERC20 transaction:", error);
    return null;
  }
}

export interface SolanaTransactionData {
  from: string;
  to: string;
  amount: string;
  lamports: bigint;
}

export interface TronTransactionData {
  from: string;
  to: string;
  amount: string;
  sunAmount: bigint;
}

export interface BitcoinTransactionData {
  from: string;
  to: string;
  amount: string;
  satoshis: bigint;
}

export async function buildSolanaTransaction(
  params: TransactionParams
): Promise<SolanaTransactionData | null> {
  try {
    const lamports = BigInt(Math.floor(parseFloat(params.amount) * 1e9));
    return {
      from: params.from,
      to: params.to,
      amount: params.amount,
      lamports,
    };
  } catch (error) {
    console.error("Failed to build Solana transaction:", error);
    return null;
  }
}

export async function buildTronTransaction(
  params: TransactionParams
): Promise<TronTransactionData | null> {
  try {
    const sunAmount = BigInt(Math.floor(parseFloat(params.amount) * 1e6));
    return {
      from: params.from,
      to: params.to,
      amount: params.amount,
      sunAmount,
    };
  } catch (error) {
    console.error("Failed to build TRON transaction:", error);
    return null;
  }
}

export async function buildBitcoinTransaction(
  params: TransactionParams
): Promise<BitcoinTransactionData | null> {
  try {
    const satoshis = BigInt(Math.floor(parseFloat(params.amount) * 1e8));
    return {
      from: params.from,
      to: params.to,
      amount: params.amount,
      satoshis,
    };
  } catch (error) {
    console.error("Failed to build Bitcoin transaction:", error);
    return null;
  }
}

export async function buildTransaction(params: TransactionParams): Promise<{
  tx: ethers.TransactionRequest | null;
  chainType: "evm" | "solana" | "tron" | "bitcoin";
  evmChainId: number;
  solanaData?: SolanaTransactionData;
  tronData?: TronTransactionData;
  bitcoinData?: BitcoinTransactionData;
} | null> {
  const chainInfo = getChainInfo(params.chainId);
  if (!chainInfo) {
    console.error("Unknown chain:", params.chainId);
    return null;
  }

  if (chainInfo.type === "evm") {
    if (params.isNativeToken) {
      const tx = await buildEvmNativeTransaction(params, chainInfo.evmChainId);
      return tx ? { tx, chainType: "evm", evmChainId: chainInfo.evmChainId } : null;
    } else {
      const tx = await buildErc20Transaction(params, chainInfo.evmChainId);
      return tx ? { tx, chainType: "evm", evmChainId: chainInfo.evmChainId } : null;
    }
  }

  if (chainInfo.type === "solana") {
    const solanaData = await buildSolanaTransaction(params);
    return solanaData ? { tx: null, chainType: "solana", evmChainId: 0, solanaData } : null;
  }

  if (chainInfo.type === "tron") {
    const tronData = await buildTronTransaction(params);
    return tronData ? { tx: null, chainType: "tron", evmChainId: 0, tronData } : null;
  }

  if (chainInfo.type === "bitcoin") {
    const bitcoinData = await buildBitcoinTransaction(params);
    return bitcoinData ? { tx: null, chainType: "bitcoin", evmChainId: 0, bitcoinData } : null;
  }

  return null;
}

export async function broadcastEvmTransaction(
  signedTx: string,
  chainId: number
): Promise<TransactionResult> {
  try {
    const provider = await getProvider(chainId);
    if (!provider) {
      return { success: false, error: `No RPC endpoint for chain ${chainId}` };
    }

    const txResponse = await provider.broadcastTransaction(signedTx);
    return { success: true, txHash: txResponse.hash };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to broadcast transaction" };
  }
}

export async function broadcastSolanaTransaction(
  signedTx: string
): Promise<TransactionResult> {
  try {
    const response = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [signedTx, { encoding: "base64" }],
      }),
    });

    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error.message };
    }
    return { success: true, txHash: data.result };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to broadcast Solana transaction" };
  }
}

export async function broadcastTronTransaction(
  signedTx: string
): Promise<TransactionResult> {
  try {
    const response = await fetch("https://api.trongrid.io/wallet/broadcasttransaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: signedTx,
    });

    const data = await response.json();
    if (data.result) {
      return { success: true, txHash: data.txid };
    }
    return { success: false, error: data.message || "Failed to broadcast TRON transaction" };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to broadcast TRON transaction" };
  }
}

export async function broadcastTransaction(
  signedTx: string,
  chainType: "evm" | "solana" | "tron" | "bitcoin",
  evmChainId?: number
): Promise<TransactionResult> {
  switch (chainType) {
    case "evm":
      if (!evmChainId) return { success: false, error: "EVM chain ID required" };
      return broadcastEvmTransaction(signedTx, evmChainId);
    case "solana":
      return broadcastSolanaTransaction(signedTx);
    case "tron":
      return broadcastTronTransaction(signedTx);
    case "bitcoin":
      return { success: false, error: "Bitcoin transactions not yet supported" };
    default:
      return { success: false, error: "Unknown chain type" };
  }
}

// Token contracts mapped by correct chain IDs:
// chain-0: Ethereum, chain-2: BNB Smart Chain, chain-3: Polygon, chain-4: Avalanche, chain-5: Arbitrum
const TOKEN_CONTRACTS: Record<string, Record<string, { address: string; decimals: number }>> = {
  "USDT": {
    "chain-0": { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },      // Ethereum
    "chain-2": { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },     // BNB Smart Chain
    "chain-3": { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },      // Polygon
    "chain-5": { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },      // Arbitrum
  },
  "USDC": {
    "chain-0": { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },      // Ethereum
    "chain-2": { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },     // BNB Smart Chain
    "chain-3": { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6 },      // Polygon
    "chain-5": { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },      // Arbitrum
  },
  "WBTC": {
    "chain-0": { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },      // Ethereum
  },
  "LINK": {
    "chain-0": { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },     // Ethereum
    "chain-2": { address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", decimals: 18 },     // BNB Smart Chain
  },
  "UNI": {
    "chain-0": { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },     // Ethereum
  },
  "SHIB": {
    "chain-0": { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18 },     // Ethereum
  },
  "STETH": {
    "chain-0": { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", decimals: 18 },     // Ethereum
  },
  "AAVE": {
    "chain-0": { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },     // Ethereum
  },
  "MKR": {
    "chain-0": { address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", decimals: 18 },     // Ethereum
  },
  "GRT": {
    "chain-0": { address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7", decimals: 18 },     // Ethereum
  },
  "DAI": {
    "chain-0": { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },     // Ethereum
    "chain-2": { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },     // BNB Smart Chain
  },
};

export function getTokenContract(tokenSymbol: string, chainId: string): { address: string; decimals: number } | null {
  const symbol = tokenSymbol.toUpperCase();
  const chainContracts = TOKEN_CONTRACTS[symbol];
  if (!chainContracts) return null;
  return chainContracts[chainId] || null;
}

export function isChainSupported(chainId: string): { supported: boolean; type: string; evmChainId?: number; reason?: string } {
  const chainInfo = getChainInfo(chainId);
  if (!chainInfo) {
    return { supported: false, type: "unknown", reason: "Unknown chain" };
  }

  switch (chainInfo.type) {
    case "evm":
      return { supported: true, type: "evm", evmChainId: chainInfo.evmChainId };
    case "solana":
      return { supported: true, type: "solana" };
    case "tron":
      return { supported: true, type: "tron" };
    case "bitcoin":
      return { supported: true, type: "bitcoin" };
    default:
      return { supported: false, type: "unknown", reason: "Unknown chain type" };
  }
}
