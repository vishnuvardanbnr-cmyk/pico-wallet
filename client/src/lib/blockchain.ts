import { ethers } from "ethers";

const DEFAULT_RPC_ENDPOINTS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon-rpc.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
};

const NON_EVM_DECIMALS: Record<string, number> = {
  BTC: 8,
  SOL: 9,
  XRP: 6,
  DOGE: 8,
  ADA: 6,
  TRX: 6,
  DOT: 10,
  LTC: 8,
  BCH: 8,
  ATOM: 6,
  OSMO: 6,
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export interface BroadcastResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface TokenBalance {
  balance: string;
  balanceFormatted: string;
  symbol: string;
  decimals: number;
}

export async function getProvider(chainId: number, customRpcUrl?: string): Promise<ethers.JsonRpcProvider | null> {
  const rpcUrl = customRpcUrl || DEFAULT_RPC_ENDPOINTS[chainId];
  if (!rpcUrl) {
    return null;
  }
  return new ethers.JsonRpcProvider(rpcUrl, chainId);
}

export async function getProviderByRpcUrl(rpcUrl: string, chainId: number): Promise<ethers.JsonRpcProvider | null> {
  if (!rpcUrl) {
    return null;
  }
  return new ethers.JsonRpcProvider(rpcUrl, chainId);
}

export async function broadcastTransaction(
  signedTx: string,
  chainId: number
): Promise<BroadcastResult> {
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

export async function getBalance(address: string, chainId: number, customRpcUrl?: string): Promise<string> {
  try {
    const provider = await getProvider(chainId, customRpcUrl);
    if (!provider) return "0";
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch {
    return "0";
  }
}

export async function getGasPrice(chainId: number): Promise<bigint | null> {
  try {
    const provider = await getProvider(chainId);
    if (!provider) return null;
    const feeData = await provider.getFeeData();
    return feeData.gasPrice;
  } catch {
    return null;
  }
}

export async function getNonce(address: string, chainId: number): Promise<number | null> {
  try {
    const provider = await getProvider(chainId);
    if (!provider) return null;
    return await provider.getTransactionCount(address);
  } catch {
    return null;
  }
}

export async function estimateGas(
  tx: ethers.TransactionRequest,
  chainId: number
): Promise<bigint | null> {
  try {
    const provider = await getProvider(chainId);
    if (!provider) return null;
    return await provider.estimateGas(tx);
  } catch {
    return null;
  }
}

export async function getTokenBalance(
  address: string,
  contractAddress: string,
  rpcUrl: string,
  chainId: number
): Promise<TokenBalance | null> {
  try {
    const provider = await getProviderByRpcUrl(rpcUrl, chainId);
    if (!provider) return null;

    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
      contract.symbol(),
    ]);

    const balanceFormatted = ethers.formatUnits(balance, decimals);

    return {
      balance: balance.toString(),
      balanceFormatted,
      symbol,
      decimals: Number(decimals),
    };
  } catch (error) {
    return null;
  }
}

export async function getTokenInfo(
  contractAddress: string,
  rpcUrl: string,
  chainId: number
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  try {
    const provider = await getProviderByRpcUrl(rpcUrl, chainId);
    if (!provider) return null;

    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);

    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    return {
      name,
      symbol,
      decimals: Number(decimals),
    };
  } catch (error) {
    return null;
  }
}

export async function broadcastTransactionWithRpc(
  signedTx: string,
  rpcUrl: string,
  chainId: number
): Promise<BroadcastResult> {
  try {
    const provider = await getProviderByRpcUrl(rpcUrl, chainId);
    if (!provider) {
      return { success: false, error: "No RPC endpoint available" };
    }

    const txResponse = await provider.broadcastTransaction(signedTx);
    return { success: true, txHash: txResponse.hash };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to broadcast transaction" };
  }
}

