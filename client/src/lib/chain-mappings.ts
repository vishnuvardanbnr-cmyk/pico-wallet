// Maps CoinGecko asset IDs to their chain symbols
// Used for both native assets and tokens to determine which chain they belong to
export const COINGECKO_ID_TO_CHAIN_SYMBOL: Record<string, string> = {
  'ethereum': 'ETH',
  'matic-network': 'MATIC',
  'binancecoin': 'BNB',
  'avalanche-2': 'AVAX',
  'arbitrum': 'ARB',
  'bitcoin': 'BTC',
  'solana': 'SOL',
  'ripple': 'XRP',
  'dogecoin': 'DOGE',
  'cardano': 'ADA',
  'tron': 'TRX',
  'polkadot': 'DOT',
  'litecoin': 'LTC',
  'bitcoin-cash': 'BCH',
  'cosmos': 'ATOM',
  'osmosis': 'OSMO',
  'tether': 'ETH',
  'usd-coin': 'ETH',
  'staked-ether': 'ETH',
  'chainlink': 'ETH',
  'wrapped-bitcoin': 'ETH',
  'uniswap': 'ETH',
  'shiba-inu': 'ETH',
  'aave': 'ETH',
  'maker': 'ETH',
  'the-graph': 'ETH',
  'compound-governance-token': 'ETH',
  'yearn-finance': 'ETH',
  'sushi': 'ETH',
  'curve-dao-token': 'ETH',
  '1inch': 'ETH',
  'ens': 'ETH',
  'lido-dao': 'ETH',
  'rocket-pool': 'ETH',
  'frax': 'ETH',
  'dai': 'ETH',
  'pancakeswap-token': 'BNB',
  'venus': 'BNB',
  'baby-doge-coin': 'BNB',
  'trust-wallet-token': 'BNB',
  'wbnb': 'BNB',
  'floki': 'BNB',
  'safemoon-2': 'BNB',
  'alpaca-finance': 'BNB',
  'biswap': 'BNB',
  'raydium': 'SOL',
  'bonk': 'SOL',
  'jupiter-exchange-solana': 'SOL',
  'jito-governance-token': 'SOL',
  'trader-joe': 'AVAX',
  'benqi': 'AVAX',
  'gmx': 'ARB',
  'magic': 'ARB',
  'optimism': 'OP',
  'tether-bsc': 'BNB',
  'tether-tron': 'TRX',
  'usd-coin-bsc': 'BNB',
  'usd-coin-tron': 'TRX',
};

// Maps token IDs to parent chain SYMBOL for wallet address lookup
export const TOKEN_PARENT_CHAIN_SYMBOL: Record<string, string> = {
  'tether': 'ETH',
  'tether-bsc': 'BNB',
  'tether-tron': 'TRX',
  'usd-coin': 'ETH',
  'usd-coin-bsc': 'BNB',
  'usd-coin-tron': 'TRX',
  'staked-ether': 'ETH',
  'chainlink': 'ETH',
  'wrapped-bitcoin': 'ETH',
  'uniswap': 'ETH',
  'shiba-inu': 'ETH',
  'aave': 'ETH',
  'maker': 'ETH',
  'the-graph': 'ETH',
  'dai': 'ETH',
  'pancakeswap-token': 'BNB',
  'venus': 'BNB',
  'trust-wallet-token': 'BNB',
  'binance-usd': 'BNB',
  'first-digital-usd': 'BNB',
  'wrapped-bitcoin-bsc': 'BNB',
  'wrapped-ethereum-bsc': 'BNB',
  'baby-doge-coin': 'BNB',
  'wbnb': 'BNB',
  'floki': 'BNB',
  'safemoon-2': 'BNB',
  'alpaca-finance': 'BNB',
  'biswap': 'BNB',
  'raydium': 'SOL',
  'bonk': 'SOL',
  'jupiter-exchange-solana': 'SOL',
  'jito-governance-token': 'SOL',
  'trader-joe': 'AVAX',
  'benqi': 'AVAX',
  'gmx': 'ARB',
  'magic': 'ARB',
  'optimism': 'OP',
};

// Maps token IDs to parent chain NAME for display purposes
export const TOKEN_PARENT_CHAIN: Record<string, string> = {
  'tether': 'Ethereum',
  'tether-bsc': 'BNB Smart Chain',
  'tether-tron': 'TRON',
  'usd-coin': 'Ethereum',
  'usd-coin-bsc': 'BNB Smart Chain',
  'usd-coin-tron': 'TRON',
  'staked-ether': 'Ethereum',
  'chainlink': 'Ethereum',
  'wrapped-bitcoin': 'Ethereum',
  'uniswap': 'Ethereum',
  'shiba-inu': 'Ethereum',
  'aave': 'Ethereum',
  'maker': 'Ethereum',
  'the-graph': 'Ethereum',
  'dai': 'Ethereum',
  'pancakeswap-token': 'BNB Smart Chain',
  'venus': 'BNB Smart Chain',
  'trust-wallet-token': 'BNB Smart Chain',
  'binance-usd': 'BNB Smart Chain',
  'first-digital-usd': 'BNB Smart Chain',
  'wrapped-bitcoin-bsc': 'BNB Smart Chain',
  'wrapped-ethereum-bsc': 'BNB Smart Chain',
  'baby-doge-coin': 'BNB Smart Chain',
  'wbnb': 'BNB Smart Chain',
  'floki': 'BNB Smart Chain',
  'safemoon-2': 'BNB Smart Chain',
  'alpaca-finance': 'BNB Smart Chain',
  'biswap': 'BNB Smart Chain',
  'raydium': 'Solana',
  'bonk': 'Solana',
  'jupiter-exchange-solana': 'Solana',
  'jito-governance-token': 'Solana',
  'trader-joe': 'Avalanche',
  'benqi': 'Avalanche',
  'gmx': 'Arbitrum',
  'magic': 'Arbitrum',
  'optimism': 'Optimism',
};

/**
 * Computes the set of chain symbols that should have their balances fetched
 * based on enabled asset IDs. This includes:
 * - Native assets (e.g., 'ethereum' -> 'ETH')
 * - Parent chains of enabled tokens (e.g., 'tether-tron' -> 'TRX')
 */
export function getEnabledChainSymbols(enabledAssetIds: Set<string>): Set<string> {
  const chainSymbols = new Set<string>();
  
  Array.from(enabledAssetIds).forEach(assetId => {
    // Check if it's a token with a parent chain
    const parentSymbol = TOKEN_PARENT_CHAIN_SYMBOL[assetId];
    if (parentSymbol) {
      chainSymbols.add(parentSymbol);
    } else {
      // Check if it's a native asset
      const nativeSymbol = COINGECKO_ID_TO_CHAIN_SYMBOL[assetId];
      if (nativeSymbol) {
        chainSymbols.add(nativeSymbol);
      }
    }
  });
  
  return chainSymbols;
}
