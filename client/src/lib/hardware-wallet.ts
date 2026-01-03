import "./polyfills";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Eth from "@ledgerhq/hw-app-eth";
import { ethers } from "ethers";
import { piWallet, type StoredChainPreference } from "./pi-wallet";
import { clientStorage } from "./client-storage";
import { mobileUsbSerial, isMobileWithUsbSupport } from "./mobile-usb-serial";
import { 
  signNonEvmTransaction, 
  type NonEvmTransactionParams,
  type SignedTransaction 
} from "./non-evm-chains";

export type HardwareWalletType = "ledger" | "simulated" | "raspberry_pi" | null;
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "locked" | "unlocked";

export interface HardwareWalletState {
  type: HardwareWalletType;
  status: ConnectionStatus;
  deviceName: string | null;
  error: string | null;
}

export interface DerivedAddress {
  path: string;
  address: string;
  chainId: number;
}

const BIP44_PATHS = {
  ethereum: "44'/60'/0'/0/0",
  bitcoin: "44'/0'/0'/0/0",
};

class HardwareWalletService {
  private transport: TransportWebHID | null = null;
  private ethApp: Eth | null = null;
  private state: HardwareWalletState = {
    type: null,
    status: "disconnected",
    deviceName: null,
    error: null,
  };
  private listeners: Set<(state: HardwareWalletState) => void> = new Set();
  private simulatedSeedPhrase: string | null = null;
  private simulatedPinHash: string | null = null;
  private sessionTimeout: ReturnType<typeof setTimeout> | null = null;
  private sessionTimeoutMs: number = 5 * 60 * 1000; // 5 minutes default

  private async hashPin(pin: string, salt?: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + (salt || "securevault-salt"));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  private generateSalt(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  private async encryptSeed(seed: string, pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(pin),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: encoder.encode("hardwallet-salt"), iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(seed)
    );
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  private async decryptSeed(encryptedSeed: string, pin: string): Promise<string | null> {
    try {
      const encoder = new TextEncoder();
      const combined = new Uint8Array(atob(encryptedSeed).split("").map(c => c.charCodeAt(0)));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(pin),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      );
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: encoder.encode("hardwallet-salt"), iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encrypted
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      return null;
    }
  }

  getState(): HardwareWalletState {
    return { ...this.state };
  }

  subscribe(listener: (state: HardwareWalletState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(updates: Partial<HardwareWalletState>) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener(this.getState()));
  }