async function getBitcoinBalance(address: string): Promise<string> {
  try {
    const response = await fetch(
      `https://blockstream.info/api/address/${address}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return "0";
    const data = await response.json();
    const funded = data.chain_stats?.funded_txo_sum || 0;
    const spent = data.chain_stats?.spent_txo_sum || 0;
    const balance = (funded - spent) / 100000000;
    return balance.toString();
  } catch {
    return "0";
  }
}

async function getTronBalance(address: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.trongrid.io/v1/accounts/${address}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return "0";
    const data = await response.json();
    if (data.data?.[0]?.balance) {
      const trx = data.data[0].balance / 1000000;
      return trx.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

async function getSolanaBalance(address: string): Promise<string> {
  try {
    const response = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address]
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return "0";
    const data = await response.json();
    if (data.result?.value !== undefined) {
      const sol = data.result.value / 1000000000; // 9 decimals
      return sol.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

async function getPolkadotBalance(address: string): Promise<string> {
  // Try Subscan open API first (most reliable free option)
  try {
    const response = await fetch(
      `https://polkadot.webapi.subscan.io/api/v2/scan/account`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
        signal: AbortSignal.timeout(10000)
      }
    );
    if (response.ok) {
      const data = await response.json();
      // Subscan returns balance as a string in DOT
      if (data.data?.account?.balance) {
        return data.data.account.balance;
      }
      // Alternative field location
      if (data.data?.balance) {
        return data.data.balance;
      }
    }
  } catch {
    // Continue to fallback
  }
  
  // Fallback: Statescan API
  try {
    const response = await fetch(
      `https://polkadot.statescan.io/api/accounts/${address}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (response.ok) {
      const data = await response.json();
      // Statescan returns accountDetail.data.free in planck
      if (data.accountDetail?.data?.free) {
        const free = BigInt(data.accountDetail.data.free);
        const dot = Number(free) / Math.pow(10, 10);
        return dot.toString();
      }
      // Alternative: direct data.free
      if (data.data?.free) {
        const free = BigInt(data.data.free);
        const dot = Number(free) / Math.pow(10, 10);
        return dot.toString();
      }
    }
  } catch {
    // Continue to next fallback
  }
  
  // Final fallback: Polkaholic API
  try {
    const response = await fetch(
      `https://api.polkaholic.io/account/${address}?chainID=polkadot`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (response.ok) {
      const data = await response.json();
      // Polkaholic returns balances.free in planck
      if (data.balances?.free) {
        const free = BigInt(data.balances.free);
        const dot = Number(free) / Math.pow(10, 10);
        return dot.toString();
      }
      // Alternative field
      if (data.free) {
        const free = BigInt(data.free);
        const dot = Number(free) / Math.pow(10, 10);
        return dot.toString();
      }
    }
  } catch {
    // All attempts failed
  }
  
  return "0";
}

