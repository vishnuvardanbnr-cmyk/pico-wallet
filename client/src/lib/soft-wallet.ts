import { clientStorage } from "./client-storage";
import { deriveAllAddresses, type DerivedAddress } from "./multi-chain-address";
import { Mnemonic, HDNodeWallet, type TransactionRequest } from "ethers";
import { 
  signNonEvmTransaction, 
  type NonEvmTransactionParams,
  type SignedTransaction 
} from "./non-evm-chains";

export type SoftWalletStatus = "disconnected" | "locked" | "unlocked";

export interface SoftWalletState {
  status: SoftWalletStatus;
  error: string | null;
  hasWallet: boolean;
  unlockedWalletGroups: Set<string>; // Track which wallet groups are unlocked
}

// Wallet group session info
interface WalletGroupSession {
  decryptedSeed: string;
  timeout: ReturnType<typeof setTimeout>;
}

type StateListener = (state: SoftWalletState) => void;

// Crypto constants
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// Primary wallet group ID for wallets without explicit walletGroupId
export const PRIMARY_WALLET_GROUP = "primary";

class SoftWallet {
  private state: SoftWalletState = {
    status: "disconnected",
    error: null,
    hasWallet: false,
    unlockedWalletGroups: new Set<string>(),
  };
  
  private listeners: Set<StateListener> = new Set();
  private decryptedSeed: string | null = null; // Primary seed
  private sessionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  
  // Multi-group session management
  private walletGroupSessions: Map<string, WalletGroupSession> = new Map();

  getState(): SoftWalletState {
    return { 
      ...this.state, 
      unlockedWalletGroups: new Set(this.state.unlockedWalletGroups) 
    };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const currentState = this.getState();
    this.listeners.forEach(listener => listener(currentState));
  }

  private setState(updates: Partial<SoftWalletState>): void {
    // Ensure immutability for the unlockedWalletGroups Set
    this.state = { 
      ...this.state, 
      ...updates,
      // Always create a new Set to prevent external mutation leaks
      unlockedWalletGroups: updates.unlockedWalletGroups 
        ? new Set(updates.unlockedWalletGroups) 
        : new Set(this.state.unlockedWalletGroups)
    };
    this.notifyListeners();
  }

