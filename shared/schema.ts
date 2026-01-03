import { z } from "zod";

// Hardware Device - represents the simulated hardware wallet
export const hardwareDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  pinHash: z.string(), // Encrypted PIN stored in "hardware"
  pinLength: z.number().min(4).max(6),
  seedPhrase: z.string(), // Encrypted seed phrase
  isConnected: z.boolean(),
  lastConnected: z.string().optional(),
  createdAt: z.string(),
});

export type HardwareDevice = z.infer<typeof hardwareDeviceSchema>;

export const insertHardwareDeviceSchema = hardwareDeviceSchema.omit({
  id: true,
  createdAt: true,
});

export type InsertHardwareDevice = z.infer<typeof insertHardwareDeviceSchema>;

// Blockchain Chain
export const chainSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  rpcUrl: z.string(),
  chainId: z.number(),
  blockExplorer: z.string().optional(),
  iconColor: z.string(), // For UI display
  isDefault: z.boolean(),
  decimals: z.number().default(18),
});

export type Chain = z.infer<typeof chainSchema>;

export const insertChainSchema = chainSchema.omit({
  id: true,
});

export type InsertChain = z.infer<typeof insertChainSchema>;

// Token (ERC-20, BEP-20, etc.)
export const tokenSchema = z.object({
  id: z.string(),
  chainId: z.string(),
  name: z.string(),
  symbol: z.string(),
  contractAddress: z.string(),
  decimals: z.number().default(18),
  iconColor: z.string().optional(),
});

export type Token = z.infer<typeof tokenSchema>;

export const insertTokenSchema = tokenSchema.omit({
  id: true,
});

export type InsertToken = z.infer<typeof insertTokenSchema>;

// Wallet - supports multiple wallets per chain via accountIndex
export const walletSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  chainId: z.string(),
  address: z.string(),
  balance: z.string(), // Stored as string for precision
  isActive: z.boolean(),
  accountIndex: z.number().default(0), // BIP44 account index for multi-wallet support
  label: z.string().optional(), // Optional user-defined label
  walletGroupId: z.string().optional(), // Unique ID for independent seed group (undefined = uses primary seed)
});

export type Wallet = z.infer<typeof walletSchema>;

export const insertWalletSchema = walletSchema.omit({
  id: true,
});

export type InsertWallet = z.infer<typeof insertWalletSchema>;

// Transaction
export const transactionSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  chainId: z.string(),
  type: z.enum(["send", "receive"]),
  status: z.enum(["pending", "confirmed", "failed"]),
  amount: z.string(),
  tokenSymbol: z.string(),
  toAddress: z.string(),
  fromAddress: z.string(),
  txHash: z.string().optional(),
  gasUsed: z.string().optional(),
  timestamp: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;