async function getXrpBalance(address: string): Promise<string> {
  try {
    const response = await fetch('https://s1.ripple.com:51234/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{
          account: address,
          ledger_index: 'validated'
        }]
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return "0";
    const data = await response.json();
    if (data.result?.account_data?.Balance) {
      const drops = parseInt(data.result.account_data.Balance);
      const xrp = drops / 1000000; // 6 decimals
      return xrp.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

async function getDogeBalance(address: string): Promise<string> {
  try {
    // Using Blockcypher API for Dogecoin
    const response = await fetch(
      `https://api.blockcypher.com/v1/doge/main/addrs/${address}/balance`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return "0";
    const data = await response.json();
    if (data.balance !== undefined) {
      const doge = data.balance / 100000000; // 8 decimals
      return doge.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

async function getLitecoinBalance(address: string): Promise<string> {
  try {
    // Using Blockcypher API for Litecoin
    const response = await fetch(
      `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return "0";
    const data = await response.json();
    if (data.balance !== undefined) {
      const ltc = data.balance / 100000000; // 8 decimals
      return ltc.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

async function getBitcoinCashBalance(address: string): Promise<string> {
  try {
    // Using Bitcoin.com API for BCH
    const response = await fetch(
      `https://rest.bitcoin.com/v2/address/details/${address}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) {
      // Fallback to Blockchair API
      const blockchairResponse = await fetch(
        `https://api.blockchair.com/bitcoin-cash/dashboards/address/${address}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!blockchairResponse.ok) return "0";
      const blockchairData = await blockchairResponse.json();
      if (blockchairData.data?.[address]?.address?.balance) {
        const bch = blockchairData.data[address].address.balance / 100000000;
        return bch.toString();
      }
      return "0";
    }
    const data = await response.json();
    if (data.balance !== undefined) {
      return data.balance.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

async function getCardanoBalance(address: string): Promise<string> {
  try {
    // Using Koios API for Cardano (free, no API key required)
    const response = await fetch('https://api.koios.rest/api/v1/address_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _addresses: [address] }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return "0";
    const data = await response.json();
    // Koios returns balance as a string in lovelace
    if (data[0]?.utxo_set) {
      // Sum up all UTXOs for total balance
      let totalLovelace = 0;
      for (const utxo of data[0].utxo_set) {
        totalLovelace += parseInt(utxo.value || "0");
      }
      const ada = totalLovelace / 1000000;
      return ada.toString();
    }
    return "0";
  } catch {
    // Fallback: Blockfrost public explorer
    try {
      const response = await fetch(
        `https://cardano-mainnet.blockfrost.io/api/v0/addresses/${address}`,
        { 
          headers: { 'project_id': 'mainnetpublic' },
          signal: AbortSignal.timeout(10000) 
        }
      );
      if (response.ok) {
        const data = await response.json();
        // Find ADA (lovelace) amount
        const lovelaceAsset = data.amount?.find((a: any) => a.unit === 'lovelace');
        if (lovelaceAsset) {
          const ada = parseInt(lovelaceAsset.quantity) / 1000000;
          return ada.toString();
        }
      }
    } catch {
      // All attempts failed
    }
    return "0";
  }
}

async function getCosmosBalance(address: string): Promise<string> {
  try {
    const response = await fetch(
      `https://rest.cosmos.directory/cosmoshub/cosmos/bank/v1beta1/balances/${address}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return "0";
    const data = await response.json();
    const uatom = data.balances?.find((b: any) => b.denom === 'uatom');
    if (uatom) {
      const atom = parseInt(uatom.amount) / 1000000;
      return atom.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

async function getOsmosisBalance(address: string): Promise<string> {
  try {
    const response = await fetch(
      `https://rest.cosmos.directory/osmosis/cosmos/bank/v1beta1/balances/${address}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return "0";
    const data = await response.json();
    const uosmo = data.balances?.find((b: any) => b.denom === 'uosmo');
    if (uosmo) {
      const osmo = parseInt(uosmo.amount) / 1000000;
      return osmo.toString();
    }
    return "0";
  } catch {
    return "0";
  }
}

export async function getNonEvmBalance(address: string, chainSymbol: string): Promise<string> {
  switch (chainSymbol.toUpperCase()) {
    case 'BTC':
      return await getBitcoinBalance(address);
    case 'TRX':
      return await getTronBalance(address);
    case 'ATOM':
      return await getCosmosBalance(address);
    case 'OSMO':
      return await getOsmosisBalance(address);
    case 'SOL':
      return await getSolanaBalance(address);
    case 'XRP':
      return await getXrpBalance(address);
    case 'DOGE':
      return await getDogeBalance(address);
    case 'ADA':
      return await getCardanoBalance(address);
    case 'DOT':
      return await getPolkadotBalance(address);
    case 'LTC':
      return await getLitecoinBalance(address);
    case 'BCH':
      return await getBitcoinCashBalance(address);
    default:
      return "0";
  }
}

export async function getUniversalBalance(address: string, chainId: number, chainSymbol: string, customRpcUrl?: string): Promise<string> {
  if (chainId > 0) {
    return await getBalance(address, chainId, customRpcUrl);
  } else {
    return await getNonEvmBalance(address, chainSymbol);
  }
}

// Token contract addresses for popular tokens
const TOKEN_CONTRACTS: Record<string, { address: string; chainId: number; decimals: number; rpcUrl: string }> = {
  // USDT on different chains
  'usdt-eth': { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', chainId: 1, decimals: 6, rpcUrl: 'https://eth.llamarpc.com' },
  'usdt-bsc': { address: '0x55d398326f99059fF775485246999027B3197955', chainId: 56, decimals: 18, rpcUrl: 'https://bsc-dataseed.binance.org' },
  'usdt-polygon': { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', chainId: 137, decimals: 6, rpcUrl: 'https://polygon-rpc.com' },
  'usdt-arb': { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', chainId: 42161, decimals: 6, rpcUrl: 'https://arb1.arbitrum.io/rpc' },
  // USDC on different chains
  'usdc-eth': { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chainId: 1, decimals: 6, rpcUrl: 'https://eth.llamarpc.com' },
  'usdc-bsc': { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', chainId: 56, decimals: 18, rpcUrl: 'https://bsc-dataseed.binance.org' },
  'usdc-polygon': { address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', chainId: 137, decimals: 6, rpcUrl: 'https://polygon-rpc.com' },
  'usdc-arb': { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: 42161, decimals: 6, rpcUrl: 'https://arb1.arbitrum.io/rpc' },
  // Wrapped Bitcoin
  'wbtc-eth': { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', chainId: 1, decimals: 8, rpcUrl: 'https://eth.llamarpc.com' },
  // Chainlink
  'link-eth': { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
  // Uniswap
  'uni-eth': { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
  // Shiba Inu
  'shib-eth': { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
  // Lido Staked Ether
  'steth-eth': { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
  // Aave
  'aave-eth': { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
  // Maker
  'mkr-eth': { address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
  // The Graph
  'grt-eth': { address: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
  // DAI
  'dai-eth': { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', chainId: 1, decimals: 18, rpcUrl: 'https://eth.llamarpc.com' },
};

// TRC-20 token addresses on TRON
const TRON_TOKEN_CONTRACTS: Record<string, { address: string; decimals: number }> = {
  'usdt-tron': { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
  'usdc-tron': { address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 },
};

// Fetch TRC-20 token balance from TRON
async function getTrc20TokenBalance(walletAddress: string, tokenAddress: string, decimals: number): Promise<string> {
  try {
    const response = await fetch(
      `https://api.trongrid.io/v1/accounts/${walletAddress}/tokens?only_trc20=true`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return "0";
    const data = await response.json();
    
    if (data.data?.[0]?.trc20) {
      const tokens = data.data[0].trc20;
      for (const token of tokens) {
        const contractAddr = Object.keys(token)[0];
        if (contractAddr === tokenAddress) {
          const rawBalance = token[contractAddr];
          const balance = parseFloat(rawBalance) / Math.pow(10, decimals);
          return balance.toString();
        }
      }
    }
    return "0";
  } catch {
    return "0";
  }
}

// Fetch ERC-20/BEP-20 token balance
async function getEvmTokenBalance(walletAddress: string, contractAddress: string, chainId: number, decimals: number, rpcUrl: string): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(walletAddress);
    return ethers.formatUnits(balance, decimals);
  } catch {
    return "0";
  }
}

// CoinGecko ID to token key mapping
const COINGECKO_TO_TOKEN_KEY: Record<string, { evmKey?: string; tronKey?: string; parentChainSymbol: string }> = {
  'tether': { evmKey: 'usdt-eth', parentChainSymbol: 'ETH' },
  'tether-bsc': { evmKey: 'usdt-bsc', parentChainSymbol: 'BNB' },
  'tether-tron': { tronKey: 'usdt-tron', parentChainSymbol: 'TRX' },
  'usd-coin': { evmKey: 'usdc-eth', parentChainSymbol: 'ETH' },
  'usd-coin-bsc': { evmKey: 'usdc-bsc', parentChainSymbol: 'BNB' },
  'usd-coin-tron': { tronKey: 'usdc-tron', parentChainSymbol: 'TRX' },
  'wrapped-bitcoin': { evmKey: 'wbtc-eth', parentChainSymbol: 'ETH' },
  'chainlink': { evmKey: 'link-eth', parentChainSymbol: 'ETH' },
  'uniswap': { evmKey: 'uni-eth', parentChainSymbol: 'ETH' },
  'shiba-inu': { evmKey: 'shib-eth', parentChainSymbol: 'ETH' },
  'staked-ether': { evmKey: 'steth-eth', parentChainSymbol: 'ETH' },
  'aave': { evmKey: 'aave-eth', parentChainSymbol: 'ETH' },
  'maker': { evmKey: 'mkr-eth', parentChainSymbol: 'ETH' },
  'the-graph': { evmKey: 'grt-eth', parentChainSymbol: 'ETH' },
  'dai': { evmKey: 'dai-eth', parentChainSymbol: 'ETH' },
};

// Get token balance for a specific CoinGecko asset
export async function getTokenBalanceForAsset(
  coingeckoId: string,
  walletAddresses: Record<string, string> // chainSymbol -> address mapping
): Promise<string> {
  const tokenInfo = COINGECKO_TO_TOKEN_KEY[coingeckoId];
  if (!tokenInfo) {
    return "0";
  }

  // Try EVM chains first
  if (tokenInfo.evmKey && TOKEN_CONTRACTS[tokenInfo.evmKey]) {
    const contract = TOKEN_CONTRACTS[tokenInfo.evmKey];
    const walletAddress = walletAddresses[tokenInfo.parentChainSymbol];
    if (walletAddress) {
      const balance = await getEvmTokenBalance(
        walletAddress,
        contract.address,
        contract.chainId,
        contract.decimals,
        contract.rpcUrl
      );
      if (parseFloat(balance) > 0) {
        return balance;
      }
    }
  }

  // Try TRON if available
  if (tokenInfo.tronKey && TRON_TOKEN_CONTRACTS[tokenInfo.tronKey]) {
    const contract = TRON_TOKEN_CONTRACTS[tokenInfo.tronKey];
    const walletAddress = walletAddresses['TRX'];
    if (walletAddress) {
      const balance = await getTrc20TokenBalance(
        walletAddress,
        contract.address,
        contract.decimals
      );
      if (parseFloat(balance) > 0) {
        return balance;
      }
    }
  }

  return "0";
}

// Check if an asset is a token (vs native coin)
export function isTokenAsset(coingeckoId: string): boolean {
  return coingeckoId in COINGECKO_TO_TOKEN_KEY;
}

// Get the parent chain symbol for a token asset
export function getTokenParentChain(coingeckoId: string): string | null {
  const tokenInfo = COINGECKO_TO_TOKEN_KEY[coingeckoId];
  return tokenInfo?.parentChainSymbol || null;
}

// Get balance for a custom token
export async function getCustomTokenBalance(
  walletAddress: string,
  contractAddress: string,
  chainType: 'evm' | 'tron',
  evmChainId: number,
  rpcUrl: string,
  decimals: number
): Promise<string> {
  if (chainType === 'tron') {
    return await getTrc20TokenBalance(walletAddress, contractAddress, decimals);
  } else {
    return await getEvmTokenBalance(walletAddress, contractAddress, evmChainId, decimals, rpcUrl);
  }
}