  isMobileDevice(): boolean {
    if (typeof navigator === "undefined") return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && /Mobile|Tablet/i.test(navigator.userAgent));
  }

  isWebHIDSupported(): boolean {
    return typeof navigator !== "undefined" && "hid" in navigator;
  }

  isWebSerialSupported(): boolean {
    return piWallet.isWebSerialSupported();
  }

  private picoHasWallet: boolean = false;

  hasWalletOnDevice(): boolean {
    return this.picoHasWallet;
  }

  setHasWalletOnDevice(hasWallet: boolean): void {
    this.picoHasWallet = hasWallet;
  }

  private usingMobileUsb = false;
  private mobileMonitoringStarted = false;

  async initMobileDeviceMonitoring(): Promise<void> {
    if (this.mobileMonitoringStarted || !isMobileWithUsbSupport()) return;
    
    this.mobileMonitoringStarted = true;
    console.log("[HardwareWallet] Starting mobile USB device monitoring...");
    
    mobileUsbSerial.onDeviceAttached(async (device) => {
      console.log("[HardwareWallet] USB device attached, attempting auto-connect:", device);
      if (device.vendorId === 11914) {
        await this.connectRaspberryPi();
      }
    });
    
    mobileUsbSerial.onDeviceDetached(() => {
      console.log("[HardwareWallet] USB device detached");
      if (this.usingMobileUsb) {
        this.setState({
          type: null,
          status: "disconnected",
          deviceName: null,
          error: "Hardware wallet disconnected",
        });
        this.usingMobileUsb = false;
        this.picoHasWallet = false;
      }
    });
    
    await mobileUsbSerial.startDeviceMonitoring();
    
    const devices = await mobileUsbSerial.getDeviceList();
    console.log("[HardwareWallet] Initial device list:", devices);
    const picoDevice = devices.find(d => d.vendorId === 11914);
    if (picoDevice) {
      console.log("[HardwareWallet] Pico device already connected, auto-connecting...");
      await this.connectRaspberryPi();
    }
  }

  async connectRaspberryPi(): Promise<boolean> {
    console.log("[HardwareWallet] connectRaspberryPi() called");
    
    // Try mobile USB serial first on Android
    if (isMobileWithUsbSupport()) {
      console.log("[HardwareWallet] Trying mobile USB serial...");
      try {
        const mobileAvailable = await mobileUsbSerial.isAvailable();
        if (mobileAvailable) {
          return await this.connectViaMobileUsb();
        }
      } catch (e) {
        console.log("[HardwareWallet] Mobile USB not available:", e);
      }
    }
    
    if (!this.isWebSerialSupported()) {
      console.log("[HardwareWallet] WebSerial not supported");
      const isMobile = this.isMobileDevice();
      this.setState({ 
        error: isMobile 
          ? "No Pico detected via USB. Connect your Pico using an OTG cable or use the Mobile Bridge."
          : "WebSerial is not supported in this browser. Please use Chrome or Edge on desktop.",
        status: "disconnected"
      });
      return false;
    }

    try {
      this.setState({ status: "connecting", error: null });
      console.log("[HardwareWallet] Status set to 'connecting'");

      const connected = await piWallet.connect();
      console.log("[HardwareWallet] piWallet.connect() result:", connected);
      if (!connected) {
        throw new Error("Failed to connect to Raspberry Pi");
      }

      const pong = await piWallet.ping();
      console.log("[HardwareWallet] piWallet.ping() result:", pong);
      if (!pong) {
        throw new Error("Device not responding");
      }

      const status = await piWallet.getStatus();
      console.log("[HardwareWallet] piWallet.getStatus() result:", status);
      
      this.picoHasWallet = status?.has_seed === true;
      console.log("[HardwareWallet] Device has wallet:", this.picoHasWallet);
      this.usingMobileUsb = false;
      
      // SECURITY: Always require PIN entry on connection, even if device reports unlocked
      // This prevents cached session from bypassing PIN verification
      this.setState({
        type: "raspberry_pi",
        status: "connected",  // Always start as connected, require PIN to unlock
        deviceName: status?.device_name || "Raspberry Pi Wallet",
        error: null,
      });
      console.log("[HardwareWallet] Final state:", this.getState());

      return true;
    } catch (error: any) {
      let errorMessage = "Failed to connect to Raspberry Pi wallet";
      
      if (error.message?.includes("No device selected")) {
        errorMessage = "No device selected. Please try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      this.setState({
        type: null,
        status: "disconnected",
        deviceName: null,
        error: errorMessage,
      });
      return false;
    }
  }

  private async connectViaMobileUsb(): Promise<boolean> {
    try {
      this.setState({ status: "connecting", error: null });
      console.log("[HardwareWallet] Connecting via mobile USB...");

      const connected = await mobileUsbSerial.connect();
      if (!connected) {
        throw new Error("Failed to connect via mobile USB");
      }

      const pong = await mobileUsbSerial.ping();
      if (!pong) {
        throw new Error("Device not responding");
      }

      const status = await mobileUsbSerial.getStatus();
      
      this.picoHasWallet = status?.has_seed === true;
      this.usingMobileUsb = true;
      
      this.setState({
        type: "raspberry_pi",
        status: "connected",
        deviceName: status?.device_name || "Pico Wallet (USB OTG)",
        error: null,
      });

      return true;
    } catch (error: any) {
      console.log("[HardwareWallet] Mobile USB connection failed:", error);
      this.setState({
        type: null,
        status: "disconnected",
        deviceName: null,
        error: error.message || "Failed to connect via USB",
      });
      return false;
    }
  }

  isUsingMobileUsb(): boolean {
    return this.usingMobileUsb;
  }

  async connectLedger(): Promise<boolean> {
    if (!this.isWebHIDSupported()) {
      this.setState({ 
        error: "WebHID is not supported in this browser. Please use Chrome, Edge, or Opera.",
        status: "disconnected"
      });
      return false;
    }

    try {
      this.setState({ status: "connecting", error: null });

      this.transport = await TransportWebHID.create() as TransportWebHID;
      this.ethApp = new Eth(this.transport as any);

      const config = await this.ethApp.getAppConfiguration();
      
      this.setState({
        type: "ledger",
        status: "connected",
        deviceName: `Ledger (Ethereum App v${config.version})`,
        error: null,
      });

      if (this.transport) {
        this.transport.on("disconnect", () => {
          this.handleDisconnect();
        });
      }

      return true;
    } catch (error: any) {
      let errorMessage = "Failed to connect to Ledger device";
      
      if (error.name === "TransportOpenUserCancelled") {
        errorMessage = "Connection cancelled by user";
      } else if (error.message?.includes("No device selected")) {
        errorMessage = "No device selected. Please try again.";
      } else if (error.statusCode === 0x6700) {
        errorMessage = "Please open the Ethereum app on your Ledger";
      } else if (error.statusCode === 0x6e00) {
        errorMessage = "App not open. Please open the Ethereum app on your Ledger";
      }

      this.setState({
        type: null,
        status: "disconnected",
        deviceName: null,
        error: errorMessage,
      });
      return false;
    }
  }

  async connectSimulated(seedPhrase: string, pin?: string): Promise<boolean> {
    try {
      this.setState({ status: "connecting", error: null });

      const words = seedPhrase.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        throw new Error("Seed phrase must be 12 or 24 words");
      }

      try {
        ethers.Mnemonic.fromPhrase(seedPhrase);
      } catch {
        throw new Error("Invalid seed phrase");
      }

      this.simulatedSeedPhrase = seedPhrase;
      
      if (pin) {
        const salt = this.generateSalt();
        this.simulatedPinHash = await this.hashPin(pin, salt);
        const encryptedSeed = await this.encryptSeed(seedPhrase, pin);
        await clientStorage.saveHardWalletEncryptedSeed(encryptedSeed, this.simulatedPinHash, salt);
      }

      this.setState({
        type: "simulated",
        status: "connected",
        deviceName: "Simulated Hardware Wallet",
        error: null,
      });

      return true;
    } catch (error: any) {
      this.setState({
        type: null,
        status: "disconnected",
        deviceName: null,
        error: error.message || "Failed to create simulated wallet",
      });
      return false;
    }
  }

  async setPin(pin: string): Promise<boolean> {
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      this.setState({ error: "PIN must be 4-6 digits" });
      return false;
    }
    const salt = this.generateSalt();
    this.simulatedPinHash = await this.hashPin(pin, salt);
    if (this.simulatedSeedPhrase) {
      const encryptedSeed = await this.encryptSeed(this.simulatedSeedPhrase, pin);
      await clientStorage.saveHardWalletEncryptedSeed(encryptedSeed, this.simulatedPinHash, salt);
    }
    return true;
  }

  async unlock(pin: string): Promise<boolean> {
    if (this.state.type === "raspberry_pi") {
      try {
        if (this.usingMobileUsb) {
          await mobileUsbSerial.unlock(pin);
        } else {
          await piWallet.unlock(pin);
        }
        this.setState({ status: "unlocked" });
        this.startSessionTimeout();
        return true;
      } catch (error: any) {
        this.setState({ error: error.message || "Failed to unlock" });
        return false;
      }
    }

    if (this.state.type === "simulated") {
      if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        this.setState({ error: "PIN must be 4-6 digits" });
        return false;
      }
      
      const storedPinHash = await clientStorage.getHardWalletPinHash();
      const storedSalt = await clientStorage.getHardWalletPinSalt();
      const encryptedSeed = await clientStorage.getHardWalletEncryptedSeed();
      
      if (storedPinHash && storedSalt && encryptedSeed) {
        const inputHash = await this.hashPin(pin, storedSalt);
        if (inputHash !== storedPinHash) {
          this.setState({ error: "Incorrect PIN" });
          return false;
        }
        const decryptedSeed = await this.decryptSeed(encryptedSeed, pin);
        if (!decryptedSeed) {
          this.setState({ error: "Failed to decrypt wallet" });
          return false;
        }
        this.simulatedSeedPhrase = decryptedSeed;
        this.simulatedPinHash = storedPinHash;
      } else if (this.simulatedPinHash) {
        const inputHash = await this.hashPin(pin);
        if (inputHash !== this.simulatedPinHash) {
          this.setState({ error: "Incorrect PIN" });
          return false;
        }
      } else {
        const salt = this.generateSalt();
        this.simulatedPinHash = await this.hashPin(pin, salt);
        if (this.simulatedSeedPhrase) {
          const encrypted = await this.encryptSeed(this.simulatedSeedPhrase, pin);
          await clientStorage.saveHardWalletEncryptedSeed(encrypted, this.simulatedPinHash, salt);
        }
      }
      
      this.setState({ status: "unlocked" });
      this.startSessionTimeout();
      return true;
    }

    if (this.state.type === "ledger" && this.state.status === "connected") {
      this.setState({ status: "unlocked" });
      this.startSessionTimeout();
      return true;
    }

    return false;
  }

  async getAddress(chainId: number = 1): Promise<string | null> {
    if (this.state.status !== "unlocked") {
      this.setState({ error: "Device is locked. Please unlock first." });
      return null;
    }

    try {
      if (this.state.type === "raspberry_pi") {
        if (this.usingMobileUsb) {
          return await mobileUsbSerial.getAddress(chainId);
        }
        return await piWallet.getAddress(chainId);
      }

      if (this.state.type === "ledger" && this.ethApp) {
        const path = BIP44_PATHS.ethereum;
        const result = await this.ethApp.getAddress(path);
        return result.address;
      }

      if (this.state.type === "simulated" && this.simulatedSeedPhrase) {
        const mnemonic = ethers.Mnemonic.fromPhrase(this.simulatedSeedPhrase);
        const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
        return hdNode.address;
      }

      return null;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to get address" });
      return null;
    }
  }

  async getMultipleAddresses(chainIds: number[]): Promise<DerivedAddress[]> {
    if (this.state.status !== "unlocked") {
      return [];
    }

    const addresses: DerivedAddress[] = [];

    try {
      if (this.state.type === "raspberry_pi") {
        if (this.usingMobileUsb) {
          const mobileAddresses = await mobileUsbSerial.getAddresses(chainIds);
          return mobileAddresses.map(addr => ({
            path: addr.path,
            address: addr.address,
            chainId: addr.chainId,
          }));
        }
        const piAddresses = await piWallet.getAddresses(chainIds);
        return piAddresses.map(addr => ({
          path: addr.path,
          address: addr.address,
          chainId: addr.chainId,
        }));
      }

      if (this.state.type === "simulated" && this.simulatedSeedPhrase) {
        const mnemonic = ethers.Mnemonic.fromPhrase(this.simulatedSeedPhrase);
        
        for (const chainId of chainIds) {
          const path = "m/44'/60'/0'/0/0";
          const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);
          addresses.push({
            path,
            address: hdNode.address,
            chainId,
          });
        }
      }

      if (this.state.type === "ledger" && this.ethApp) {
        const path = BIP44_PATHS.ethereum;
        const result = await this.ethApp.getAddress(path);
        
        for (const chainId of chainIds) {
          addresses.push({
            path,
            address: result.address,
            chainId,
          });
        }
      }
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to derive addresses" });
    }

    return addresses;
  }

  async signTransaction(unsignedTx: ethers.TransactionRequest): Promise<string | null> {
    if (this.state.status !== "unlocked") {
      this.setState({ error: "Device is locked" });
      return null;
    }

    try {
      if (this.state.type === "raspberry_pi") {
        const txData = {
          to: unsignedTx.to as string,
          value: unsignedTx.value?.toString() || "0",
          data: unsignedTx.data as string,
          nonce: Number(unsignedTx.nonce),
          gasLimit: unsignedTx.gasLimit?.toString() || "21000",
          gasPrice: unsignedTx.gasPrice?.toString(),
          maxFeePerGas: unsignedTx.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: unsignedTx.maxPriorityFeePerGas?.toString(),
          chainId: Number(unsignedTx.chainId) || 1,
        };
        if (this.usingMobileUsb) {
          return await mobileUsbSerial.signTransaction(txData);
        }
        return await piWallet.signTransaction(txData);
      }

      if (this.state.type === "simulated") {
        if (!this.simulatedSeedPhrase) {
          const encryptedSeed = await clientStorage.getHardWalletEncryptedSeed();
          if (encryptedSeed && this.simulatedPinHash) {
            this.setState({ error: "Wallet needs to be unlocked again" });
            return null;
          }
          this.setState({ error: "No seed phrase available for signing" });
          return null;
        }
        const mnemonic = ethers.Mnemonic.fromPhrase(this.simulatedSeedPhrase);
        const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
        const signedTx = await hdNode.signTransaction(unsignedTx);
        return signedTx;
      }

      if (this.state.type === "ledger" && this.ethApp) {
        const path = BIP44_PATHS.ethereum;
        
        const baseTx: ethers.TransactionLike = {
          to: unsignedTx.to as string,
          value: unsignedTx.value,
          data: unsignedTx.data as string,
          nonce: unsignedTx.nonce,
          gasLimit: unsignedTx.gasLimit,
          gasPrice: unsignedTx.gasPrice,
          chainId: unsignedTx.chainId,
        };

        const serialized = ethers.Transaction.from(baseTx).unsignedSerialized;
        const rawTxHex = serialized.slice(2);

        const signature = await this.ethApp.signTransaction(path, rawTxHex);

        const signedTx = ethers.Transaction.from({
          ...baseTx,
          signature: {
            r: "0x" + signature.r,
            s: "0x" + signature.s,
            v: parseInt(signature.v, 16),
          },
        });

        return signedTx.serialized;
      }

      return null;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign transaction" });
      return null;
    }
  }

  async signNonEvmTransaction(params: NonEvmTransactionParams): Promise<SignedTransaction | null> {
    if (this.state.status !== "unlocked") {
      this.setState({ error: "Device is locked" });
      return null;
    }

    try {
      if (this.state.type === "simulated" && this.simulatedSeedPhrase) {
        const result = await signNonEvmTransaction(params, this.simulatedSeedPhrase);
        if (!result) {
          this.setState({ error: "Failed to sign non-EVM transaction" });
          return null;
        }
        return result;
      }

      if (this.state.type === "raspberry_pi") {
        // For non-EVM chains, we use the cached seed from Pico for client-side signing
        // The seed is securely stored on Pico and only accessible when unlocked with PIN
        let seedPhrase: string | null = null;
        
        if (this.usingMobileUsb) {
          seedPhrase = mobileUsbSerial.getSeedPhrase();
          // If not cached, try to fetch it
          if (!seedPhrase) {
            seedPhrase = await mobileUsbSerial.ensureSeedCached();
          }
        } else {
          seedPhrase = piWallet.getSeedPhrase();
        }
        
        if (!seedPhrase) {
          this.setState({ error: "Wallet seed not available. Please reconnect and unlock." });
          return null;
        }
        
        const result = await signNonEvmTransaction(params, seedPhrase);
        if (!result) {
          this.setState({ error: "Failed to sign non-EVM transaction" });
          return null;
        }
        return result;
      }

      if (this.state.type === "ledger") {
        this.setState({ error: "Non-EVM signing on Ledger is not yet supported" });
        return null;
      }

      return null;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign non-EVM transaction" });
      return null;
    }
  }

  async signMessage(message: string): Promise<string | null> {
    if (this.state.status !== "unlocked") {
      this.setState({ error: "Device is locked" });
      return null;
    }

    try {
      if (this.state.type === "raspberry_pi") {
        if (this.usingMobileUsb) {
          return await mobileUsbSerial.signMessage(message);
        }
        return await piWallet.signMessage(message);
      }

      if (this.state.type === "simulated" && this.simulatedSeedPhrase) {
        const mnemonic = ethers.Mnemonic.fromPhrase(this.simulatedSeedPhrase);
        const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
        return await hdNode.signMessage(message);
      }

      if (this.state.type === "ledger" && this.ethApp) {
        const path = BIP44_PATHS.ethereum;
        const messageBuffer = Buffer.from(message);
        const signature = await this.ethApp.signPersonalMessage(path, messageBuffer as any);
        
        const vNum = typeof signature.v === 'string' ? Number.parseInt(signature.v, 16) : signature.v;
        const sig = ethers.Signature.from({
          r: "0x" + signature.r,
          s: "0x" + signature.s,
          v: vNum,
        } as any);
        return sig.serialized;
      }

      return null;
    } catch (error: any) {
      this.setState({ error: error.message || "Failed to sign message" });
      return null;
    }
  }

  private handleDisconnect() {
    this.transport = null;
    this.ethApp = null;
    this.setState({
      type: null,
      status: "disconnected",
      deviceName: null,
      error: "Device disconnected",
    });
  }

  async disconnect(): Promise<void> {
    this.clearSessionTimeout();
    if (this.state.type === "raspberry_pi") {
      if (this.usingMobileUsb) {
        await mobileUsbSerial.disconnect();
      } else {
        await piWallet.disconnect();
      }
    }
    if (this.transport) {
      await this.transport.close();
    }
    this.transport = null;
    this.ethApp = null;
    this.simulatedSeedPhrase = null;
    this.simulatedPinHash = null;
    this.picoHasWallet = false;
    this.usingMobileUsb = false;
    this.setState({
      type: null,
      status: "disconnected",
      deviceName: null,
      error: null,
    });
  }

  async lock(): Promise<void> {
    if (this.state.status === "unlocked") {
      this.clearSessionTimeout();
      if (this.state.type === "raspberry_pi") {
        if (this.usingMobileUsb) {
          await mobileUsbSerial.lock();
        } else {
          await piWallet.lock();
        }
      }
      this.setState({ status: "connected" });
    }
  }

  private startSessionTimeout(): void {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      if (this.state.status === "unlocked") {
        this.lock();
      }
    }, this.sessionTimeoutMs);
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

  setSessionTimeoutMs(ms: number): void {
    this.sessionTimeoutMs = ms;
    if (this.state.status === "unlocked") {
      this.startSessionTimeout();
    }
  }

  getSessionTimeoutMs(): number {
    return this.sessionTimeoutMs;
  }

  getSeedPhrase(): string | null {
    if (this.state.type === "simulated" && this.simulatedSeedPhrase) {
      return this.simulatedSeedPhrase;
    }
    return null;
  }

  async getSeedPhraseFromDevice(): Promise<string | null> {
    if (this.state.type === "raspberry_pi") {
      try {
        if (this.usingMobileUsb) {
          return await mobileUsbSerial.getSeedPhrase();
        }
        return await piWallet.getSeedPhrase();
      } catch (error) {
        console.error("Failed to get seed phrase from device:", error);
        return null;
      }
    }
    return this.getSeedPhrase();
  }

  async hasStoredHardWallet(): Promise<boolean> {
    return await clientStorage.hasHardWalletEncryptedSeed();
  }

  async reconnectFromStorage(): Promise<boolean> {
    const hasStored = await clientStorage.hasHardWalletEncryptedSeed();
    if (!hasStored) {
      return false;
    }
    this.setState({
      type: "simulated",
      status: "connected",
      deviceName: "Simulated Hardware Wallet",
      error: null,
    });
    return true;
  }

  async saveChainPreferences(chains: StoredChainPreference[]): Promise<boolean> {
    if (this.state.type === "raspberry_pi" && this.state.status === "unlocked") {
      try {
        const saved = this.usingMobileUsb 
          ? await mobileUsbSerial.saveChains(chains)
          : await piWallet.saveChains(chains);
        if (saved) {
          console.log("[HardwareWallet] Chain preferences saved to hardware");
          return true;
        }
        console.log("[HardwareWallet] Hardware doesn't support chain storage, using fallback");
        await clientStorage.saveHardWalletChainPreferences(chains);
        return true;
      } catch (error) {
        console.error("[HardwareWallet] Failed to save chains to hardware:", error);
        await clientStorage.saveHardWalletChainPreferences(chains);
        return true;
      }
    }
    await clientStorage.saveHardWalletChainPreferences(chains);
    return true;
  }

  async getChainPreferences(): Promise<StoredChainPreference[] | null> {
    if (this.state.type === "raspberry_pi" && this.state.status === "unlocked") {
      try {
        const chains = this.usingMobileUsb
          ? await mobileUsbSerial.getChains()
          : await piWallet.getChains();
        if (chains !== null) {
          console.log("[HardwareWallet] Chain preferences loaded from hardware:", chains);
          return chains;
        }
        console.log("[HardwareWallet] Hardware doesn't support chain storage, using fallback");
        return await clientStorage.getHardWalletChainPreferences();
      } catch (error) {
        console.error("[HardwareWallet] Failed to load chains from hardware:", error);
        return await clientStorage.getHardWalletChainPreferences();
      }
    }
    return await clientStorage.getHardWalletChainPreferences();
  }

  async setupWallet(pin: string, seedPhrase: string): Promise<boolean> {
    console.log("[HardwareWallet] setupWallet called, usingMobileUsb:", this.usingMobileUsb);
    try {
      if (this.usingMobileUsb) {
        console.log("[HardwareWallet] Setting up via mobile USB...");
        return await mobileUsbSerial.setupWallet(pin, seedPhrase);
      } else {
        console.log("[HardwareWallet] Setting up via desktop serial...");
        return await piWallet.setupWallet(pin, seedPhrase);
      }
    } catch (error) {
      console.error("[HardwareWallet] setupWallet failed:", error);
      throw error;
    }
  }
}

export const hardwareWallet = new HardwareWalletService();
