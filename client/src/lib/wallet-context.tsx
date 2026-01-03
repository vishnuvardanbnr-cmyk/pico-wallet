import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import type { Chain, Wallet, Transaction, Token } from "@shared/schema";
import { DEFAULT_CHAINS, FALLBACK_TOP_ASSETS } from "@shared/schema";
import { hardwareWallet, type HardwareWalletState, type ConnectionStatus } from "./hardware-wallet";
import { softWallet, type SoftWalletState } from "./soft-wallet";
import { clientStorage, type StoredWallet, type StoredTransaction, type CustomToken, type CustomChain, type CachedBalance } from "./client-storage";
import { getUniversalBalance, getTokenBalanceForAsset, getCustomTokenBalance, isTokenAsset } from "./blockchain";
import { fetchAllTransactions, type ParsedTransaction } from "./explorer-service";
import { fetchTopAssets, type TopAsset } from "./price-service";
import { deriveAllAddresses, type DerivedAddress as MultiChainDerivedAddress } from "./multi-chain-address";
import { getEnabledChainSymbols } from "./chain-mappings";

interface WalletContextType {
  hardwareState: HardwareWalletState;
  isConnected: boolean;
  isUnlocked: boolean;
  hasWalletOnDevice: boolean;
  walletMode: "hard_wallet" | "soft_wallet";
  setWalletMode: (mode: "hard_wallet" | "soft_wallet") => void;
  hasSoftWalletSetup: boolean;
  hasHardWalletSetup: boolean;
  currentModeHasWallet: boolean;
  chains: Chain[];
  wallets: Wallet[];
  setWallets: (wallets: Wallet[]) => void;
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  tokens: Token[];
  setTokens: (tokens: Token[]) => void;
  selectedChainId: string | null;
  setSelectedChainId: (chainId: string | null) => void;
  showPinModal: boolean;
  setShowPinModal: (show: boolean) => void;
  pinAction: "unlock" | "sign" | "setup" | "recover" | "access" | null;
  setPinAction: (action: "unlock" | "sign" | "setup" | "recover" | "access" | null) => void;
  pendingWalletAccess: { wallet: Wallet; callback: () => void } | null;
  setPendingWalletAccess: (pending: { wallet: Wallet; callback: () => void } | null) => void;
  pendingTransaction: { toAddress: string; amount: string; chainId: string; tokenSymbol?: string; tokenContractAddress?: string; isNativeToken?: boolean; walletGroupId?: string; fromAddress?: string } | null;
  setPendingTransaction: (tx: { toAddress: string; amount: string; chainId: string; tokenSymbol?: string; tokenContractAddress?: string; isNativeToken?: boolean; walletGroupId?: string; fromAddress?: string } | null) => void;
  pendingWalletGroupId: string | null;
  setPendingWalletGroupId: (groupId: string | null) => void;
  unlockWalletGroup: (walletGroupId: string, pin: string) => Promise<boolean>;
  lockWalletGroup: (walletGroupId: string) => void;
  isWalletGroupUnlocked: (walletGroupId: string | undefined) => boolean;
  isAnyWalletGroupUnlocked: () => boolean;
  connectLedger: () => Promise<boolean>;
  connectRaspberryPi: () => Promise<{ success: boolean; hasWallet: boolean; error?: string }>;
  connectSimulated: (seedPhrase: string) => Promise<boolean>;
  unlockWallet: (pin: string) => Promise<boolean>;
  lockWallet: () => void;
  disconnectDevice: () => Promise<void>;
  deriveWallets: (selectedChainIds?: string[]) => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshWalletBalance: (walletId: string) => Promise<void>;
  refreshTransactions: () => Promise<void>;
  resetSessionTimeout: () => void;
  isLoading: boolean;
  isLoadingTransactions: boolean;
  error: string | null;
  topAssets: TopAsset[];
  enabledAssetIds: Set<string>;
  isLoadingAssets: boolean;
  toggleAssetEnabled: (assetId: string, enabled: boolean) => Promise<void>;
  refreshTopAssets: () => Promise<void>;
  enableAllAssets: () => Promise<void>;
  disableAllAssets: () => Promise<void>;
  createAdditionalWallet: (label?: string, chainId?: string) => Promise<void>;
  createWalletWithNewSeed: (label?: string, pin?: string) => Promise<{ seedPhrase: string; walletGroupId: string }>;
  generateNewSeedPhrase: () => string;
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
  availableAccounts: { index: number; label?: string }[];
  visibleWallets: Wallet[];
  customTokens: CustomToken[];
  loadCustomTokens: () => Promise<void>;
  addCustomToken: (token: Omit<CustomToken, 'id' | 'addedAt'>) => Promise<CustomToken>;
  removeCustomToken: (id: string) => Promise<void>;
  tokenBalances: Record<string, string>;
  setTokenBalances: Dispatch<SetStateAction<Record<string, string>>>;
  customTokenBalances: Record<string, string>;
  setCustomTokenBalances: Dispatch<SetStateAction<Record<string, string>>>;
  customChains: CustomChain[];
  loadCustomChains: () => Promise<void>;
  addCustomChain: (chain: Omit<CustomChain, 'id' | 'addedAt'>) => Promise<CustomChain>;
  removeCustomChain: (id: string) => Promise<void>;
  balanceCacheStatus: { isStale: boolean; lastUpdated: number | null; isRefreshing: boolean };
  // Secure add chain with seed verification
  pendingAddChain: { chainId: string; chainName: string } | null;
  setPendingAddChain: (chain: { chainId: string; chainName: string } | null) => void;
  verifySeedForAddChain: (seedPhrase: string) => Promise<boolean>;
  confirmAddChain: (customLabel?: string) => Promise<boolean>;
  abortAddChain: () => void;
  getSeedWordCount: () => number | null;
  // Wallet rename
  renameWallet: (walletId: string, newLabel: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [hardwareState, setHardwareState] = useState<HardwareWalletState>(hardwareWallet.getState());
  const [softWalletState, setSoftWalletState] = useState<SoftWalletState>(softWallet.getState());
  const [chains, setChains] = useState<Chain[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinAction, setPinAction] = useState<"unlock" | "sign" | "setup" | "recover" | "access" | null>(null);
  const [pendingWalletAccess, setPendingWalletAccess] = useState<{ wallet: Wallet; callback: () => void } | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState<{ toAddress: string; amount: string; chainId: string; tokenSymbol?: string; tokenContractAddress?: string; isNativeToken?: boolean; walletGroupId?: string } | null>(null);
  const [pendingWalletGroupId, setPendingWalletGroupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageInitialized, setStorageInitialized] = useState(false);
  const [topAssets, setTopAssets] = useState<TopAsset[]>([]);
  const [enabledAssetIds, setEnabledAssetIds] = useState<Set<string>>(new Set());
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [walletMode, setWalletModeInternal] = useState<"hard_wallet" | "soft_wallet">(() => {
    // Load persisted wallet mode from localStorage
    const savedMode = localStorage.getItem("walletMode");
    return savedMode === "hard_wallet" ? "hard_wallet" : "soft_wallet";
  });
  const [hasSoftWalletSetup, setHasSoftWalletSetup] = useState(false);
  const [hasHardWalletSetup, setHasHardWalletSetup] = useState(false);
  const [softWallets, setSoftWallets] = useState<Wallet[]>([]);
  const [hardWallets, setHardWallets] = useState<Wallet[]>([]);
  const [selectedAccountIndex, setSelectedAccountIndex] = useState<number>(0);
  const [customTokens, setCustomTokens] = useState<CustomToken[]>([]);
  const [customChains, setCustomChains] = useState<CustomChain[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const [customTokenBalances, setCustomTokenBalances] = useState<Record<string, string>>({});
  const [balanceCacheStatus, setBalanceCacheStatus] = useState<{ isStale: boolean; lastUpdated: number | null; isRefreshing: boolean }>({
    isStale: false,
    lastUpdated: null,
    isRefreshing: false,
  });
  const [pendingAddChain, setPendingAddChain] = useState<{ chainId: string; chainName: string } | null>(null);
  
  // Ref to track mode switch operations and prevent race conditions
  const modeSwitchIdRef = useRef<number>(0);
  // Flag to indicate a mode switch is in progress
  const isModeSwitchingRef = useRef<boolean>(false);
  // Track cache loading per mode - only load once per mode
  const hasLoadedCacheForModeRef = useRef<{ soft: boolean; hard: boolean }>({ soft: false, hard: false });
  // Track if custom chains have been loaded initially
  const hasLoadedCustomChainsRef = useRef<boolean>(false);

  // Compute available accounts from wallets (unique account indices with labels)
  const availableAccounts = useMemo(() => {
    const accountMap = new Map<number, { index: number; label?: string }>();
    wallets.forEach(w => {
      if (!accountMap.has(w.accountIndex)) {
        accountMap.set(w.accountIndex, { index: w.accountIndex, label: w.label });
      }
    });
    return Array.from(accountMap.values()).sort((a, b) => a.index - b.index);
  }, [wallets]);

  // Filter wallets by selected account index - uses modeBasedWallets for race-condition-free display
  const visibleWallets = useMemo(() => {
    // Use modeBasedWallets which is computed synchronously from current mode
    // This prevents hard wallet data from appearing in soft wallet mode during rapid switches
    // For hard wallet mode, only show wallets when actually unlocked (not just connected)
    const walletsToFilter = walletMode === "soft_wallet" ? softWallets : 
      (hardwareState.status === "unlocked" ? hardWallets : []);
    return walletsToFilter.filter(w => w.accountIndex === selectedAccountIndex);
  }, [walletMode, softWallets, hardWallets, hardwareState.status, selectedAccountIndex]);

  // Normalize selectedAccountIndex when wallets change and current index becomes invalid
  useEffect(() => {
    if (wallets.length === 0) return;
    const validIndices = new Set(wallets.map(w => w.accountIndex));
    if (!validIndices.has(selectedAccountIndex)) {
      const lowestIndex = Math.min(...Array.from(validIndices));
      setSelectedAccountIndex(lowestIndex);
    }
  }, [wallets, selectedAccountIndex]);

  useEffect(() => {
    const unsubscribe = hardwareWallet.subscribe(setHardwareState);
    hardwareWallet.initMobileDeviceMonitoring();
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = softWallet.subscribe(setSoftWalletState);
    return unsubscribe;
  }, []);

  // Check if soft wallet exists after storage is initialized
  useEffect(() => {
    if (storageInitialized) {
      softWallet.checkWalletExists();
    }
  }, [storageInitialized]);

  useEffect(() => {
    async function initStorage() {
      try {
        await clientStorage.init();
        setStorageInitialized(true);
        
        // Load mode-specific wallet setup states
        const softSetup = await clientStorage.isSoftWalletSetup();
        const hardSetup = await clientStorage.isHardWalletSetup();
        setHasSoftWalletSetup(softSetup);
        setHasHardWalletSetup(hardSetup);
        
        // Get persisted wallet mode
        const savedMode = localStorage.getItem("walletMode");
        const currentMode = savedMode === "hard_wallet" ? "hard_wallet" : "soft_wallet";
        
        // Load wallet data and check for cross-contamination
        const softWalletData = softSetup ? await clientStorage.getSoftWalletData() : [];
        const hardWalletData = hardSetup ? await clientStorage.getHardWalletData() : [];
        
        // Detect cross-contamination: if addresses match between soft and hard, clear the contaminated one
        if (softWalletData.length > 0 && hardWalletData.length > 0) {
          const softAddresses = new Set(softWalletData.map(w => w.address.toLowerCase()));
          const hardAddresses = new Set(hardWalletData.map(w => w.address.toLowerCase()));
          const overlap = Array.from(softAddresses).some(addr => hardAddresses.has(addr));
          
          if (overlap) {
            console.log("[WalletContext] Detected cross-contamination - clearing soft wallet data");
            await clientStorage.clearSoftWallet();
            await clientStorage.clearEncryptedSeed();
            setHasSoftWalletSetup(false);
            setSoftWallets([]);
            
            // Only load hard wallet data - but don't display until device connects
            if (hardSetup) {
              const mappedHardWallets: Wallet[] = hardWalletData.map(w => ({
                id: w.id,
                deviceId: "hard",
                chainId: w.chainId,
                address: w.address,
                balance: "0",
                isActive: true,
                accountIndex: w.accountIndex ?? 0,
                label: w.label,
                walletGroupId: w.walletGroupId,
              }));
              setHardWallets(mappedHardWallets);
              // In hard wallet mode, don't set active wallets until device is connected
              // User needs to click "Connect" first
            }
            return;
          }
        }
        
        // Load cached balances to apply immediately
        const cachedBalances = await clientStorage.getAllCachedBalances();
        const cachedBalanceMap = new Map<string, string>();
        cachedBalances.forEach(c => {
          cachedBalanceMap.set(`${c.address.toLowerCase()}-${c.chainSymbol}`, c.balance);
        });
        
        // Update cache status
        const lastRefresh = await clientStorage.getLastFullRefresh();
        if (lastRefresh > 0) {
          const isStale = clientStorage.isCacheStale(lastRefresh);
          setBalanceCacheStatus({ isStale, lastUpdated: lastRefresh, isRefreshing: false });
        }
        
        // Load soft wallet data if it's set up (no contamination)
        if (softSetup && softWalletData.length > 0) {
          const mappedWallets: Wallet[] = softWalletData.map(w => {
            // Apply cached balance if available
            const cacheKey = `${w.address.toLowerCase()}-${w.chainSymbol}`;
            const cachedBalance = cachedBalanceMap.get(cacheKey);
            return {
              id: w.id,
              deviceId: "soft",
              chainId: w.chainId,
              address: w.address,
              balance: cachedBalance || "0",
              isActive: true,
              accountIndex: w.accountIndex ?? 0,
              label: w.label,
              walletGroupId: w.walletGroupId,
            };
          });
          setSoftWallets(mappedWallets);
          // Set as active wallets if in soft wallet mode
          if (currentMode === "soft_wallet") {
            setWallets(mappedWallets);
            // Mark cache as loaded for soft mode
            hasLoadedCacheForModeRef.current.soft = true;
          }
        }
        
        // Load hard wallet data if it's set up - but don't display until device connects
        if (hardSetup && hardWalletData.length > 0) {
          const mappedWallets: Wallet[] = hardWalletData.map(w => {
            // Apply cached balance if available
            const cacheKey = `${w.address.toLowerCase()}-${w.chainSymbol}`;
            const cachedBalance = cachedBalanceMap.get(cacheKey);
            return {
              id: w.id,
              deviceId: "hard",
              chainId: w.chainId,
              address: w.address,
              balance: cachedBalance || "0",
              isActive: true,
              accountIndex: w.accountIndex ?? 0,
              label: w.label,
              walletGroupId: w.walletGroupId,
            };
          });
          setHardWallets(mappedWallets);
          // In hard wallet mode, don't set active wallets until device is connected
          // User needs to click "Connect" first - wallets will be loaded when device connects
        }
      } catch (err) {
        console.error("Failed to initialize storage:", err);
      }
    }
    initStorage();
  }, []);
  
  // Handle wallet mode switching
  const setWalletMode = useCallback(async (mode: "hard_wallet" | "soft_wallet") => {
    if (mode === walletMode) return;
    
    // Mark that we're switching modes to prevent effects from interfering
    isModeSwitchingRef.current = true;
    
    // Increment mode switch ID to track this operation and prevent race conditions
    modeSwitchIdRef.current += 1;
    const currentSwitchId = modeSwitchIdRef.current;
    
    // First, persist current mode's wallets to storage before switching
    // Only save if wallets match the current mode (prevent cross-contamination)
    const expectedDeviceId = walletMode === "soft_wallet" ? "soft" : "hard";
    const walletsForCurrentMode = wallets.filter(w => w.deviceId === expectedDeviceId);
    
    if (walletsForCurrentMode.length > 0 && storageInitialized) {
      const storedWalletsForCurrentMode: StoredWallet[] = walletsForCurrentMode.map(w => {
        const chain = chains.find(c => c.id === w.chainId);
        return {
          id: w.id,
          address: w.address,
          chainId: w.chainId,
          chainName: chain?.name || "",
          chainSymbol: chain?.symbol || "",
          balance: w.balance,
          path: "m/44'/60'/0'/0/0",
          lastUpdated: new Date().toISOString(),
          accountIndex: w.accountIndex ?? 0,
          label: w.label,
          walletGroupId: w.walletGroupId, // Preserve independent seed wallet group
        };
      });
      
      if (walletMode === "soft_wallet") {
        await clientStorage.saveSoftWalletData(storedWalletsForCurrentMode);
        await clientStorage.setSoftWalletSetup(true);
        // Check if this operation is still current before mutating state
        if (modeSwitchIdRef.current !== currentSwitchId) return;
        setHasSoftWalletSetup(true);
        setSoftWallets(walletsForCurrentMode);
      } else {
        await clientStorage.saveHardWalletData(storedWalletsForCurrentMode);
        await clientStorage.setHardWalletSetup(true);
        if (modeSwitchIdRef.current !== currentSwitchId) return;
        setHasHardWalletSetup(true);
        setHardWallets(walletsForCurrentMode);
      }
    }
    
    // Check if this operation is still current
    if (modeSwitchIdRef.current !== currentSwitchId) return;
    
    // Switch mode and immediately clear wallets to prevent stale data during async load
    setWalletModeInternal(mode);
    localStorage.setItem("walletMode", mode);
    setWallets([]);
    
    // Load wallets from storage for the target mode - no PIN required for viewing
    try {
      if (mode === "soft_wallet") {
        const softSetup = await clientStorage.isSoftWalletSetup();
        // Check if this operation is still current before mutating state
        if (modeSwitchIdRef.current !== currentSwitchId) return;
        setHasSoftWalletSetup(softSetup);
        
        if (softSetup) {
          const softWalletData = await clientStorage.getSoftWalletData();
          if (modeSwitchIdRef.current !== currentSwitchId) return;
          
          if (softWalletData.length > 0) {
            const mappedWallets: Wallet[] = softWalletData.map(w => ({
              id: w.id,
              deviceId: "soft",
              chainId: w.chainId,
              address: w.address,
              balance: "0",
              isActive: true,
              accountIndex: w.accountIndex ?? 0,
              label: w.label,
              walletGroupId: w.walletGroupId,
            }));
            setSoftWallets(mappedWallets);
            setWallets(mappedWallets);
          } else {
            // No wallet data even though setup flag is true - just show empty state
            setWallets([]);
          }
        } else {
          // Not set up - show empty state, user can set up from dashboard
          setWallets([]);
        }
      } else {
        // Hard wallet mode - only load wallet data into cache, NOT into active display
        // Wallets will only be displayed when device is actually connected
        const hardSetup = await clientStorage.isHardWalletSetup();
        const hasStoredHardWallet = await hardwareWallet.hasStoredHardWallet();
        
        // Check if this operation is still current before mutating state
        if (modeSwitchIdRef.current !== currentSwitchId) return;
        
        if (hardSetup || hasStoredHardWallet) {
          const hardWalletData = await clientStorage.getHardWalletData();
          if (modeSwitchIdRef.current !== currentSwitchId) return;
          
          if (hardWalletData.length > 0) {
            const mappedWallets: Wallet[] = hardWalletData.map(w => ({
              id: w.id,
              deviceId: "hard",
              chainId: w.chainId,
              address: w.address,
              balance: "0",
              isActive: true,
              accountIndex: w.accountIndex ?? 0,
              label: w.label,
              walletGroupId: w.walletGroupId,
            }));
            setHardWallets(mappedWallets);
            setHasHardWalletSetup(true);
            // Don't set active wallets - wait for device connection
            // The useEffect watching isConnected will populate wallets when device connects
            setWallets([]);
          } else {
            // No wallet data - show empty state
            setHasHardWalletSetup(false);
            setHardWallets([]);
            setWallets([]);
          }
        } else {
          // Not set up - show empty state, user can set up from dashboard
          setHasHardWalletSetup(false);
          setWallets([]);
        }
      }
    } catch (err) {
      console.error("Failed to load wallet data for mode:", mode, err);
      if (modeSwitchIdRef.current === currentSwitchId) {
        setWallets([]);
      }
    } finally {
      // Only clear the switching flag if this is still the current operation
      if (modeSwitchIdRef.current === currentSwitchId) {
        isModeSwitchingRef.current = false;
      }
    }
  }, [walletMode, wallets, storageInitialized, chains]);

  // Load top assets and enabled preferences on mount
  useEffect(() => {
    async function loadAssetsAndPreferences() {
      if (!storageInitialized) return;
      
      setIsLoadingAssets(true);
      try {
        // Fetch top assets from API - no limit, get all available
        const assets = await fetchTopAssets(1000);
        setTopAssets(assets);
        
        const newAssetIds = new Set(assets.map(a => a.id));
        
        // Load enabled preferences from storage
        const hasPreference = await clientStorage.hasEnabledAssetsPreference();
        if (hasPreference) {
          const storedEnabled = await clientStorage.getEnabledAssets();
          // Reconcile: keep only IDs that exist in the new assets
          const synced = new Set<string>();
          for (const id of Array.from(storedEnabled)) {
            if (newAssetIds.has(id)) {
              synced.add(id);
            }
          }
          // If after reconciliation we lost all enabled assets, re-enable all
          if (synced.size === 0 && storedEnabled.size > 0) {
            setEnabledAssetIds(newAssetIds);
            await clientStorage.setEnabledAssets(newAssetIds);
          } else {
            setEnabledAssetIds(synced);
            // Only persist if we actually removed stale entries
            if (synced.size !== storedEnabled.size) {
              await clientStorage.setEnabledAssets(synced);
            }
          }
        } else {
          // First time: enable only BTC, ETH, BNB, TRX by default
          const defaultEnabledIds = new Set<string>();
          const defaultAssetIds = ['bitcoin', 'ethereum', 'binancecoin', 'tron'];
          for (const id of defaultAssetIds) {
            if (newAssetIds.has(id)) {
              defaultEnabledIds.add(id);
            }
          }
          // If none of the defaults exist, fall back to enabling the first 4 assets
          if (defaultEnabledIds.size === 0) {
            const firstFour = Array.from(newAssetIds).slice(0, 4);
            firstFour.forEach(id => defaultEnabledIds.add(id));
          }
          setEnabledAssetIds(defaultEnabledIds);
          await clientStorage.setEnabledAssets(defaultEnabledIds);
        }
      } catch (err) {
        console.error("Failed to load assets:", err);
      } finally {
        setIsLoadingAssets(false);
      }
    }
    loadAssetsAndPreferences();
  }, [storageInitialized]);

  useEffect(() => {
    async function loadTransactions() {
      if (!storageInitialized) return;
      try {
        const storedTxs = await clientStorage.getAllTransactions();
        const mappedTxs: Transaction[] = storedTxs.map(tx => ({
          id: tx.id,
          walletId: tx.walletId,
          chainId: tx.chainId,
          type: tx.type,
          status: tx.status,
          amount: tx.amount,
          tokenSymbol: tx.tokenSymbol,
          toAddress: tx.toAddress,
          fromAddress: tx.fromAddress,
          txHash: tx.txHash || undefined,
          gasUsed: tx.gasUsed || undefined,
          timestamp: tx.timestamp,
        }));
        setTransactions(mappedTxs);
      } catch (err) {
        console.error("Failed to load transactions:", err);
      }
    }
    loadTransactions();
  }, [storageInitialized]);

  useEffect(() => {
    const defaultChains: Chain[] = DEFAULT_CHAINS.map((c, i) => ({
      ...c,
      id: `chain-${i}`,
    }));
    
    // Merge default chains with custom chains
    const customChainsAsMapped: Chain[] = customChains.map((c) => ({
      id: c.id,
      name: c.name,
      symbol: c.symbol,
      rpcUrl: c.rpcUrl,
      chainId: c.chainId,
      blockExplorer: c.blockExplorer || "",
      iconColor: c.iconColor || "#6B7280",
      isDefault: false,
      decimals: c.decimals,
    }));
    
    setChains([...defaultChains, ...customChainsAsMapped]);
    if (defaultChains.length > 0 && !selectedChainId) {
      setSelectedChainId(defaultChains[0].id);
    }
  }, [customChains]);

  useEffect(() => {
    const handleActivity = () => {
      if (walletMode === "soft_wallet") {
        if (softWalletState.status === "unlocked") {
          softWallet.resetSessionTimeout();
        }
      } else {
        if (hardwareState.status === "unlocked") {
          hardwareWallet.resetSessionTimeout();
        }
      }
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [walletMode, hardwareState.status, softWalletState.status]);

  const fetchedWalletIdsRef = useRef<Set<string>>(new Set());
  const isRefreshingRef = useRef<boolean>(false);
  
  // Reset fetched wallet IDs when wallet mode changes
  useEffect(() => {
    fetchedWalletIdsRef.current = new Set();
  }, [walletMode]);

  // DISABLED: Automatic balance fetching on wallet load
  // Balance fetching is now on-demand only - when user clicks into a specific wallet
  // This prevents making dozens of API calls for all chains at once
  // Users can use the refresh button to manually fetch all balances when needed

  // For soft wallet mode, use softWalletState; for hard wallet mode, use hardwareState
  const isConnected = walletMode === "soft_wallet" 
    ? (softWalletState.status === "locked" || softWalletState.status === "unlocked" || softWalletState.hasWallet)
    : (hardwareState.status === "connected" || hardwareState.status === "unlocked");
  const isUnlocked = walletMode === "soft_wallet"
    ? softWalletState.status === "unlocked"
    : hardwareState.status === "unlocked";
  
  // Computed value for whether current mode has a wallet set up
  const currentModeHasWallet = walletMode === "soft_wallet" ? hasSoftWalletSetup : hasHardWalletSetup;

  // CRITICAL: Compute displayed wallets synchronously based on current mode
  // This eliminates race conditions from async state updates
  const modeBasedWallets = useMemo(() => {
    if (walletMode === "soft_wallet") {
      // In soft wallet mode, ONLY show soft wallet data
      return softWallets;
    } else {
      // In hard wallet mode, ONLY show hard wallet data when device is UNLOCKED (not just connected)
      // This ensures addresses are not visible until PIN is entered
      return hardwareState.status === "unlocked" ? hardWallets : [];
    }
  }, [walletMode, softWallets, hardWallets, hardwareState.status]);

  // Track last hard wallet connection status for triggering balance refresh
  const lastHardConnectedRef = useRef<boolean>(false);
  
  // Sync wallets array from modeBasedWallets when hard wallet UNLOCKS or mode changes
  // This ensures the wallets array is populated for components that depend on it
  // IMPORTANT: Only sync when UNLOCKED, not just connected - this protects sensitive data
  useEffect(() => {
    if (isModeSwitchingRef.current) return; // Don't sync during mode switch
    
    if (walletMode === "hard_wallet") {
      // Only use unlocked status, not connected - addresses should only show after PIN
      const hardUnlocked = hardwareState.status === "unlocked";
      
      // Detect when hard wallet just unlocked (transition from not unlocked to unlocked)
      const justUnlocked = hardUnlocked && !lastHardConnectedRef.current;
      lastHardConnectedRef.current = hardUnlocked;
      
      if (hardUnlocked && hardWallets.length > 0) {
        // Clear the fetched wallet IDs ref so balances get fetched fresh
        // This happens on initial sync OR when hard wallet unlocks
        if (wallets.length === 0 || justUnlocked) {
          fetchedWalletIdsRef.current = new Set();
          // Clone hardWallets to ensure React detects the state change
          setWallets([...hardWallets]);
        }
      } else if (!hardUnlocked) {
        // When locked, clear visible wallets
        if (wallets.length > 0 && wallets[0]?.deviceId === "hard") {
          setWallets([]);
        }
      }
    } else {
      // Reset the ref when switching away from hard wallet mode
      lastHardConnectedRef.current = false;
    }
  }, [walletMode, hardwareState.status, hardWallets, wallets.length]);

  // Track previous unlock status to detect unlock transition
  const wasUnlockedRef = useRef<boolean>(false);
  
  // Sync chain preferences from hardware wallet on unlock
  useEffect(() => {
    if (walletMode !== "hard_wallet") {
      wasUnlockedRef.current = false;
      return;
    }
    
    const justUnlocked = hardwareState.status === "unlocked" && !wasUnlockedRef.current;
    wasUnlockedRef.current = hardwareState.status === "unlocked";
    
    if (!justUnlocked || !storageInitialized) return;
    
    (async () => {
      try {
        console.log("[WalletContext] Hardware wallet unlocked - syncing chain preferences");
        const chainPrefs = await hardwareWallet.getChainPreferences();
        
        if (chainPrefs && chainPrefs.length > 0) {
          console.log("[WalletContext] Loaded chain preferences from hardware:", chainPrefs);
          
          // Derive addresses for the stored chain preferences
          const mnemonic = await hardwareWallet.getSeedPhraseFromDevice();
          if (!mnemonic) {
            console.error("[WalletContext] Cannot get seed phrase from device");
            return;
          }
          
          const currentChains = chains.length > 0 ? chains : DEFAULT_CHAINS.map((c, i) => ({
            ...c,
            id: `chain-${i}`,
          }));
          
          const newWallets: Wallet[] = [];
          
          for (const pref of chainPrefs) {
            const chain = currentChains.find(c => c.symbol === pref.symbol);
            if (!chain) continue;
            
            const derivedAddresses = await deriveAllAddresses(mnemonic, [pref.symbol], pref.accountIndex);
            const derived = derivedAddresses[0];
            
            if (derived && derived.address) {
              newWallets.push({
                id: `wallet-${Date.now()}-${chain.id}-${pref.accountIndex}`,
                deviceId: "hard",
                chainId: chain.id,
                address: derived.address,
                balance: "0",
                isActive: true,
                accountIndex: pref.accountIndex,
                label: pref.label,
              });
            }
          }
          
          if (newWallets.length > 0) {
            console.log("[WalletContext] Derived wallets from chain preferences:", newWallets.length);
            setHardWallets(newWallets);
            setWallets(newWallets);
            setHasHardWalletSetup(true);
            
            // Save to browser storage for balance caching
            const walletsToSave: StoredWallet[] = newWallets.map(w => {
              const chain = currentChains.find(c => c.id === w.chainId);
              return {
                id: w.id,
                chainId: w.chainId,
                chainName: chain?.name || "",
                chainSymbol: chain?.symbol || "",
                address: w.address,
                balance: w.balance,
                path: `m/44'/${chain?.symbol === 'ETH' ? '60' : chain?.symbol === 'BTC' ? '0' : '501'}'/0'/0/${w.accountIndex}`,
                lastUpdated: new Date().toISOString(),
                accountIndex: w.accountIndex,
                label: w.label,
              };
            });
            await clientStorage.saveHardWalletData(walletsToSave);
            await clientStorage.setHardWalletSetup(true);
          }
        }
      } catch (err) {
        console.error("[WalletContext] Failed to sync chain preferences:", err);
      }
    })();
  }, [walletMode, hardwareState.status, storageInitialized, chains]);

  const connectLedger = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await hardwareWallet.connectLedger();
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to connect Ledger");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectRaspberryPi = useCallback(async (): Promise<{ success: boolean; hasWallet: boolean; error?: string }> => {
    console.log("[WalletContext] connectRaspberryPi() called");
    setIsLoading(true);
    setError(null);
    try {
      const result = await hardwareWallet.connectRaspberryPi();
      console.log("[WalletContext] hardwareWallet.connectRaspberryPi() result:", result);
      
      if (result) {
        const hasWallet = hardwareWallet.hasWalletOnDevice();
        console.log("[WalletContext] Device has wallet:", hasWallet);
        
        // Check if the Pico has a wallet - if not, clear cached wallets
        if (!hasWallet) {
          console.log("[WalletContext] NEW DEVICE - No wallet found, clearing cache");
          setWallets([]);
          setTransactions([]);
          await clientStorage.clearAll();
        } else {
          console.log("[WalletContext] EXISTING DEVICE - Wallet found on device");
        }
        return { success: true, hasWallet };
      } else {
        // Connection failed - reset hasWallet to false and return error
        console.log("[WalletContext] Connection failed");
        hardwareWallet.setHasWalletOnDevice(false);
        const errorMsg = hardwareWallet.getState().error;
        return { success: false, hasWallet: false, error: errorMsg || undefined };
      }
    } catch (err: any) {
      // Exception thrown - reset hasWallet to false
      console.log("[WalletContext] Exception:", err);
      hardwareWallet.setHasWalletOnDevice(false);
      const errorMsg = err.message || "Failed to connect Raspberry Pi";
      setError(errorMsg);
      return { success: false, hasWallet: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectSimulated = useCallback(async (seedPhrase: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await hardwareWallet.connectSimulated(seedPhrase);
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to create simulated wallet");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unlockWallet = useCallback(async (pin: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      let result: boolean;
      if (walletMode === "soft_wallet") {
        result = await softWallet.unlock(pin);
        if (!result && softWallet.getState().error) {
          setError(softWallet.getState().error);
        }
      } else {
        result = await hardwareWallet.unlock(pin);
      }
      if (result) {
        setShowPinModal(false);
      }
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to unlock wallet");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [walletMode]);

  const lockWallet = useCallback(() => {
    if (walletMode === "soft_wallet") {
      softWallet.lock();
    } else {
      hardwareWallet.lock();
    }
  }, [walletMode]);

  const unlockWalletGroup = useCallback(async (walletGroupId: string, pin: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await softWallet.unlockWalletGroup(walletGroupId, pin);
      if (!result && softWallet.getState().error) {
        setError(softWallet.getState().error);
      }
      if (result) {
        setShowPinModal(false);
        setPendingWalletGroupId(null);
      }
      return result;
    } catch (err: any) {
      setError(err.message || "Failed to unlock wallet group");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isWalletGroupUnlocked = useCallback((walletGroupId: string | undefined): boolean => {
    return softWallet.isWalletGroupUnlocked(walletGroupId);
  }, []);

  const isAnyWalletGroupUnlocked = useCallback((): boolean => {
    // Use state from subscription to ensure reactivity
    return softWalletState.unlockedWalletGroups.size > 0;
  }, [softWalletState.unlockedWalletGroups]);

  const lockWalletGroup = useCallback((walletGroupId: string): void => {
    softWallet.lockWalletGroup(walletGroupId);
    setPendingWalletGroupId(null);
  }, []);

  const resetSessionTimeout = useCallback(() => {
    if (walletMode === "soft_wallet") {
      softWallet.resetSessionTimeout();
    } else {
      hardwareWallet.resetSessionTimeout();
    }
  }, [walletMode]);

  const disconnectDevice = useCallback(async () => {
    if (walletMode === "soft_wallet") {
      await softWallet.reset();
      setHasSoftWalletSetup(false);
      setSoftWallets([]);
    } else {
      await hardwareWallet.disconnect();
      await clientStorage.clearHardWallet();
      setHasHardWalletSetup(false);
      setHardWallets([]);
    }
    setWallets([]);
    setTransactions([]);
  }, [walletMode]);

  const deriveWallets = useCallback(async (selectedChainIds?: string[]) => {
    // Check unlock status based on wallet mode
    if (walletMode === "soft_wallet") {
      if (softWallet.getState().status !== "unlocked") {
        setError("Wallet must be unlocked to derive wallets");
        return;
      }
    } else {
      const currentState = hardwareWallet.getState();
      if (currentState.status !== "unlocked") {
        setError("Device must be unlocked to derive wallets");
        return;
      }
    }

    // Before deriving new wallets, check if we have stored wallets
    if (storageInitialized && !selectedChainIds) {
      const storedWallets = walletMode === "soft_wallet" 
        ? await clientStorage.getSoftWalletData()
        : await clientStorage.getHardWalletData();
      
      if (storedWallets.length > 0) {
        // Load from storage (preserve walletGroupId for independent seed wallets!)
        const mappedWallets: Wallet[] = storedWallets.map(w => ({
          id: w.id,
          deviceId: walletMode === "soft_wallet" ? "soft" : "hard",
          chainId: w.chainId,
          address: w.address,
          balance: "0",
          isActive: true,
          accountIndex: w.accountIndex ?? 0,
          label: w.label,
          walletGroupId: w.walletGroupId,
        }));
        
        // Don't auto-derive for new chains - user manually adds chains they want
        // Just load existing wallets from storage
        setWallets(mappedWallets);
        if (walletMode === "soft_wallet") {
          setSoftWallets(mappedWallets);
        } else {
          setHardWallets(mappedWallets);
        }
        return;
      }
    }

    // New wallet - create wallets for selected chains
    setIsLoading(true);
    try {
      const currentChains = chains.length > 0 ? chains : DEFAULT_CHAINS.map((c, i) => ({
        ...c,
        id: `chain-${i}`,
      }));
      
      // If selectedChainIds provided, create wallets for those chains
      if (selectedChainIds && selectedChainIds.length > 0) {
        const mnemonic = walletMode === "soft_wallet" 
          ? softWallet.getSeedPhrase()
          : await hardwareWallet.getSeedPhraseFromDevice();
        
        if (!mnemonic) {
          throw new Error("Cannot access seed phrase");
        }
        
        // Filter chains to selected ones
        const targetChains = currentChains.filter(c => selectedChainIds.includes(c.id));
        const chainSymbols = targetChains.map(c => c.symbol);
        
        const derivedAddresses = await deriveAllAddresses(mnemonic, chainSymbols, 0);
        
        const newWallets: Wallet[] = [];
        for (const derived of derivedAddresses) {
          const chain = targetChains.find(c => c.symbol === derived.chainSymbol);
          if (!chain || !derived.address) continue;
          
          newWallets.push({
            id: `wallet-${Date.now()}-${chain.id}-0`,
            deviceId: walletMode === "soft_wallet" ? "soft" : "hard",
            chainId: chain.id,
            address: derived.address,
            balance: "0",
            isActive: true,
            accountIndex: 0,
          });
        }
        
        // Set both states together to ensure consistency
        if (walletMode === "soft_wallet") {
          setSoftWallets(newWallets);
        } else {
          setHardWallets(newWallets);
        }
        setWallets(newWallets);
        
        // Save to storage
        if (storageInitialized) {
          const walletsToSave: StoredWallet[] = newWallets.map(w => {
            const chain = targetChains.find(c => c.id === w.chainId);
            return {
              id: w.id,
              chainId: w.chainId,
              chainName: chain?.name || "",
              chainSymbol: chain?.symbol || "",
              address: w.address,
              balance: w.balance,
              path: `m/44'/${chain?.symbol === 'ETH' ? '60' : chain?.symbol === 'BTC' ? '0' : '501'}'/0'/0/${w.accountIndex}`,
              lastUpdated: new Date().toISOString(),
              accountIndex: w.accountIndex,
              label: w.label,
              walletGroupId: w.walletGroupId,
            };
          });
          
          if (walletMode === "soft_wallet") {
            await clientStorage.saveSoftWalletData(walletsToSave);
            await clientStorage.setSoftWalletSetup(true);
            setHasSoftWalletSetup(true);
          } else {
            await clientStorage.saveHardWalletData(walletsToSave);
            await clientStorage.setHardWalletSetup(true);
            setHasHardWalletSetup(true);
            
            // Save chain preferences to hardware for portability
            const chainPrefs = newWallets.map(w => {
              const chain = targetChains.find(c => c.id === w.chainId);
              return {
                symbol: chain?.symbol || "",
                accountIndex: w.accountIndex,
                label: w.label,
              };
            });
            await hardwareWallet.saveChainPreferences(chainPrefs);
          }
        }
      } else {
        // No chains selected - start with empty wallets
        const newWallets: Wallet[] = [];
        setWallets(newWallets);
        
        // Mark wallet as set up (with empty chain list)
        if (storageInitialized) {
          if (walletMode === "soft_wallet") {
            await clientStorage.saveSoftWalletData([]);
            await clientStorage.setSoftWalletSetup(true);
            setHasSoftWalletSetup(true);
            setSoftWallets([]);
          } else {
            await clientStorage.saveHardWalletData([]);
            await clientStorage.setHardWalletSetup(true);
            setHasHardWalletSetup(true);
            setHardWallets([]);
          }
        }
      }
      
      if (chains.length === 0) {
        setChains(currentChains);
      }
    } catch (err: any) {
      setError(err.message || "Failed to initialize wallet");
    } finally {
      setIsLoading(false);
    }
  }, [chains, selectedChainId, storageInitialized, walletMode]);

  const loadCachedBalances = useCallback(async () => {
    // Read from storage to avoid race conditions with state updates
    const storageWallets = walletMode === "soft_wallet" 
      ? await clientStorage.getSoftWalletData()
      : await clientStorage.getHardWalletData();
    
    if (storageWallets.length === 0 || chains.length === 0) return;
    
    // Convert to Wallet objects
    const currentWallets: Wallet[] = storageWallets.map(w => ({
      id: w.id,
      deviceId: walletMode === "soft_wallet" ? "soft" : "hard",
      chainId: w.chainId,
      address: w.address,
      balance: w.balance || "0",
      isActive: true,
      accountIndex: w.accountIndex ?? 0,
      label: w.label,
      walletGroupId: w.walletGroupId,
    }));
    
    try {
      const cachedBalances = await clientStorage.getAllCachedBalances();
      if (cachedBalances.length === 0) return;
      
      const lastRefresh = await clientStorage.getLastFullRefresh();
      const isStale = lastRefresh > 0 ? clientStorage.isCacheStale(lastRefresh) : true;
      
      setBalanceCacheStatus(prev => ({
        ...prev,
        isStale,
        lastUpdated: lastRefresh || null,
      }));
      
      const updatedWallets = currentWallets.map(wallet => {
        const chain = chains.find(c => c.id === wallet.chainId);
        if (!chain) return wallet;
        
        const cached = cachedBalances.find(
          c => c.address.toLowerCase() === wallet.address.toLowerCase() && c.chainSymbol === chain.symbol
        );
        
        if (cached) {
          return { ...wallet, balance: cached.balance };
        }
        return wallet;
      });
      
      setWallets([...updatedWallets]);
      if (walletMode === "soft_wallet") {
        setSoftWallets([...updatedWallets]);
      } else {
        setHardWallets([...updatedWallets]);
      }
    } catch (err) {
      console.error("Failed to load cached balances:", err);
    }
  }, [walletMode, chains]);

  const refreshBalances = useCallback(async () => {
    isRefreshingRef.current = true;
    fetchedWalletIdsRef.current = new Set();
    
    setBalanceCacheStatus(prev => ({ ...prev, isRefreshing: true }));
    
    try {
      // Read from storage to avoid race conditions with state updates
      const storageWallets = walletMode === "soft_wallet" 
        ? await clientStorage.getSoftWalletData()
        : await clientStorage.getHardWalletData();
      
      // Convert to Wallet objects
      const currentWallets: Wallet[] = storageWallets.map(w => ({
        id: w.id,
        deviceId: walletMode === "soft_wallet" ? "soft" : "hard",
        chainId: w.chainId,
        address: w.address,
        balance: w.balance || "0",
        isActive: true,
        accountIndex: w.accountIndex ?? 0,
        label: w.label,
        walletGroupId: w.walletGroupId,
      }));
      
      if (currentWallets.length === 0 || chains.length === 0) {
        // No wallets to refresh - clear refreshing but don't update lastUpdated
        // Keep isStale: false since there's nothing to be stale, but don't claim we just refreshed
        setBalanceCacheStatus(prev => ({ ...prev, isStale: false, isRefreshing: false }));
        return;
      }
      
      // Only fetch balances for chains that have enabled assets
      const enabledChainSymbols = getEnabledChainSymbols(enabledAssetIds);
      const walletsToRefresh = currentWallets.filter(wallet => {
        const chain = chains.find(c => c.id === wallet.chainId);
        return chain && enabledChainSymbols.has(chain.symbol);
      });
      
      // If no wallets match enabled chains, skip refresh but don't mark as stale
      if (walletsToRefresh.length === 0) {
        setBalanceCacheStatus(prev => ({ ...prev, isStale: false, isRefreshing: false }));
        return;
      }
      
      const balancesToCache: Array<{ address: string; chainSymbol: string; chainId: number; balance: string }> = [];
      
      const updatedWalletsPartial = await Promise.all(
        walletsToRefresh.map(async (wallet) => {
          const chain = chains.find(c => c.id === wallet.chainId);
          if (!chain) {
            return wallet;
          }
          
          try {
            const customRpcUrl = !chain.isDefault && chain.rpcUrl ? chain.rpcUrl : undefined;
            const balance = await getUniversalBalance(wallet.address, chain.chainId, chain.symbol, customRpcUrl);
            
            balancesToCache.push({
              address: wallet.address,
              chainSymbol: chain.symbol,
              chainId: chain.chainId,
              balance,
            });
            
            return { ...wallet, balance };
          } catch (err) {
            console.error(`Failed to fetch balance for ${wallet.address}:`, err);
            return wallet;
          }
        })
      );
      
      // Merge updated wallets with unchanged ones
      const updatedWalletIds = new Set(updatedWalletsPartial.map(w => w.id));
      const updatedWallets = currentWallets.map(wallet => {
        if (updatedWalletIds.has(wallet.id)) {
          return updatedWalletsPartial.find(w => w.id === wallet.id) || wallet;
        }
        return wallet;
      });
      
      // Only update wallets if at least one balance was successfully fetched
      // This preserves cached balances when all fetches fail
      if (balancesToCache.length > 0) {
        setWallets([...updatedWallets]);
        
        if (walletMode === "soft_wallet") {
          setSoftWallets([...updatedWallets]);
        } else {
          setHardWallets([...updatedWallets]);
        }
      }
      
      if (storageInitialized && balancesToCache.length > 0) {
        await clientStorage.setCachedBalances(balancesToCache);
        
        const storedWalletsForMode: StoredWallet[] = updatedWallets.map(w => {
          const chain = chains.find(c => c.id === w.chainId);
          return {
            id: w.id,
            address: w.address,
            chainId: w.chainId,
            chainName: chain?.name || "",
            chainSymbol: chain?.symbol || "",
            balance: w.balance,
            path: "m/44'/60'/0'/0/0",
            lastUpdated: new Date().toISOString(),
            accountIndex: w.accountIndex ?? 0,
            label: w.label,
            walletGroupId: w.walletGroupId,
          };
        });
        
        if (walletMode === "soft_wallet") {
          await clientStorage.saveSoftWalletData(storedWalletsForMode);
        } else {
          await clientStorage.saveHardWalletData(storedWalletsForMode);
        }
        
        // Only mark as fresh if at least one balance was successfully fetched
        setBalanceCacheStatus({
          isStale: false,
          lastUpdated: Date.now(),
          isRefreshing: false,
        });
      } else {
        // No balances fetched successfully - keep stale state, just clear refreshing
        setBalanceCacheStatus(prev => ({ ...prev, isRefreshing: false }));
      }
    } catch (err: any) {
      console.error("Failed to refresh balances:", err);
      setBalanceCacheStatus(prev => ({ ...prev, isRefreshing: false }));
    } finally {
      isRefreshingRef.current = false;
    }
  }, [chains, storageInitialized, walletMode, enabledAssetIds]);

  const refreshWalletBalance = useCallback(async (walletId: string) => {
    const currentWallets = walletMode === "soft_wallet" ? softWallets : hardWallets;
    const wallet = currentWallets.find(w => w.id === walletId);
    if (!wallet) return;

    const chain = chains.find(c => c.id === wallet.chainId);
    if (!chain) return;

    try {
      const customRpcUrl = !chain.isDefault && chain.rpcUrl ? chain.rpcUrl : undefined;
      const balance = await getUniversalBalance(wallet.address, chain.chainId, chain.symbol, customRpcUrl);

      const updatedWallet = { ...wallet, balance };

      const updateWalletInList = (list: Wallet[]) =>
        list.map(w => w.id === walletId ? updatedWallet : w);

      setWallets(prev => updateWalletInList(prev));
      if (walletMode === "soft_wallet") {
        setSoftWallets(prev => updateWalletInList(prev));
      } else {
        setHardWallets(prev => updateWalletInList(prev));
      }

      if (storageInitialized) {
        await clientStorage.setCachedBalances([{
          address: wallet.address,
          chainSymbol: chain.symbol,
          chainId: chain.chainId,
          balance,
        }]);
      }
    } catch (err) {
      console.error(`Failed to fetch balance for wallet ${walletId}:`, err);
    }
  }, [chains, storageInitialized, walletMode, softWallets, hardWallets]);

  const refreshTransactions = useCallback(async () => {
    if (wallets.length === 0 || chains.length === 0) return;
    
    setIsLoadingTransactions(true);
    try {
      const walletData = wallets.map(wallet => {
        const chain = chains.find(c => c.id === wallet.chainId);
        return {
          id: wallet.id,
          address: wallet.address,
          chainId: wallet.chainId,
          numericChainId: chain?.chainId || 0,
          chainSymbol: chain?.symbol || "ETH",
          blockExplorerUrl: chain?.blockExplorer,
        };
      });
      
      const explorerTxs = await fetchAllTransactions(walletData);
      
      const storedTxs = await clientStorage.getAllTransactions();
      const storedTxHashes = new Set(storedTxs.map(tx => tx.txHash).filter(Boolean));
      
      const newExplorerTxs = explorerTxs.filter(tx => !storedTxHashes.has(tx.txHash));
      
      const allTxs: Transaction[] = [
        ...storedTxs.map(tx => ({
          id: tx.id,
          walletId: tx.walletId,
          chainId: tx.chainId,
          type: tx.type as "send" | "receive",
          status: tx.status as "pending" | "confirmed" | "failed",
          amount: tx.amount,
          tokenSymbol: tx.tokenSymbol,
          toAddress: tx.toAddress,
          fromAddress: tx.fromAddress,
          txHash: tx.txHash || undefined,
          gasUsed: tx.gasUsed || undefined,
          timestamp: tx.timestamp,
        })),
        ...newExplorerTxs.map(tx => ({
          id: tx.id,
          walletId: tx.walletId,
          chainId: tx.chainId,
          type: tx.type,
          status: tx.status,
          amount: tx.amount,
          tokenSymbol: tx.tokenSymbol,
          toAddress: tx.toAddress,
          fromAddress: tx.fromAddress,
          txHash: tx.txHash,
          gasUsed: undefined,
          timestamp: tx.timestamp,
        })),
      ];
      
      allTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      setTransactions(allTxs);
    } catch (err) {
      console.error("Failed to refresh transactions:", err);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [wallets, chains]);

  const hasWalletOnDevice = hardwareState.type === "raspberry_pi" ? hardwareWallet.hasWalletOnDevice() : true;

  const toggleAssetEnabled = useCallback(async (assetId: string, enabled: boolean) => {
    const updated = await clientStorage.toggleAsset(assetId, enabled);
    setEnabledAssetIds(new Set(updated));
  }, []);

  const refreshTopAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    try {
      const assets = await fetchTopAssets(1000);
      setTopAssets(assets);
      
      // Sync enabledAssetIds with new asset list
      // Keep only IDs that exist in the new assets, preserve user preferences
      const newAssetIds = new Set(assets.map(a => a.id));
      setEnabledAssetIds(prev => {
        const synced = new Set<string>();
        // Keep enabled IDs that still exist in the new assets
        for (const id of Array.from(prev)) {
          if (newAssetIds.has(id)) {
            synced.add(id);
          }
        }
        // If after sync we lost all enabled assets but had some before, re-enable all
        if (synced.size === 0 && prev.size > 0) {
          clientStorage.setEnabledAssets(newAssetIds);
          return newAssetIds;
        }
        // Persist the synced preferences if changed
        if (synced.size !== prev.size) {
          clientStorage.setEnabledAssets(synced);
        }
        return synced;
      });
    } catch (err) {
      console.error("Failed to refresh top assets:", err);
    } finally {
      setIsLoadingAssets(false);
    }
  }, []);

  const enableAllAssets = useCallback(async () => {
    const allIds = new Set(topAssets.map(a => a.id));
    setEnabledAssetIds(allIds);
    await clientStorage.setEnabledAssets(allIds);
  }, [topAssets]);

  const disableAllAssets = useCallback(async () => {
    setEnabledAssetIds(new Set());
    await clientStorage.setEnabledAssets(new Set());
  }, []);

  const loadCustomTokens = useCallback(async () => {
    try {
      const tokens = await clientStorage.getCustomTokens();
      const enrichedTokens = tokens.map(token => {
        if (token.image) return token;
        const tokenSymbolUpper = token.symbol.toUpperCase().trim();
        const matchingAsset = FALLBACK_TOP_ASSETS.find(
          a => a.symbol.toUpperCase().trim() === tokenSymbolUpper
        );
        return {
          ...token,
          image: matchingAsset?.image
        };
      });
      setCustomTokens(enrichedTokens);
    } catch (err) {
      console.error("Failed to load custom tokens:", err);
    }
  }, []);

  const addCustomToken = useCallback(async (token: Omit<CustomToken, 'id' | 'addedAt'>): Promise<CustomToken> => {
    const newToken = await clientStorage.addCustomToken(token);
    setCustomTokens(prev => {
      const existingIndex = prev.findIndex(t => t.id === newToken.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newToken;
        return updated;
      }
      return [...prev, newToken];
    });
    return newToken;
  }, []);

  const removeCustomToken = useCallback(async (id: string): Promise<void> => {
    await clientStorage.removeCustomToken(id);
    setCustomTokens(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    if (storageInitialized) {
      loadCustomTokens();
    }
  }, [storageInitialized, loadCustomTokens]);

  const loadCustomChains = useCallback(async () => {
    try {
      const chains = await clientStorage.getCustomChains();
      setCustomChains(chains);
    } catch (err) {
      console.error("Failed to load custom chains:", err);
    }
  }, []);

  const addCustomChain = useCallback(async (chain: Omit<CustomChain, 'id' | 'addedAt'>): Promise<CustomChain> => {
    const newChain = await clientStorage.addCustomChain(chain);
    setCustomChains(prev => {
      const existingIndex = prev.findIndex(c => c.id === newChain.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newChain;
        return updated;
      }
      return [...prev, newChain];
    });
    return newChain;
  }, []);

  const removeCustomChain = useCallback(async (id: string): Promise<void> => {
    await clientStorage.removeCustomChain(id);
    setCustomChains(prev => prev.filter(c => c.id !== id));
  }, []);

  useEffect(() => {
    if (storageInitialized && !hasLoadedCustomChainsRef.current) {
      hasLoadedCustomChainsRef.current = true;
      loadCustomChains();
    }
  }, [storageInitialized, loadCustomChains]);

  // Fetch token balances for enabled tokens
  useEffect(() => {
    if (wallets.length === 0 || topAssets.length === 0) return;

    const walletAddresses: Record<string, string> = {};
    wallets.forEach(w => {
      const chain = chains.find(c => c.id === w.chainId);
      if (chain) {
        walletAddresses[chain.symbol] = w.address;
      }
    });

    const fetchTokenBalances = async () => {
      const tokenAssetIds = topAssets
        .filter(a => enabledAssetIds.has(a.id) && isTokenAsset(a.id))
        .map(a => a.id);
      
      const balancePromises = tokenAssetIds.map(async (assetId) => {
        try {
          const balance = await getTokenBalanceForAsset(assetId, walletAddresses);
          return [assetId, balance] as [string, string];
        } catch {
          return [assetId, "0"] as [string, string];
        }
      });
      
      const results = await Promise.all(balancePromises);
      const newBalances: Record<string, string> = {};
      results.forEach(([id, bal]) => {
        newBalances[id] = bal;
      });
      setTokenBalances(newBalances);
    };

    fetchTokenBalances();
    const tokenBalanceInterval = setInterval(fetchTokenBalances, 30000);
    return () => clearInterval(tokenBalanceInterval);
  }, [wallets.length, topAssets.length, enabledAssetIds.size, chains]);

  // Fetch custom token balances
  useEffect(() => {
    if (wallets.length === 0 || customTokens.length === 0) return;
    
    // Store wallet addresses by both chain symbol (e.g., "ETH") and chain ID (e.g., "ethereum")
    const walletAddresses: Record<string, string> = {};
    wallets.forEach(w => {
      const chain = chains.find(c => c.id === w.chainId);
      if (chain) {
        walletAddresses[chain.symbol] = w.address;
        walletAddresses[chain.id] = w.address;
      }
    });

    const fetchCustomTokenBalances = async () => {
      const balancePromises = customTokens.map(async (token) => {
        // Try both the chain symbol and chain ID to find the wallet address
        const walletAddress = walletAddresses[token.chainId] || walletAddresses[token.chainId.toUpperCase()];
        if (!walletAddress) return [token.id, "0"] as [string, string];
        
        try {
          const balance = await getCustomTokenBalance(
            walletAddress,
            token.contractAddress,
            token.chainType,
            token.evmChainId || 0,
            token.rpcUrl || "",
            token.decimals
          );
          return [token.id, balance] as [string, string];
        } catch {
          return [token.id, "0"] as [string, string];
        }
      });
      
      const results = await Promise.all(balancePromises);
      const newBalances: Record<string, string> = {};
      results.forEach(([id, bal]) => {
        newBalances[id] = bal;
      });
      setCustomTokenBalances(newBalances);
    };

    fetchCustomTokenBalances();
    const customTokenBalanceInterval = setInterval(fetchCustomTokenBalances, 30000);
    return () => clearInterval(customTokenBalanceInterval);
  }, [wallets.length, customTokens.length, chains]);

  // Secure add chain: verify seed phrase before adding new chain
  const verifySeedForAddChain = useCallback(async (inputSeedPhrase: string): Promise<boolean> => {
    if (walletMode !== "soft_wallet") {
      return false;
    }
    return await softWallet.verifySeedPhrase(inputSeedPhrase);
  }, [walletMode]);

  const getSeedWordCount = useCallback((): number | null => {
    if (walletMode !== "soft_wallet") {
      return null;
    }
    return softWallet.getSeedWordCount();
  }, [walletMode]);

  const confirmAddChain = useCallback(async (customLabel?: string): Promise<boolean> => {
    if (!pendingAddChain) {
      return false;
    }

    try {
      // Derive wallet for the pending chain
      const chainId = pendingAddChain.chainId;
      const targetChain = chains.find(c => c.id === chainId);
      if (!targetChain) {
        setPendingAddChain(null);
        return false;
      }

      let derivedAddress: string | null = null;
      
      if (walletMode === "soft_wallet") {
        // Derive address using soft wallet
        const addresses = await softWallet.deriveAddresses([targetChain.symbol], 0);
        if (addresses.length === 0) {
          setPendingAddChain(null);
          return false;
        }
        derivedAddress = addresses[0].address;
      } else {
        // Derive address using hardware wallet
        const mnemonic = await hardwareWallet.getSeedPhraseFromDevice();
        if (!mnemonic) {
          setPendingAddChain(null);
          return false;
        }
        const derivedAddresses = await deriveAllAddresses(mnemonic, [targetChain.symbol], 0);
        if (derivedAddresses.length === 0 || !derivedAddresses[0].address) {
          setPendingAddChain(null);
          return false;
        }
        derivedAddress = derivedAddresses[0].address;
      }

      const newWallet: Wallet = {
        id: `wallet-${chainId}-${Date.now()}`,
        deviceId: walletMode === "soft_wallet" ? "soft" : "hard",
        chainId: chainId,
        address: derivedAddress,
        balance: "0",
        isActive: true,
        accountIndex: 0,
        label: customLabel || targetChain.name,
      };

      // Update state
      const currentWallets = walletMode === "soft_wallet" ? softWallets : hardWallets;
      const updatedWallets = [...currentWallets, newWallet];
      
      if (walletMode === "soft_wallet") {
        setSoftWallets(updatedWallets);
      } else {
        setHardWallets(updatedWallets);
      }
      setWallets(updatedWallets);

      // Save to storage
      if (storageInitialized) {
        const walletsToSave: StoredWallet[] = updatedWallets.map(w => {
          const chain = chains.find(c => c.id === w.chainId);
          return {
            id: w.id,
            chainId: w.chainId,
            chainName: chain?.name || "",
            chainSymbol: chain?.symbol || "",
            address: w.address,
            balance: w.balance,
            path: `m/44'/${chain?.symbol === 'ETH' ? '60' : chain?.symbol === 'BTC' ? '0' : '501'}'/0'/0/${w.accountIndex}`,
            lastUpdated: new Date().toISOString(),
            accountIndex: w.accountIndex,
            label: w.label,
            walletGroupId: w.walletGroupId,
          };
        });
        
        if (walletMode === "soft_wallet") {
          await clientStorage.saveSoftWalletData(walletsToSave);
        } else {
          await clientStorage.saveHardWalletData(walletsToSave);
          
          // Save chain preferences to hardware for portability
          const chainPrefs = updatedWallets.map(w => {
            const chain = chains.find(c => c.id === w.chainId);
            return {
              symbol: chain?.symbol || "",
              accountIndex: w.accountIndex,
              label: w.label,
            };
          });
          await hardwareWallet.saveChainPreferences(chainPrefs);
        }
      }

      setPendingAddChain(null);
      return true;
    } catch (err) {
      console.error("Failed to add chain:", err);
      setPendingAddChain(null);
      return false;
    }
  }, [pendingAddChain, chains, walletMode, softWallets, hardWallets, storageInitialized]);

  const abortAddChain = useCallback(() => {
    setPendingAddChain(null);
  }, []);

  // Rename wallet
  const renameWallet = useCallback(async (walletId: string, newLabel: string): Promise<void> => {
    const currentWallets = walletMode === "soft_wallet" ? softWallets : hardWallets;
    const updatedWallets = currentWallets.map(w => 
      w.id === walletId ? { ...w, label: newLabel } : w
    );

    if (walletMode === "soft_wallet") {
      setSoftWallets(updatedWallets);
    } else {
      setHardWallets(updatedWallets);
    }
    setWallets(updatedWallets);

    // Save to storage
    if (storageInitialized) {
      const walletsToSave: StoredWallet[] = updatedWallets.map(w => {
        const chain = chains.find(c => c.id === w.chainId);
        return {
          id: w.id,
          chainId: w.chainId,
          chainName: chain?.name || "",
          chainSymbol: chain?.symbol || "",
          address: w.address,
          balance: w.balance,
          path: `m/44'/${chain?.symbol === 'ETH' ? '60' : chain?.symbol === 'BTC' ? '0' : '501'}'/0'/0/${w.accountIndex}`,
          lastUpdated: new Date().toISOString(),
          accountIndex: w.accountIndex,
          label: w.label,
          walletGroupId: w.walletGroupId,
        };
      });
      
      if (walletMode === "soft_wallet") {
        await clientStorage.saveSoftWalletData(walletsToSave);
      } else {
        await clientStorage.saveHardWalletData(walletsToSave);
        
        // Save chain preferences to hardware for portability
        const chainPrefs = updatedWallets.map(w => {
          const chain = chains.find(c => c.id === w.chainId);
          return {
            symbol: chain?.symbol || "",
            accountIndex: w.accountIndex,
            label: w.label,
          };
        });
        await hardwareWallet.saveChainPreferences(chainPrefs);
      }
    }
  }, [walletMode, softWallets, hardWallets, chains, storageInitialized]);

  const createAdditionalWallet = useCallback(async (label?: string, chainId?: string) => {
    // Check unlock status based on wallet mode
    if (walletMode === "soft_wallet") {
      if (softWallet.getState().status !== "unlocked") {
        const errorMsg = "Wallet must be unlocked to create additional wallet";
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    } else {
      const currentState = hardwareWallet.getState();
      if (currentState.status !== "unlocked") {
        const errorMsg = "Device must be unlocked to create additional wallet";
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    }

    setIsLoading(true);
    try {
      let mnemonic: string | null;
      if (walletMode === "soft_wallet") {
        mnemonic = softWallet.getSeedPhrase();
      } else {
        mnemonic = await hardwareWallet.getSeedPhraseFromDevice();
      }
      if (!mnemonic) {
        throw new Error("Cannot access seed phrase");
      }

      const currentChains = chains.length > 0 ? chains : DEFAULT_CHAINS.map((c, i) => ({
        ...c,
        id: `chain-${i}`,
      }));

      // Get current wallets from storage (source of truth for sequential adds)
      const currentData = walletMode === "soft_wallet"
        ? await clientStorage.getSoftWalletData()
        : await clientStorage.getHardWalletData();
      
      // Convert stored wallets to Wallet objects for merging (preserve walletGroupId!)
      const existingWallets: Wallet[] = currentData.map(w => ({
        id: w.id,
        deviceId: walletMode === "soft_wallet" ? "soft" : "hard",
        chainId: w.chainId,
        address: w.address,
        balance: w.balance || "0",
        isActive: true,
        accountIndex: w.accountIndex ?? 0,
        label: w.label,
        walletGroupId: w.walletGroupId, // Preserve independent seed wallet group
      }));

      // If chainId provided, get next index for that specific chain only
      const chainWallets = chainId 
        ? currentData.filter(w => w.chainId === chainId)
        : currentData;
      const nextIndex = chainWallets.length > 0 
        ? Math.max(...chainWallets.map(w => w.accountIndex ?? 0)) + 1 
        : 0;

      // Determine which chains to create wallets for
      const targetChains = chainId 
        ? currentChains.filter(c => c.id === chainId)
        : currentChains;
      
      if (targetChains.length === 0) {
        throw new Error("Invalid chain selected");
      }

      // Derive addresses only for target chain(s)
      const chainSymbols = targetChains.map(c => c.symbol);
      const derivedAddresses = await deriveAllAddresses(mnemonic, chainSymbols, nextIndex);

      // Create wallet objects with accountIndex and label
      const newWallets: Wallet[] = [];
      for (const derived of derivedAddresses) {
        const chain = targetChains.find(c => c.symbol === derived.chainSymbol);
        if (!chain || !derived.address) continue;

        const walletId = `wallet-${chain.id}-${derived.address.slice(0, 8)}-${nextIndex}`;

        const wallet: Wallet = {
          id: walletId,
          deviceId: walletMode === "soft_wallet" ? "soft" : "hard",
          chainId: chain.id,
          address: derived.address,
          balance: "0",
          isActive: true,
          accountIndex: nextIndex,
          label: label || `Wallet ${nextIndex + 1}`,
        };

        newWallets.push(wallet);
      }

      // Merge with existing wallets from storage (not stale state)
      const mergedWallets = [...existingWallets, ...newWallets];
      setWallets(mergedWallets);
      setSelectedAccountIndex(nextIndex);

      // Save to mode-specific storage with accountIndex, label, and walletGroupId
      if (storageInitialized) {
        const storedWalletsForMode: StoredWallet[] = mergedWallets.map(w => {
          const chain = currentChains.find(c => c.id === w.chainId);
          return {
            id: w.id,
            address: w.address,
            chainId: w.chainId,
            chainName: chain?.name || "",
            chainSymbol: chain?.symbol || "",
            balance: w.balance,
            path: `m/44'/60'/${w.accountIndex ?? 0}'/0/0`,
            lastUpdated: new Date().toISOString(),
            accountIndex: w.accountIndex ?? 0,
            label: w.label,
            walletGroupId: w.walletGroupId, // Preserve independent seed wallet group
          };
        });

        if (walletMode === "soft_wallet") {
          await clientStorage.saveSoftWalletData(storedWalletsForMode);
          setSoftWallets(mergedWallets);
        } else {
          await clientStorage.saveHardWalletData(storedWalletsForMode);
          setHardWallets(mergedWallets);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to create additional wallet");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [chains, wallets, walletMode, storageInitialized]);

  // Generate a new seed phrase (for UI to display before confirming)
  const generateNewSeedPhrase = useCallback((): string => {
    return softWallet.generateNewSeedPhrase();
  }, []);

  // Create a wallet with a completely new independent seed phrase
  const createWalletWithNewSeed = useCallback(async (label?: string, pin?: string): Promise<{ seedPhrase: string; walletGroupId: string }> => {
    if (walletMode !== "soft_wallet") {
      throw new Error("Independent seed wallets are only available in soft wallet mode");
    }
    
    if (!pin) {
      throw new Error("PIN is required to encrypt the new seed phrase");
    }

    setIsLoading(true);
    try {
      console.log("[createWalletWithNewSeed] Starting wallet creation with label:", label);
      
      // Generate new seed phrase
      const newSeedPhrase = softWallet.generateNewSeedPhrase();
      const walletGroupId = `wallet-group-${Date.now()}`;

      // Encrypt and store the new seed
      const { encryptedSeed, pinHash, pinSalt } = await softWallet.encryptSeedForWalletGroup(
        newSeedPhrase,
        pin,
        walletGroupId
      );

      await clientStorage.saveWalletSeed({
        walletGroupId,
        encryptedSeed,
        pinHash,
        pinSalt,
        createdAt: new Date().toISOString(),
      });

      const currentChains = chains.length > 0 ? chains : DEFAULT_CHAINS.map((c, i) => ({
        ...c,
        id: `chain-${i}`,
      }));

      // Get current wallets to find next account index
      const currentData = await clientStorage.getSoftWalletData();
      const nextIndex = clientStorage.getNextAccountIndex(currentData);

      // Derive addresses for all chains with the new seed (accountIndex 0 for this seed)
      const chainSymbols = currentChains.map(c => c.symbol);
      const derivedAddresses = await deriveAllAddresses(newSeedPhrase, chainSymbols, 0);

      // Create wallet objects with the new walletGroupId
      const newWallets: Wallet[] = [];
      for (const derived of derivedAddresses) {
        const chain = currentChains.find(c => c.symbol === derived.chainSymbol);
        if (!chain || !derived.address) continue;

        const walletId = `wallet-${chain.id}-${derived.address.slice(0, 8)}-${nextIndex}`;

        const wallet: Wallet = {
          id: walletId,
          deviceId: "soft",
          chainId: chain.id,
          address: derived.address,
          balance: "0",
          isActive: true,
          accountIndex: nextIndex,
          label: label || `Wallet ${nextIndex + 1}`,
          walletGroupId,
        };

        newWallets.push(wallet);
      }

      // Merge with existing wallets - use softWallets directly for consistency
      const currentSoftWallets = await clientStorage.getSoftWalletData();
      console.log("[createWalletWithNewSeed] Loaded existing wallets from storage:", currentSoftWallets.length);
      console.log("[createWalletWithNewSeed] Existing wallet IDs:", currentSoftWallets.map(w => w.id));
      
      const existingWallets: Wallet[] = currentSoftWallets.map(w => ({
        id: w.id,
        deviceId: "soft",
        chainId: w.chainId,
        address: w.address,
        balance: w.balance,
        isActive: true,
        accountIndex: w.accountIndex ?? 0,
        label: w.label,
        walletGroupId: w.walletGroupId,
      }));
      
      const mergedWallets = [...existingWallets, ...newWallets];
      console.log("[createWalletWithNewSeed] Merged wallets count:", mergedWallets.length);
      console.log("[createWalletWithNewSeed] Merged wallet IDs:", mergedWallets.map(w => w.id));
      
      setWallets(mergedWallets);
      setSoftWallets(mergedWallets);

      // Save to storage FIRST before returning
      if (storageInitialized) {
        const storedWalletsForMode: StoredWallet[] = mergedWallets.map(w => {
          const chain = currentChains.find(c => c.id === w.chainId);
          return {
            id: w.id,
            address: w.address,
            chainId: w.chainId,
            chainName: chain?.name || "",
            chainSymbol: chain?.symbol || "",
            balance: w.balance,
            path: `m/44'/60'/${w.accountIndex ?? 0}'/0/0`,
            lastUpdated: new Date().toISOString(),
            accountIndex: w.accountIndex ?? 0,
            label: w.label,
            walletGroupId: w.walletGroupId,
          };
        });

        await clientStorage.saveSoftWalletData(storedWalletsForMode);
        console.log("[createWalletWithNewSeed] Saved to storage:", storedWalletsForMode.length, "wallets");
        
        // Verify save was successful
        const verifyData = await clientStorage.getSoftWalletData();
        console.log("[createWalletWithNewSeed] Verification - storage now has:", verifyData.length, "wallets");
      }

      return { seedPhrase: newSeedPhrase, walletGroupId };
    } catch (err: any) {
      setError(err.message || "Failed to create wallet with new seed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [chains, walletMode, storageInitialized]);

  return (
    <WalletContext.Provider
      value={{
        hardwareState,
        isConnected,
        isUnlocked,
        hasWalletOnDevice,
        walletMode,
        setWalletMode,
        hasSoftWalletSetup,
        hasHardWalletSetup,
        currentModeHasWallet,
        chains,
        wallets,
        setWallets,
        transactions,
        setTransactions,
        tokens,
        setTokens,
        selectedChainId,
        setSelectedChainId,
        showPinModal,
        setShowPinModal,
        pinAction,
        setPinAction,
        pendingWalletAccess,
        setPendingWalletAccess,
        pendingTransaction,
        setPendingTransaction,
        pendingWalletGroupId,
        setPendingWalletGroupId,
        unlockWalletGroup,
        lockWalletGroup,
        isWalletGroupUnlocked,
        isAnyWalletGroupUnlocked,
        connectLedger,
        connectRaspberryPi,
        connectSimulated,
        unlockWallet,
        lockWallet,
        disconnectDevice,
        deriveWallets,
        refreshBalances,
        refreshWalletBalance,
        refreshTransactions,
        resetSessionTimeout,
        isLoading,
        isLoadingTransactions,
        error,
        topAssets,
        enabledAssetIds,
        isLoadingAssets,
        toggleAssetEnabled,
        refreshTopAssets,
        enableAllAssets,
        disableAllAssets,
        createAdditionalWallet,
        createWalletWithNewSeed,
        generateNewSeedPhrase,
        selectedAccountIndex,
        setSelectedAccountIndex,
        availableAccounts,
        visibleWallets,
        customTokens,
        loadCustomTokens,
        addCustomToken,
        removeCustomToken,
        tokenBalances,
        setTokenBalances,
        customTokenBalances,
        setCustomTokenBalances,
        customChains,
        loadCustomChains,
        addCustomChain,
        removeCustomChain,
        balanceCacheStatus,
        pendingAddChain,
        setPendingAddChain,
        verifySeedForAddChain,
        confirmAddChain,
        abortAddChain,
        getSeedWordCount,
        renameWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}