export const insertTransactionSchema = transactionSchema.omit({
  id: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

// PIN verification request
export const pinVerifySchema = z.object({
  deviceId: z.string(),
  pin: z.string().min(4).max(6),
});

export type PinVerify = z.infer<typeof pinVerifySchema>;

// Send transaction request
export const sendTransactionSchema = z.object({
  deviceId: z.string(),
  walletId: z.string(),
  toAddress: z.string(),
  amount: z.string(),
  tokenSymbol: z.string().optional(),
  pin: z.string().min(4).max(6),
});

export type SendTransaction = z.infer<typeof sendTransactionSchema>;

// Session state
export const sessionSchema = z.object({
  deviceId: z.string().optional(),
  isUnlocked: z.boolean(),
  unlockExpiry: z.string().optional(),
});

export type Session = z.infer<typeof sessionSchema>;

// Default chains for the wallet
export const DEFAULT_CHAINS: Omit<Chain, "id">[] = [
  {
    name: "Ethereum",
    symbol: "ETH",
    rpcUrl: "https://eth.llamarpc.com",
    chainId: 1,
    blockExplorer: "https://etherscan.io",
    iconColor: "#627EEA",
    isDefault: true,
    decimals: 18,
  },
  {
    name: "Bitcoin",
    symbol: "BTC",
    rpcUrl: "",
    chainId: 0,
    blockExplorer: "https://blockchain.com",
    iconColor: "#F7931A",
    isDefault: true,
    decimals: 8,
  },
  {
    name: "BNB Smart Chain",
    symbol: "BNB",
    rpcUrl: "https://bsc-dataseed.binance.org",
    chainId: 56,
    blockExplorer: "https://bscscan.com",
    iconColor: "#F3BA2F",
    isDefault: true,
    decimals: 18,
  },
  {
    name: "Polygon",
    symbol: "MATIC",
    rpcUrl: "https://polygon-rpc.com",
    chainId: 137,
    blockExplorer: "https://polygonscan.com",
    iconColor: "#8247E5",
    isDefault: true,
    decimals: 18,
  },
  {
    name: "Avalanche",
    symbol: "AVAX",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    chainId: 43114,
    blockExplorer: "https://snowtrace.io",
    iconColor: "#E84142",
    isDefault: true,
    decimals: 18,
  },
  {
    name: "Arbitrum",
    symbol: "ARB",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    chainId: 42161,
    blockExplorer: "https://arbiscan.io",
    iconColor: "#28A0F0",
    isDefault: true,
    decimals: 18,
  },
  {
    name: "XRP",
    symbol: "XRP",
    rpcUrl: "",
    chainId: -2,
    blockExplorer: "https://xrpscan.com",
    iconColor: "#23292F",
    isDefault: true,
    decimals: 6,
  },
  {
    name: "Dogecoin",
    symbol: "DOGE",
    rpcUrl: "",
    chainId: -3,
    blockExplorer: "https://dogechain.info",
    iconColor: "#C2A633",
    isDefault: true,
    decimals: 8,
  },
  {
    name: "TRON",
    symbol: "TRX",
    rpcUrl: "",
    chainId: -5,
    blockExplorer: "https://tronscan.org",
    iconColor: "#FF0013",
    isDefault: true,
    decimals: 6,
  },
  {
    name: "Litecoin",
    symbol: "LTC",
    rpcUrl: "",
    chainId: -7,
    blockExplorer: "https://blockchair.com/litecoin",
    iconColor: "#345D9D",
    isDefault: true,
    decimals: 8,
  },
  {
    name: "Bitcoin Cash",
    symbol: "BCH",
    rpcUrl: "",
    chainId: -8,
    blockExplorer: "https://blockchair.com/bitcoin-cash",
    iconColor: "#8DC351",
    isDefault: true,
    decimals: 8,
  },
  {
    name: "Solana",
    symbol: "SOL",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    chainId: -9,
    blockExplorer: "https://solscan.io",
    iconColor: "#9945FF",
    isDefault: true,
    decimals: 9,
  },
  {
    name: "Cardano",
    symbol: "ADA",
    rpcUrl: "",
    chainId: -10,
    blockExplorer: "https://cardanoscan.io",
    iconColor: "#0033AD",
    isDefault: true,
    decimals: 6,
  },
  {
    name: "Cosmos",
    symbol: "ATOM",
    rpcUrl: "https://cosmos-rpc.polkachu.com",
    chainId: -11,
    blockExplorer: "https://www.mintscan.io/cosmos",
    iconColor: "#2E3148",
    isDefault: true,
    decimals: 6,
  },
  {
    name: "Osmosis",
    symbol: "OSMO",
    rpcUrl: "https://osmosis-rpc.polkachu.com",
    chainId: -12,
    blockExplorer: "https://www.mintscan.io/osmosis",
    iconColor: "#750BBB",
    isDefault: true,
    decimals: 6,
  },
  {
    name: "Polkadot",
    symbol: "DOT",
    rpcUrl: "https://rpc.polkadot.io",
    chainId: -13,
    blockExplorer: "https://polkadot.subscan.io",
    iconColor: "#E6007A",
    isDefault: true,
    decimals: 10,
  },
];

// Default USDT token configurations for multiple chains
export const DEFAULT_USDT_TOKENS: Omit<Token, "id">[] = [
  {
    chainId: "eth", // Will be replaced with actual chain ID
    name: "Tether USD",
    symbol: "USDT",
    contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    iconColor: "#26A17B",
  },
  {
    chainId: "bnb",
    name: "Tether USD (BSC)",
    symbol: "USDT",
    contractAddress: "0x55d398326f99059fF775485246999027B3197955",
    decimals: 18,
    iconColor: "#26A17B",
  },
  {
    chainId: "matic",
    name: "Tether USD (Polygon)",
    symbol: "USDT",
    contractAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    decimals: 6,
    iconColor: "#26A17B",
  },
  {
    chainId: "arb",
    name: "Tether USD (Arbitrum)",
    symbol: "USDT",
    contractAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    decimals: 6,
    iconColor: "#26A17B",
  },
  {
    chainId: "trx",
    name: "Tether USD (TRON)",
    symbol: "USDT",
    contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    decimals: 6,
    iconColor: "#26A17B",
  },
];

// Legacy user schema for compatibility
export const users = {
  id: "",
  username: "",
  password: "",
};

export const insertUserSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = { id: string; username: string; password: string };

// Crypto Asset - represents a coin/token for the Manage Crypto feature
export const cryptoAssetSchema = z.object({
  id: z.string(), // CoinGecko id
  symbol: z.string(),
  name: z.string(),
  image: z.string().optional(),
  currentPrice: z.number().optional(),
  marketCap: z.number().optional(),
  marketCapRank: z.number().optional(),
  priceChangePercentage24h: z.number().optional(),
});

export type CryptoAsset = z.infer<typeof cryptoAssetSchema>;

// Static fallback list of top 20 crypto assets (by market cap as of 2024)
export const FALLBACK_TOP_ASSETS: CryptoAsset[] = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", marketCapRank: 1, image: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum", marketCapRank: 2, image: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  { id: "tether", symbol: "USDT", name: "USDT (Ethereum)", marketCapRank: 3, image: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
  { id: "tether-bsc", symbol: "USDT", name: "USDT (BNB Chain)", marketCapRank: 4, image: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
  { id: "tether-tron", symbol: "USDT", name: "USDT (TRON)", marketCapRank: 5, image: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
  { id: "binancecoin", symbol: "BNB", name: "BNB", marketCapRank: 6, image: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" },
  { id: "solana", symbol: "SOL", name: "Solana", marketCapRank: 7, image: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
  { id: "usd-coin", symbol: "USDC", name: "USDC (Ethereum)", marketCapRank: 8, image: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
  { id: "usd-coin-bsc", symbol: "USDC", name: "USDC (BNB Chain)", marketCapRank: 9, image: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
  { id: "usd-coin-tron", symbol: "USDC", name: "USDC (TRON)", marketCapRank: 10, image: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
  { id: "ripple", symbol: "XRP", name: "XRP", marketCapRank: 11, image: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png" },
  { id: "staked-ether", symbol: "STETH", name: "Lido Staked Ether", marketCapRank: 12, image: "https://assets.coingecko.com/coins/images/13442/small/steth_logo.png" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", marketCapRank: 13, image: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png" },
  { id: "cardano", symbol: "ADA", name: "Cardano", marketCapRank: 14, image: "https://assets.coingecko.com/coins/images/975/small/cardano.png" },
  { id: "tron", symbol: "TRX", name: "TRON", marketCapRank: 15, image: "https://assets.coingecko.com/coins/images/1094/small/tron-logo.png" },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche", marketCapRank: 16, image: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png" },
  { id: "shiba-inu", symbol: "SHIB", name: "Shiba Inu", marketCapRank: 17, image: "https://assets.coingecko.com/coins/images/11939/small/shiba.png" },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", marketCapRank: 18, image: "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png" },
  { id: "wrapped-bitcoin", symbol: "WBTC", name: "Wrapped Bitcoin", marketCapRank: 19, image: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png" },
  { id: "polkadot", symbol: "DOT", name: "Polkadot", marketCapRank: 20, image: "https://assets.coingecko.com/coins/images/12171/small/polkadot.png" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash", marketCapRank: 21, image: "https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png" },
  { id: "matic-network", symbol: "MATIC", name: "Polygon", marketCapRank: 22, image: "https://assets.coingecko.com/coins/images/4713/small/polygon.png" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin", marketCapRank: 23, image: "https://assets.coingecko.com/coins/images/2/small/litecoin.png" },
  { id: "uniswap", symbol: "UNI", name: "Uniswap", marketCapRank: 24, image: "https://assets.coingecko.com/coins/images/12504/small/uniswap-logo.png" },
  { id: "cosmos", symbol: "ATOM", name: "Cosmos", marketCapRank: 25, image: "https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png" },
  { id: "osmosis", symbol: "OSMO", name: "Osmosis", marketCapRank: 26, image: "https://assets.coingecko.com/coins/images/16724/small/osmo.png" },
  { id: "dai", symbol: "DAI", name: "DAI", marketCapRank: 27, image: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png" },
  { id: "aave", symbol: "AAVE", name: "Aave", marketCapRank: 28, image: "https://assets.coingecko.com/coins/images/12645/small/AAVE.png" },
  { id: "maker", symbol: "MKR", name: "Maker", marketCapRank: 29, image: "https://assets.coingecko.com/coins/images/1364/small/maker.png" },
  { id: "the-graph", symbol: "GRT", name: "The Graph", marketCapRank: 30, image: "https://assets.coingecko.com/coins/images/13397/small/Graph_Token.png" },
  { id: "pancakeswap-token", symbol: "CAKE", name: "PancakeSwap", marketCapRank: 31, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/logo.png" },
  { id: "venus", symbol: "XVS", name: "Venus", marketCapRank: 32, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63/logo.png" },
  { id: "trust-wallet-token", symbol: "TWT", name: "Trust Wallet Token", marketCapRank: 33, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x4B0F1812e5Df2A09796481Ff14017e6005508003/logo.png" },
  { id: "baby-doge-coin", symbol: "BABY", name: "Baby Doge Coin", marketCapRank: 34, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0xc748673057861a797275CD8A068AbB95A902e8de/logo.png" },
  { id: "binance-usd", symbol: "BUSD", name: "BUSD (BNB Chain)", marketCapRank: 35, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56/logo.png" },
  { id: "wbnb", symbol: "WBNB", name: "Wrapped BNB", marketCapRank: 36, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c/logo.png" },
  { id: "floki", symbol: "FLOKI", name: "Floki Inu", marketCapRank: 37, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0xfb5B838b6cfEEdC2873aB27866079AC55363D37E/logo.png" },
  { id: "safemoon-2", symbol: "SFM", name: "SafeMoon", marketCapRank: 38, image: "https://assets.coingecko.com/coins/images/14362/small/174x174-white.png" },
  { id: "alpaca-finance", symbol: "ALPACA", name: "Alpaca Finance", marketCapRank: 39, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F/logo.png" },
  { id: "biswap", symbol: "BSW", name: "Biswap", marketCapRank: 40, image: "https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x965F527D9159dCe6288a2219DB51fc6Eef120dD1/logo.png" },
];
