import { CryptoAsset, FALLBACK_TOP_ASSETS } from "@shared/schema";

const FALLBACK_PRICES: Record<string, number> = {
  ETH: 3500,
  BNB: 600,
  MATIC: 0.85,
  AVAX: 35,
  ARB: 1.2,
  BTC: 100000,
  SOL: 180,
  XRP: 2.2,
  DOGE: 0.35,
  ADA: 0.95,
  TRX: 0.25,
  DOT: 7.5,
  LTC: 105,
  BCH: 450,
  OP: 2.5,
  USDT: 1,
  USDC: 1,
};

const DEFILLAMA_IDS: Record<string, string> = {
  ETH: "coingecko:ethereum",
  BNB: "coingecko:binancecoin",
  MATIC: "coingecko:matic-network",
  AVAX: "coingecko:avalanche-2",
  ARB: "coingecko:arbitrum",
  BTC: "coingecko:bitcoin",
  SOL: "coingecko:solana",
  XRP: "coingecko:ripple",
  DOGE: "coingecko:dogecoin",
  ADA: "coingecko:cardano",
  TRX: "coingecko:tron",
  DOT: "coingecko:polkadot",
  LTC: "coingecko:litecoin",
  BCH: "coingecko:bitcoin-cash",
  OP: "coingecko:optimism",
  USDT: "coingecko:tether",
  USDC: "coingecko:usd-coin",
};

export interface PriceData {
  [symbol: string]: number;
}

let cachedPrices: PriceData = { ...FALLBACK_PRICES };
let lastFetchTime = 0;
const CACHE_DURATION = 30000;

async function fetchFromDefiLlama(): Promise<PriceData | null> {
  try {
    const coins = Object.values(DEFILLAMA_IDS).join(",");
    const response = await fetch(
      `https://coins.llama.fi/prices/current/${coins}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const prices: PriceData = {};

    for (const [symbol, coinId] of Object.entries(DEFILLAMA_IDS)) {
      const coinData = data.coins?.[coinId];
      if (coinData?.price) {
        prices[symbol] = coinData.price;
      }
    }

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

export async function fetchPrices(): Promise<PriceData> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_DURATION && Object.keys(cachedPrices).length > 0) {
    return cachedPrices;
  }

  const prices = await fetchFromDefiLlama();

  if (prices && Object.keys(prices).length > 0) {
    cachedPrices = { ...FALLBACK_PRICES, ...prices };
    lastFetchTime = now;
    return cachedPrices;
  }

  return cachedPrices;
}

export function formatUSD(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(2)}K`;
  }
  // Check if it's a round number (no decimal part)
  if (Number.isInteger(amount) && amount >= 1) {
    return `$${amount.toFixed(0)}`;
  }
  if (amount >= 1) {
    return `$${amount.toFixed(2)}`;
  }
  if (amount >= 0.01) {
    return `$${amount.toFixed(2)}`;
  }
  if (amount > 0) {
    return `$${amount.toFixed(4)}`;
  }
  return "$0.00";
}

// Format crypto balance with smart decimal handling
// - Zero: shows "0.00"
// - Round numbers: no decimals (e.g., 5 instead of 5.00)
// - Small amounts: shows more decimals (up to 4-6 based on size)
// - Normal amounts: shows 2-4 decimals based on size
export function formatCryptoBalance(balance: string | number): string {
  const num = typeof balance === 'string' ? parseFloat(balance) : balance;
  
  if (isNaN(num) || num === 0) {
    return "0.00";
  }
  
  // For very large numbers
  if (num >= 1000000) {
    const formatted = num / 1000000;
    return Number.isInteger(formatted) ? `${formatted.toFixed(0)}M` : `${formatted.toFixed(2)}M`;
  }
  if (num >= 1000) {
    const formatted = num / 1000;
    return Number.isInteger(formatted) ? `${formatted.toFixed(0)}K` : `${formatted.toFixed(2)}K`;
  }
  
  // Check if it's a round number (no significant decimal part)
  if (Number.isInteger(num)) {
    return num.toString();
  }
  
  // For amounts >= 100, show 2 decimals
  if (num >= 100) {
    const fixed = num.toFixed(2);
    // Remove trailing zeros but keep at least 2 decimal places for non-round numbers
    return parseFloat(fixed).toString();
  }
  
  // For amounts >= 1, show 4 decimals
  if (num >= 1) {
    const fixed = num.toFixed(4);
    return parseFloat(fixed).toString();
  }
  
  // For amounts >= 0.01, show 4 decimals
  if (num >= 0.01) {
    const fixed = num.toFixed(4);
    return parseFloat(fixed).toString();
  }
  
  // For very small amounts, show up to 6 decimals
  if (num >= 0.000001) {
    const fixed = num.toFixed(6);
    return parseFloat(fixed).toString();
  }
  
  // For extremely small amounts
  return "<0.000001";
}

export function calculateUSDValue(balance: string, symbol: string, prices: PriceData): number {
  const numBalance = parseFloat(balance);
  if (isNaN(numBalance) || !prices[symbol]) {
    return 0;
  }
  return numBalance * prices[symbol];
}

export interface TopAsset extends CryptoAsset {
  currentPrice: number;
  priceChangePercentage24h: number;
  image: string;
}

let cachedTopAssets: TopAsset[] = [];
let lastTopAssetsFetchTime = 0;
const TOP_ASSETS_CACHE_DURATION = 5 * 60 * 1000;

export async function fetchTopAssets(limit: number = 50): Promise<TopAsset[]> {
  const now = Date.now();
  if (now - lastTopAssetsFetchTime < TOP_ASSETS_CACHE_DURATION && cachedTopAssets.length > 0) {
    return cachedTopAssets.slice(0, limit);
  }

  // Use DefiLlama for prices (CORS-enabled) combined with fallback asset list
  try {
    const prices = await fetchPrices();
    
    const assets: TopAsset[] = FALLBACK_TOP_ASSETS.slice(0, limit).map((asset) => ({
      ...asset,
      currentPrice: prices[asset.symbol] || FALLBACK_PRICES[asset.symbol] || 0,
      priceChangePercentage24h: 0,
      image: asset.image || "",
    }));
    cachedTopAssets = assets;
    lastTopAssetsFetchTime = now;
    return assets;
  } catch {
    return getFallbackTopAssets(limit);
  }
}

function getFallbackTopAssets(limit: number): TopAsset[] {
  if (cachedTopAssets.length > 0) {
    return cachedTopAssets.slice(0, limit);
  }

  const fallbackPrices: Record<string, number> = {
    BTC: 100000,
    ETH: 3500,
    USDT: 1,
    BNB: 600,
    SOL: 180,
    USDC: 1,
    XRP: 2.2,
    STETH: 3500,
    DOGE: 0.35,
    ADA: 0.95,
    TRX: 0.25,
    AVAX: 35,
    SHIB: 0.000025,
    LINK: 22,
    WBTC: 100000,
    DOT: 7.5,
    BCH: 450,
    MATIC: 0.85,
    LTC: 105,
    UNI: 13,
  };

  return FALLBACK_TOP_ASSETS.map((asset) => ({
    ...asset,
    currentPrice: fallbackPrices[asset.symbol] || 0,
    priceChangePercentage24h: 0,
    image: asset.image || "",
  }));
}