  // Derive an AES-GCM key from PIN using PBKDF2
  private async deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);
    
    // Import PIN as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      pinBytes,
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    
    // Derive AES-GCM key using PBKDF2
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // Encrypt seed phrase with PIN using AES-GCM
  private async encryptSeed(seed: string, pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const seedBytes = encoder.encode(seed);
    
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Derive key
    const key = await this.deriveKey(pin, salt);
    
    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      seedBytes
    );
    
    // Combine salt + iv + ciphertext and encode as base64
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }

  // Decrypt seed phrase with PIN using AES-GCM
  private async decryptSeed(encryptedData: string, pin: string): Promise<string> {
    // Decode base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract salt, iv, ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
    
    // Derive key
    const key = await this.deriveKey(pin, salt);
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  // Create a salted hash of the PIN for verification using PBKDF2
  private async hashPin(pin: string, salt?: Uint8Array): Promise<{ hash: string; salt: string }> {
    const pinSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);
    
    // Import PIN as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      pinBytes,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    
    // Derive bits for hash
    const hashBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: pinSalt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    
    const hashArray = new Uint8Array(hashBits);
    return {
      hash: btoa(String.fromCharCode(...hashArray)),
      salt: btoa(String.fromCharCode(...pinSalt)),
    };
  }

  // Verify PIN against stored hash
  private async verifyPin(pin: string, storedHash: string, storedSalt: string): Promise<boolean> {
    const salt = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));
    const { hash } = await this.hashPin(pin, salt);
    return hash === storedHash;
  }

  // Check if wallet is set up (has encrypted seed in storage)
  async checkWalletExists(): Promise<boolean> {
    const hasWallet = await clientStorage.hasEncryptedSeed();
    this.setState({ hasWallet });
    return hasWallet;
  }

  // Set up a new soft wallet with seed phrase and PIN
  async setup(seedPhrase: string, pin: string): Promise<boolean> {
    try {
      const words = seedPhrase.trim().toLowerCase().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        this.setState({ error: "Seed phrase must be 12 or 24 words" });
        return false;
      }

      // Encrypt seed with proper AES-GCM
      const normalizedSeed = words.join(" ");
      const encryptedSeed = await this.encryptSeed(normalizedSeed, pin);
      
      // Create salted PIN hash for verification
      const { hash: pinHash, salt: pinSalt } = await this.hashPin(pin);
      
      // Store with salt
      await clientStorage.saveEncryptedSeed(encryptedSeed, pinHash, pinSalt);
      await clientStorage.setSoftWalletSetup(true);
      
      // Keep decrypted seed in memory for this session
      this.decryptedSeed = normalizedSeed;
      
      this.setState({ 
        status: "unlocked", 
        hasWallet: true, 
        error: null 
      });
      
      this.startSessionTimeout();
      return true;
    } catch (err: any) {
      this.setState({ error: err.message || "Failed to set up wallet" });
      return false;
    }
  }

  // Unlock wallet with PIN
  async unlock(pin: string): Promise<boolean> {
    try {
      const storedPinHash = await clientStorage.getPinHash();
      const storedPinSalt = await clientStorage.getPinSalt();
      const encryptedSeed = await clientStorage.getEncryptedSeed();
      
      if (!storedPinHash || !storedPinSalt || !encryptedSeed) {
        this.setState({ error: "No wallet found. Please set up first." });
        return false;
      }

      // Verify PIN using salted hash
      const isValid = await this.verifyPin(pin, storedPinHash, storedPinSalt);
      if (!isValid) {
        this.setState({ error: "Incorrect PIN" });
        return false;
      }

      // Decrypt seed using AES-GCM
      try {
        this.decryptedSeed = await this.decryptSeed(encryptedSeed, pin);
      } catch {
        this.setState({ error: "Failed to decrypt wallet. Incorrect PIN or corrupted data." });
        return false;
      }
      
      this.setState({ status: "unlocked", error: null });
      this.startSessionTimeout();
      return true;
    } catch (err: any) {
      this.setState({ error: err.message || "Failed to unlock wallet" });
      return false;
    }
  }

  // Lock wallet
  lock(): void {
    this.decryptedSeed = null;
    this.clearSessionTimeout();
    this.setState({ status: "locked", error: null });
  }

  // Get decrypted seed phrase (only available when unlocked)
  getSeedPhrase(): string | null {
    if (this.state.status !== "unlocked") {
      return null;
    }
    return this.decryptedSeed;
  }

  // Derive addresses for all chains
  async deriveAddresses(chainSymbols: string[], accountIndex: number = 0): Promise<DerivedAddress[]> {
    if (this.state.status !== "unlocked" || !this.decryptedSeed) {
      throw new Error("Wallet must be unlocked to derive addresses");
    }
    
    return await deriveAllAddresses(this.decryptedSeed, chainSymbols, accountIndex);
  }

  // Reset/disconnect - clears all stored data
  async reset(): Promise<void> {
    this.decryptedSeed = null;
    this.clearSessionTimeout();
    await clientStorage.clearEncryptedSeed();
    await clientStorage.clearSoftWallet();
    this.setState({ 
      status: "disconnected", 
      hasWallet: false, 
      error: null 
    });
  }

  // Session timeout management
  private startSessionTimeout(): void {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      this.lock();
    }, this.SESSION_TIMEOUT_MS);
  }

  private clearSessionTimeout(): void {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }
  }

  resetSessionTimeout(): void {
    if (this.state.status === "unlocked") {
      this.startSessionTimeout();
    }
  }

  isUnlocked(): boolean {
    return this.state.status === "unlocked";
  }

  // Verify a seed phrase matches the stored wallet's seed
  async verifySeedPhrase(inputSeedPhrase: string): Promise<boolean> {
    if (this.state.status !== "unlocked" || !this.decryptedSeed) {
      return false;
    }
    
    // Normalize the input: trim, lowercase, collapse whitespace
    const inputWords = inputSeedPhrase.trim().toLowerCase().split(/\s+/);
    const storedWords = this.decryptedSeed.split(" ");
    
    // Must have same number of words
    if (inputWords.length !== storedWords.length) {
      return false;
    }
    
    // Compare each word
    for (let i = 0; i < inputWords.length; i++) {
      if (inputWords[i] !== storedWords[i]) {
        return false;
      }
    }
    
    return true;
  }

  // Get the word count of the stored seed (12 or 24)
  getSeedWordCount(): number | null {
    if (this.state.status !== "unlocked" || !this.decryptedSeed) {
      return null;
    }
    return this.decryptedSeed.split(" ").length;
  }

  async signTransaction(unsignedTx: TransactionRequest): Promise<string | null> {
    if (this.state.status !== "unlocked" || !this.decryptedSeed) {
      this.setState({ error: "Wallet must be unlocked to sign transactions" });
      return null;
    }

    try {
      const mnemonic = Mnemonic.fromPhrase(this.decryptedSeed);
      const hdNode = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
      const signedTx = await hdNode.signTransaction(unsignedTx);
      return signedTx;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign transaction" });
      return null;
    }
  }

  async signNonEvmTransaction(params: NonEvmTransactionParams): Promise<SignedTransaction | null> {
    if (this.state.status !== "unlocked" || !this.decryptedSeed) {
      this.setState({ error: "Wallet must be unlocked to sign transactions" });
      return null;
    }

    try {
      const result = await signNonEvmTransaction(params, this.decryptedSeed);
      if (!result) {
        this.setState({ error: "Failed to sign non-EVM transaction" });
        return null;
      }
      return result;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign non-EVM transaction" });
      return null;
    }
  }

  async getAddress(chainId?: number): Promise<string | null> {
    if (this.state.status !== "unlocked" || !this.decryptedSeed) {
      return null;
    }

    try {
      const mnemonic = Mnemonic.fromPhrase(this.decryptedSeed);
      const hdNode = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
      return hdNode.address;
    } catch {
      return null;
    }
  }

  // Get address for a specific wallet group using its unlocked seed
  async getAddressWithGroup(walletGroupId: string | undefined, chainId?: number): Promise<string | null> {
    // If no walletGroupId or primary group, use regular getAddress
    if (!walletGroupId || walletGroupId === PRIMARY_WALLET_GROUP) {
      return this.getAddress(chainId);
    }

    // Check if this wallet group is unlocked
    const session = this.walletGroupSessions.get(walletGroupId);
    if (!session) {
      return null;
    }

    try {
      const mnemonic = Mnemonic.fromPhrase(session.decryptedSeed);
      const hdNode = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
      return hdNode.address;
    } catch {
      return null;
    }
  }

  // Encrypt a seed phrase for a new wallet group (independent seed)
  async encryptSeedForWalletGroup(
    seedPhrase: string,
    pin: string,
    walletGroupId: string
  ): Promise<{ encryptedSeed: string; pinHash: string; pinSalt: string }> {
    const words = seedPhrase.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      throw new Error("Seed phrase must be 12 or 24 words");
    }

    const normalizedSeed = words.join(" ");
    const encryptedSeed = await this.encryptSeed(normalizedSeed, pin);
    const { hash: pinHash, salt: pinSalt } = await this.hashPin(pin);

    return { encryptedSeed, pinHash, pinSalt };
  }

  // Decrypt a seed for a specific wallet group
  async decryptWalletGroupSeed(encryptedSeed: string, pin: string): Promise<string> {
    return await this.decryptSeed(encryptedSeed, pin);
  }

  // Verify PIN for a wallet group
  async verifyWalletGroupPin(pin: string, storedHash: string, storedSalt: string): Promise<boolean> {
    return await this.verifyPin(pin, storedHash, storedSalt);
  }

  // Generate a new random seed phrase
  generateNewSeedPhrase(): string {
    const entropy = crypto.getRandomValues(new Uint8Array(16)); // 128 bits = 12 words
    return Mnemonic.entropyToPhrase(entropy);
  }

  // ============================================
  // Wallet Group Management (Independent Seeds)
  // ============================================

  // Verify PIN and decrypt seed for a wallet group (used for transaction signing)
  // Returns decrypted seed on success, null on failure
  // Caller is responsible for clearing the seed after use
  async verifyAndDecryptWalletGroup(walletGroupId: string, pin: string): Promise<string | null> {
    try {
      // Handle PRIMARY_WALLET_GROUP
      if (!walletGroupId || walletGroupId === PRIMARY_WALLET_GROUP) {
        const storedPinHash = await clientStorage.getPinHash();
        const storedPinSalt = await clientStorage.getPinSalt();
        const encryptedSeed = await clientStorage.getEncryptedSeed();

        if (!storedPinHash || !storedPinSalt || !encryptedSeed) {
           this.setState({ error: "No primary wallet found. Please set up first." });
           return null;
        }

        const isValid = await this.verifyPin(pin, storedPinHash, storedPinSalt);
        if (!isValid) {
          this.setState({ error: "Incorrect PIN" });
          return null;
        }

        try {
          const decryptedSeed = await this.decryptSeed(encryptedSeed, pin);
          this.setState({ error: null });
          return decryptedSeed;
        } catch {
          this.setState({ error: "Failed to decrypt wallet. Incorrect PIN or corrupted data." });
          return null;
        }
      }

      // Handle Secondary Wallet Groups
      const walletSeed = await clientStorage.getWalletSeed(walletGroupId);
      if (!walletSeed) {
        this.setState({ error: `No wallet group found for ${walletGroupId}` });
        return null;
      }

      // Verify PIN
      const isValid = await this.verifyPin(pin, walletSeed.pinHash, walletSeed.pinSalt);
      if (!isValid) {
        this.setState({ error: "Incorrect PIN for this wallet" });
        return null;
      }

      // Decrypt seed
      try {
        const decryptedSeed = await this.decryptSeed(walletSeed.encryptedSeed, pin);
        this.setState({ error: null });
        return decryptedSeed;
      } catch {
        this.setState({ error: "Failed to decrypt wallet. Incorrect PIN or corrupted data." });
        return null;
      }
    } catch (err: any) {
      this.setState({ error: err.message || "Failed to verify wallet group" });
      return null;
    }
  }

  // Unlock a specific wallet group with its PIN (for viewing access)
  async unlockWalletGroup(walletGroupId: string, pin: string): Promise<boolean> {
    // Handle PRIMARY_WALLET_GROUP separately - use regular unlock flow
    if (walletGroupId === PRIMARY_WALLET_GROUP) {
      console.log("[unlockWalletGroup] Using primary wallet unlock flow");
      return await this.unlock(pin);
    }
    
    const decryptedSeed = await this.verifyAndDecryptWalletGroup(walletGroupId, pin);
    if (!decryptedSeed) {
      return false;
    }

    // Clear existing session for this group if any
    this.lockWalletGroup(walletGroupId);

    // Store decrypted seed - stays unlocked until manually locked or app closes
    this.walletGroupSessions.set(walletGroupId, {
      decryptedSeed,
      timeout: null as any,
    });

    // Update state
    const newUnlockedGroups = new Set(this.state.unlockedWalletGroups);
    newUnlockedGroups.add(walletGroupId);
    this.setState({ 
      unlockedWalletGroups: newUnlockedGroups,
      error: null 
    });

    return true;
  }

  // Lock a specific wallet group
  lockWalletGroup(walletGroupId: string): void {
    const session = this.walletGroupSessions.get(walletGroupId);
    if (session) {
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      this.walletGroupSessions.delete(walletGroupId);
    }

    const newUnlockedGroups = new Set(this.state.unlockedWalletGroups);
    newUnlockedGroups.delete(walletGroupId);
    this.setState({ unlockedWalletGroups: newUnlockedGroups });
  }

  // Check if a wallet group is unlocked
  isWalletGroupUnlocked(walletGroupId: string | undefined): boolean {
    // If no walletGroupId, check primary wallet unlock status
    if (!walletGroupId || walletGroupId === PRIMARY_WALLET_GROUP) {
      const result = this.state.status === "unlocked";
      console.log("[isWalletGroupUnlocked] PRIMARY_WALLET_GROUP, status:", this.state.status, "result:", result);
      return result;
    }
    const result = this.state.unlockedWalletGroups.has(walletGroupId);
    console.log("[isWalletGroupUnlocked] walletGroupId:", walletGroupId, "result:", result);
    return result;
  }

  // Get seed for a specific wallet group
  getSeedForWalletGroup(walletGroupId: string | undefined): string | null {
    // If no walletGroupId or primary, return main decrypted seed
    if (!walletGroupId || walletGroupId === PRIMARY_WALLET_GROUP) {
      return this.decryptedSeed;
    }

    const session = this.walletGroupSessions.get(walletGroupId);
    return session?.decryptedSeed || null;
  }

  // Reset session timeout for a wallet group
  resetWalletGroupSessionTimeout(walletGroupId: string): void {
    const session = this.walletGroupSessions.get(walletGroupId);
    if (session) {
      clearTimeout(session.timeout);
      const timeout = setTimeout(() => {
        this.lockWalletGroup(walletGroupId);
      }, this.SESSION_TIMEOUT_MS);
      session.timeout = timeout;
    }
  }

  // Get list of all unlocked wallet group IDs
  getUnlockedWalletGroups(): string[] {
    return Array.from(this.state.unlockedWalletGroups);
  }

  // Check if any wallet group is currently unlocked (for UI lock indicator)
  isAnyWalletGroupUnlocked(): boolean {
    return this.state.unlockedWalletGroups.size > 0;
  }

  // Lock all wallet groups (including primary)
  lockAllWalletGroups(): void {
    // Lock all independent wallet groups
    for (const groupId of this.walletGroupSessions.keys()) {
      this.lockWalletGroup(groupId);
    }
    // Also lock primary
    this.lock();
  }

  // Sign transaction with specific wallet group seed (requires group to be unlocked)
  async signTransactionWithGroup(
    unsignedTx: TransactionRequest, 
    walletGroupId: string | undefined,
    accountIndex: number = 0
  ): Promise<string | null> {
    const seed = this.getSeedForWalletGroup(walletGroupId);
    if (!seed) {
      const groupName = walletGroupId || "primary";
      this.setState({ error: `Wallet group ${groupName} must be unlocked to sign transactions` });
      return null;
    }

    try {
      const mnemonic = Mnemonic.fromPhrase(seed);
      const path = `m/44'/60'/${accountIndex}'/0/0`;
      const hdNode = HDNodeWallet.fromMnemonic(mnemonic, path);
      const signedTx = await hdNode.signTransaction(unsignedTx);
      return signedTx;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign transaction" });
      return null;
    }
  }

  // Sign transaction with PIN verification (always requires PIN, one-shot operation)
  // Seed is decrypted, used for signing, then discarded immediately
  async signTransactionWithPin(
    unsignedTx: TransactionRequest,
    walletGroupId: string,
    pin: string,
    accountIndex: number = 0
  ): Promise<string | null> {
    const seed = await this.verifyAndDecryptWalletGroup(walletGroupId, pin);
    if (!seed) {
      return null; // Error already set by verifyAndDecryptWalletGroup
    }

    try {
      const mnemonic = Mnemonic.fromPhrase(seed);
      const path = `m/44'/60'/${accountIndex}'/0/0`;
      const hdNode = HDNodeWallet.fromMnemonic(mnemonic, path);
      const signedTx = await hdNode.signTransaction(unsignedTx);
      // Seed is automatically garbage collected after function returns
      return signedTx;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign transaction" });
      return null;
    }
  }

  // Sign non-EVM transaction with specific wallet group seed (requires group to be unlocked)
  async signNonEvmTransactionWithGroup(
    params: NonEvmTransactionParams,
    walletGroupId: string | undefined
  ): Promise<SignedTransaction | null> {
    const seed = this.getSeedForWalletGroup(walletGroupId);
    if (!seed) {
      const groupName = walletGroupId || "primary";
      this.setState({ error: `Wallet group ${groupName} must be unlocked to sign transactions` });
      return null;
    }

    try {
      const result = await signNonEvmTransaction(params, seed);
      if (!result) {
        this.setState({ error: "Failed to sign non-EVM transaction" });
        return null;
      }
      return result;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign non-EVM transaction" });
      return null;
    }
  }

  // Sign non-EVM transaction with PIN verification (always requires PIN, one-shot operation)
  async signNonEvmTransactionWithPin(
    params: NonEvmTransactionParams,
    walletGroupId: string,
    pin: string
  ): Promise<SignedTransaction | null> {
    const seed = await this.verifyAndDecryptWalletGroup(walletGroupId, pin);
    if (!seed) {
      return null; // Error already set by verifyAndDecryptWalletGroup
    }

    try {
      const result = await signNonEvmTransaction(params, seed);
      if (!result) {
        this.setState({ error: "Failed to sign non-EVM transaction" });
        return null;
      }
      // Seed is automatically garbage collected after function returns
      return result;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign non-EVM transaction" });
      return null;
    }
  }

  // Get address for a wallet group with PIN verification (one-shot, no session)
  async getAddressWithPin(
    walletGroupId: string,
    pin: string,
    chainId?: number
  ): Promise<string | null> {
    const seed = await this.verifyAndDecryptWalletGroup(walletGroupId, pin);
    if (!seed) {
      return null;
    }

    try {
      const mnemonic = Mnemonic.fromPhrase(seed);
      const hdNode = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
      return hdNode.address;
    } catch {
      return null;
    }
  }

  // Derive addresses with specific wallet group seed
  async deriveAddressesForGroup(
    chainSymbols: string[], 
    accountIndex: number = 0,
    walletGroupId: string | undefined
  ): Promise<DerivedAddress[]> {
    const seed = this.getSeedForWalletGroup(walletGroupId);
    if (!seed) {
      const groupName = walletGroupId || "primary";
      throw new Error(`Wallet group ${groupName} must be unlocked to derive addresses`);
    }
    
    return await deriveAllAddresses(seed, chainSymbols, accountIndex);
  }
}

export const softWallet = new SoftWallet();
