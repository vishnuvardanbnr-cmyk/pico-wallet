const DB_NAME = "SecureVaultDB";
const DB_VERSION = 1;

export interface StoredWallet {
  id: string;
  address: string;
  chainId: string;
  chainName: string;
  chainSymbol: string;
  balance: string;
  path: string;
  lastUpdated: string;
  accountIndex: number; // Wallet index for multi-wallet support
  label?: string; // Optional user-defined label
  walletGroupId?: string; // Unique ID for independent seed group (undefined = uses primary seed)
}

// Encrypted seed storage for each wallet group (independent seeds)
export interface StoredWalletSeed {
  walletGroupId: string;
  encryptedSeed: string;
  pinHash: string;
  pinSalt: string;
  createdAt: string;
}

export interface StoredTransaction {
  id: string;
  walletId: string;
  chainId: string;
  type: "send" | "receive";
  status: "pending" | "confirmed" | "failed";
  amount: string;
  tokenSymbol: string;
  toAddress: string;
  fromAddress: string;
  txHash?: string;
  gasUsed?: string;
  timestamp: string;
}

export interface WalletProfile {
  id: string;
  name: string;
  createdAt: string;
  wallets: StoredWallet[];
  lastAccessed: string;
}

export interface CustomToken {
  id: string;
  chainId: string;
  chainType: 'evm' | 'tron';
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  evmChainId?: number;
  rpcUrl?: string;
  image?: string; // Optional token logo URL
  addedAt: string;
  walletId: string; // Required - token is associated with specific wallet
}

export interface CustomChain {
  id: string;
  name: string;
  symbol: string;
  rpcUrl: string;
  chainId: number;
  blockExplorer?: string;
  decimals: number;
  iconColor?: string;
  addedAt: string;
}

export interface CachedBalance {
  address: string;
  chainSymbol: string;
  chainId: number;
  balance: string;
  timestamp: number;
  isStale?: boolean;
}

export interface BalanceCacheEntry {
  balances: Record<string, CachedBalance>;
  lastFullRefresh: number;
}

class ClientStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains("profiles")) {
          const profileStore = db.createObjectStore("profiles", { keyPath: "id" });
          profileStore.createIndex("name", "name", { unique: false });
        }

        if (!db.objectStoreNames.contains("wallets")) {
          const walletStore = db.createObjectStore("wallets", { keyPath: "id" });
          walletStore.createIndex("address", "address", { unique: false });
          walletStore.createIndex("chainId", "chainId", { unique: false });
        }

        if (!db.objectStoreNames.contains("transactions")) {
          const txStore = db.createObjectStore("transactions", { keyPath: "id" });
          txStore.createIndex("walletId", "walletId", { unique: false });
          txStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode = "readonly"): IDBObjectStore {
    if (!this.db) throw new Error("Database not initialized");
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async saveProfile(profile: WalletProfile): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("profiles", "readwrite");
      const request = store.put(profile);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getProfile(id: string): Promise<WalletProfile | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("profiles");
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getAllProfiles(): Promise<WalletProfile[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("profiles");
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteProfile(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("profiles", "readwrite");
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveWallet(wallet: StoredWallet): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("wallets", "readwrite");
      const request = store.put(wallet);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getWallet(id: string): Promise<StoredWallet | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("wallets");
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getWalletsByAddress(address: string): Promise<StoredWallet[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("wallets");
      const index = store.index("address");
      const request = index.getAll(address);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllWallets(): Promise<StoredWallet[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("wallets");
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteWallet(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("wallets", "readwrite");
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveTransaction(tx: StoredTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("transactions", "readwrite");
      const request = store.put(tx);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getTransactionsByWallet(walletId: string): Promise<StoredTransaction[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("transactions");
      const index = store.index("walletId");
      const request = index.getAll(walletId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllTransactions(): Promise<StoredTransaction[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("transactions");
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("transactions", "readwrite");
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteTransactionsByWallet(walletId: string): Promise<void> {
    const transactions = await this.getTransactionsByWallet(walletId);
    for (const tx of transactions) {
      await this.deleteTransaction(tx.id);
    }
  }

  async saveSetting(key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("settings", "readwrite");
      const request = store.put({ key, value });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSetting<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("settings");
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value || null);
    });
  }

  async deleteSetting(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore("settings", "readwrite");
      const request = store.delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearAll(): Promise<void> {
    const stores = ["profiles", "wallets", "transactions", "settings"];
    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const store = this.getStore(storeName, "readwrite");
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }
  }

  // Enabled assets management - stores Set of asset IDs that are enabled
  private readonly ENABLED_ASSETS_KEY = "enabledAssets";

  async getEnabledAssets(): Promise<Set<string>> {
    const stored = await this.getSetting<string[]>(this.ENABLED_ASSETS_KEY);
    if (stored && Array.isArray(stored)) {
      return new Set(stored);
    }
    return new Set(); // Empty means use defaults (all enabled)
  }

  async setEnabledAssets(assetIds: Set<string>): Promise<void> {
    await this.saveSetting(this.ENABLED_ASSETS_KEY, Array.from(assetIds));
  }

  async toggleAsset(assetId: string, enabled: boolean): Promise<Set<string>> {
    const current = await this.getEnabledAssets();
    if (enabled) {
      current.add(assetId);
    } else {
      current.delete(assetId);
    }
    await this.setEnabledAssets(current);
    return current;
  }

  async isAssetEnabled(assetId: string): Promise<boolean> {
    const enabled = await this.getEnabledAssets();
    // If no preferences saved yet, all are enabled by default
    if (enabled.size === 0) {
      return true;
    }
    return enabled.has(assetId);
  }

  async hasEnabledAssetsPreference(): Promise<boolean> {
    const stored = await this.getSetting<string[]>(this.ENABLED_ASSETS_KEY);
    return stored !== null && Array.isArray(stored);
  }

  // Mode-specific wallet setup tracking
  private readonly SOFT_WALLET_SETUP_KEY = "softWalletSetup";
  private readonly HARD_WALLET_SETUP_KEY = "hardWalletSetup";
  private readonly SOFT_WALLET_DATA_KEY = "softWalletData";
  private readonly HARD_WALLET_DATA_KEY = "hardWalletData";

  async isSoftWalletSetup(): Promise<boolean> {
    const stored = await this.getSetting<boolean>(this.SOFT_WALLET_SETUP_KEY);
    return stored === true;
  }

  async isHardWalletSetup(): Promise<boolean> {
    const stored = await this.getSetting<boolean>(this.HARD_WALLET_SETUP_KEY);
    return stored === true;
  }

  async setSoftWalletSetup(isSetup: boolean): Promise<void> {
    await this.saveSetting(this.SOFT_WALLET_SETUP_KEY, isSetup);
  }

  async setHardWalletSetup(isSetup: boolean): Promise<void> {
    await this.saveSetting(this.HARD_WALLET_SETUP_KEY, isSetup);
  }

  async saveSoftWalletData(wallets: StoredWallet[]): Promise<void> {
    await this.saveSetting(this.SOFT_WALLET_DATA_KEY, wallets);
  }

  async saveHardWalletData(wallets: StoredWallet[]): Promise<void> {
    await this.saveSetting(this.HARD_WALLET_DATA_KEY, wallets);
  }

  async getSoftWalletData(): Promise<StoredWallet[]> {
    const stored = await this.getSetting<StoredWallet[]>(this.SOFT_WALLET_DATA_KEY);
    return stored || [];
  }

  async getHardWalletData(): Promise<StoredWallet[]> {
    const stored = await this.getSetting<StoredWallet[]>(this.HARD_WALLET_DATA_KEY);
    return stored || [];
  }

  async clearSoftWallet(): Promise<void> {
    await this.deleteSetting(this.SOFT_WALLET_SETUP_KEY);
    await this.deleteSetting(this.SOFT_WALLET_DATA_KEY);
  }

  async clearHardWallet(): Promise<void> {
    await this.deleteSetting(this.HARD_WALLET_SETUP_KEY);
    await this.deleteSetting(this.HARD_WALLET_DATA_KEY);
    await this.clearHardWalletEncryptedSeed();
  }

  // Encrypted seed phrase storage for soft wallet (like MetaMask/Trust Wallet)
  private readonly SOFT_WALLET_ENCRYPTED_SEED_KEY = "softWalletEncryptedSeed";
  private readonly SOFT_WALLET_PIN_HASH_KEY = "softWalletPinHash";
  private readonly SOFT_WALLET_PIN_SALT_KEY = "softWalletPinSalt";

  async saveEncryptedSeed(encryptedSeed: string, pinHash: string, pinSalt: string): Promise<void> {
    await this.saveSetting(this.SOFT_WALLET_ENCRYPTED_SEED_KEY, encryptedSeed);
    await this.saveSetting(this.SOFT_WALLET_PIN_HASH_KEY, pinHash);
    await this.saveSetting(this.SOFT_WALLET_PIN_SALT_KEY, pinSalt);
  }

  async getEncryptedSeed(): Promise<string | null> {
    return await this.getSetting<string>(this.SOFT_WALLET_ENCRYPTED_SEED_KEY);
  }

  async getPinHash(): Promise<string | null> {
    return await this.getSetting<string>(this.SOFT_WALLET_PIN_HASH_KEY);
  }

  async getPinSalt(): Promise<string | null> {
    return await this.getSetting<string>(this.SOFT_WALLET_PIN_SALT_KEY);
  }

  async hasEncryptedSeed(): Promise<boolean> {
    const seed = await this.getEncryptedSeed();
    return seed !== null && seed.length > 0;
  }

  async clearEncryptedSeed(): Promise<void> {
    await this.deleteSetting(this.SOFT_WALLET_ENCRYPTED_SEED_KEY);
    await this.deleteSetting(this.SOFT_WALLET_PIN_HASH_KEY);
    await this.deleteSetting(this.SOFT_WALLET_PIN_SALT_KEY);
  }

  // Encrypted seed phrase storage for hardware wallet (simulated mode)
  private readonly HARD_WALLET_ENCRYPTED_SEED_KEY = "hardWalletEncryptedSeed";
  private readonly HARD_WALLET_PIN_HASH_KEY = "hardWalletPinHash";
  private readonly HARD_WALLET_PIN_SALT_KEY = "hardWalletPinSalt";

  async saveHardWalletEncryptedSeed(encryptedSeed: string, pinHash: string, pinSalt: string): Promise<void> {
    await this.saveSetting(this.HARD_WALLET_ENCRYPTED_SEED_KEY, encryptedSeed);
    await this.saveSetting(this.HARD_WALLET_PIN_HASH_KEY, pinHash);
    await this.saveSetting(this.HARD_WALLET_PIN_SALT_KEY, pinSalt);
  }

  async getHardWalletEncryptedSeed(): Promise<string | null> {
    return await this.getSetting<string>(this.HARD_WALLET_ENCRYPTED_SEED_KEY);
  }

  async getHardWalletPinHash(): Promise<string | null> {
    return await this.getSetting<string>(this.HARD_WALLET_PIN_HASH_KEY);
  }

  async getHardWalletPinSalt(): Promise<string | null> {
    return await this.getSetting<string>(this.HARD_WALLET_PIN_SALT_KEY);
  }

  async hasHardWalletEncryptedSeed(): Promise<boolean> {
    const seed = await this.getHardWalletEncryptedSeed();
    return seed !== null && seed.length > 0;
  }

  async clearHardWalletEncryptedSeed(): Promise<void> {
    await this.deleteSetting(this.HARD_WALLET_ENCRYPTED_SEED_KEY);
    await this.deleteSetting(this.HARD_WALLET_PIN_HASH_KEY);
    await this.deleteSetting(this.HARD_WALLET_PIN_SALT_KEY);
  }

  // Hardware wallet chain preferences (fallback storage when device doesn't support it)
  private readonly HARD_WALLET_CHAIN_PREFS_KEY = "hardWalletChainPreferences";

  async saveHardWalletChainPreferences(chains: { symbol: string; accountIndex: number; label?: string }[]): Promise<void> {
    await this.saveSetting(this.HARD_WALLET_CHAIN_PREFS_KEY, chains);
  }

  async getHardWalletChainPreferences(): Promise<{ symbol: string; accountIndex: number; label?: string }[] | null> {
    return await this.getSetting<{ symbol: string; accountIndex: number; label?: string }[]>(this.HARD_WALLET_CHAIN_PREFS_KEY);
  }

  async clearHardWalletChainPreferences(): Promise<void> {
    await this.deleteSetting(this.HARD_WALLET_CHAIN_PREFS_KEY);
  }

  // Get the next available account index for creating additional wallets
  getNextAccountIndex(wallets: StoredWallet[]): number {
    if (wallets.length === 0) return 0;
    const maxIndex = Math.max(...wallets.map(w => w.accountIndex ?? 0));
    return maxIndex + 1;
  }

  // Multiple wallet seed storage (independent seeds per wallet group)
  private readonly WALLET_SEEDS_KEY = "walletSeeds";

  async saveWalletSeed(seed: StoredWalletSeed): Promise<void> {
    const seeds = await this.getAllWalletSeeds();
    const existingIndex = seeds.findIndex(s => s.walletGroupId === seed.walletGroupId);
    if (existingIndex >= 0) {
      seeds[existingIndex] = seed;
    } else {
      seeds.push(seed);
    }
    await this.saveSetting(this.WALLET_SEEDS_KEY, seeds);
  }

  async getWalletSeed(walletGroupId: string): Promise<StoredWalletSeed | null> {
    const seeds = await this.getAllWalletSeeds();
    return seeds.find(s => s.walletGroupId === walletGroupId) || null;
  }

  async getAllWalletSeeds(): Promise<StoredWalletSeed[]> {
    const stored = await this.getSetting<StoredWalletSeed[]>(this.WALLET_SEEDS_KEY);
    return stored || [];
  }

  async deleteWalletSeed(walletGroupId: string): Promise<void> {
    const seeds = await this.getAllWalletSeeds();
    const filtered = seeds.filter(s => s.walletGroupId !== walletGroupId);
    await this.saveSetting(this.WALLET_SEEDS_KEY, filtered);
  }

  async clearAllWalletSeeds(): Promise<void> {
    await this.deleteSetting(this.WALLET_SEEDS_KEY);
  }

  // Custom token management
  private readonly CUSTOM_TOKENS_KEY = "customTokens";

  async getCustomTokens(): Promise<CustomToken[]> {
    const stored = await this.getSetting<CustomToken[]>(this.CUSTOM_TOKENS_KEY);
    return stored || [];
  }

  async addCustomToken(token: Omit<CustomToken, 'id' | 'addedAt'>): Promise<CustomToken> {
    const tokens = await this.getCustomTokens();
    // Include walletId in the token ID to make tokens wallet-specific
    const newToken: CustomToken = {
      ...token,
      id: `custom-${token.walletId}-${token.chainId}-${token.contractAddress.toLowerCase()}`,
      addedAt: new Date().toISOString(),
    };
    
    const existingIndex = tokens.findIndex(t => t.id === newToken.id);
    if (existingIndex >= 0) {
      tokens[existingIndex] = newToken;
    } else {
      tokens.push(newToken);
    }
    
    await this.saveSetting(this.CUSTOM_TOKENS_KEY, tokens);
    return newToken;
  }

  async removeCustomToken(id: string): Promise<void> {
    const tokens = await this.getCustomTokens();
    const filtered = tokens.filter(t => t.id !== id);
    await this.saveSetting(this.CUSTOM_TOKENS_KEY, filtered);
  }

  async getCustomToken(id: string): Promise<CustomToken | null> {
    const tokens = await this.getCustomTokens();
    return tokens.find(t => t.id === id) || null;
  }

  async clearAllCustomTokens(): Promise<void> {
    await this.deleteSetting(this.CUSTOM_TOKENS_KEY);
  }

  // Custom chain management
  private readonly CUSTOM_CHAINS_KEY = "customChains";

  async getCustomChains(): Promise<CustomChain[]> {
    const stored = await this.getSetting<CustomChain[]>(this.CUSTOM_CHAINS_KEY);
    return stored || [];
  }

  async addCustomChain(chain: Omit<CustomChain, 'id' | 'addedAt'>): Promise<CustomChain> {
    const chains = await this.getCustomChains();
    const newChain: CustomChain = {
      ...chain,
      id: `custom-chain-${chain.chainId}`,
      addedAt: new Date().toISOString(),
    };
    
    const existingIndex = chains.findIndex(c => c.id === newChain.id);
    if (existingIndex >= 0) {
      chains[existingIndex] = newChain;
    } else {
      chains.push(newChain);
    }
    
    await this.saveSetting(this.CUSTOM_CHAINS_KEY, chains);
    return newChain;
  }

  async removeCustomChain(id: string): Promise<void> {
    const chains = await this.getCustomChains();
    const filtered = chains.filter(c => c.id !== id);
    await this.saveSetting(this.CUSTOM_CHAINS_KEY, filtered);
  }

  async getCustomChain(id: string): Promise<CustomChain | null> {
    const chains = await this.getCustomChains();
    return chains.find(c => c.id === id) || null;
  }

  async clearAllCustomChains(): Promise<void> {
    await this.deleteSetting(this.CUSTOM_CHAINS_KEY);
  }

  private readonly BALANCE_CACHE_KEY = "balanceCache";
  private readonly CACHE_STALE_THRESHOLD = 5 * 60 * 1000;
  private readonly CACHE_EXPIRE_THRESHOLD = 30 * 60 * 1000;

  private getBalanceCacheKey(address: string, chainSymbol: string): string {
    return `${address.toLowerCase()}-${chainSymbol}`;
  }

  async getBalanceCache(): Promise<BalanceCacheEntry> {
    const stored = await this.getSetting<BalanceCacheEntry>(this.BALANCE_CACHE_KEY);
    return stored || { balances: {}, lastFullRefresh: 0 };
  }

  async getCachedBalance(address: string, chainSymbol: string): Promise<CachedBalance | null> {
    const cache = await this.getBalanceCache();
    const key = this.getBalanceCacheKey(address, chainSymbol);
    const entry = cache.balances[key];
    
    if (!entry) return null;
    
    const now = Date.now();
    const age = now - entry.timestamp;
    
    if (age > this.CACHE_EXPIRE_THRESHOLD) {
      return null;
    }
    
    return {
      ...entry,
      isStale: age > this.CACHE_STALE_THRESHOLD,
    };
  }

  async setCachedBalance(address: string, chainSymbol: string, chainId: number, balance: string): Promise<void> {
    const cache = await this.getBalanceCache();
    const key = this.getBalanceCacheKey(address, chainSymbol);
    
    cache.balances[key] = {
      address: address.toLowerCase(),
      chainSymbol,
      chainId,
      balance,
      timestamp: Date.now(),
    };
    
    await this.saveSetting(this.BALANCE_CACHE_KEY, cache);
  }

  async setCachedBalances(balances: Array<{ address: string; chainSymbol: string; chainId: number; balance: string }>): Promise<void> {
    const cache = await this.getBalanceCache();
    const now = Date.now();
    
    for (const b of balances) {
      const key = this.getBalanceCacheKey(b.address, b.chainSymbol);
      cache.balances[key] = {
        address: b.address.toLowerCase(),
        chainSymbol: b.chainSymbol,
        chainId: b.chainId,
        balance: b.balance,
        timestamp: now,
      };
    }
    
    cache.lastFullRefresh = now;
    await this.saveSetting(this.BALANCE_CACHE_KEY, cache);
  }

  async getAllCachedBalances(): Promise<CachedBalance[]> {
    const cache = await this.getBalanceCache();
    const now = Date.now();
    
    return Object.values(cache.balances).map(entry => ({
      ...entry,
      isStale: (now - entry.timestamp) > this.CACHE_STALE_THRESHOLD,
    })).filter(entry => (now - entry.timestamp) <= this.CACHE_EXPIRE_THRESHOLD);
  }

  async getLastFullRefresh(): Promise<number> {
    const cache = await this.getBalanceCache();
    return cache.lastFullRefresh;
  }

  async clearBalanceCache(): Promise<void> {
    await this.deleteSetting(this.BALANCE_CACHE_KEY);
  }

  isCacheStale(timestamp: number): boolean {
    return (Date.now() - timestamp) > this.CACHE_STALE_THRESHOLD;
  }

  getCacheAge(timestamp: number): string {
    const age = Date.now() - timestamp;
    const minutes = Math.floor(age / 60000);
    if (minutes < 1) return "just now";
    if (minutes === 1) return "1 min ago";
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return "1 hour ago";
    return `${hours} hours ago`;
  }
}

export const clientStorage = new ClientStorage();
