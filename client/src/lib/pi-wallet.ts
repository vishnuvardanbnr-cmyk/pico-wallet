declare global {
  interface Navigator {
    serial: Serial;
  }
  interface Serial {
    requestPort(options?: { filters?: Array<{ usbVendorId: number }> }): Promise<SerialPort>;
  }
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
  }
}

export interface PiWalletResponse {
  success?: boolean;
  error?: string;
  message?: string;
  has_wallet?: boolean;
  unlocked?: boolean;
  locked_out?: boolean;
  lockout_remaining?: number;
  seed?: string;
  signature?: string;
  pong?: boolean;
  chains?: string[];
}

export interface StoredChainPreference {
  symbol: string;
  accountIndex: number;
  label?: string;
}

export interface PiWalletStatus {
  initialized: boolean;
  locked: boolean;
  has_seed: boolean;
  device_name?: string;
}

class PiWalletService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private connected: boolean = false;
  private readBuffer: string = "";
  private responseResolver: ((value: PiWalletResponse) => void) | null = null;
  private responseTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentPin: string | null = null;
  private cachedSeed: string | null = null;

  isWebSerialSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async connect(): Promise<boolean> {
    if (!this.isWebSerialSupported()) {
      throw new Error("WebSerial is not supported in this browser. Please use Chrome or Edge.");
    }

    // Clean up any previous connection attempt
    await this.disconnect();

    try {
      // Show all serial devices (no filter) so user can select their Pico
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });

      if (this.port.readable && this.port.writable) {
        this.reader = this.port.readable.getReader();
        this.writer = this.port.writable.getWriter();
        this.connected = true;
        this.startReading();
        
        await this.delay(500);
        return true;
      }
      return false;
    } catch (error: any) {
      if (error.name === "NotFoundError") {
        throw new Error("No device selected. Please try again.");
      }
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.currentPin = null;
    this.cachedSeed = null;
    
    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch {}
      this.reader = null;
    }
    
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch {}
      this.writer = null;
    }
    
    if (this.port) {
      try {
        await this.port.close();
      } catch {}
      this.port = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async startReading(): Promise<void> {
    const decoder = new TextDecoder();
    
    while (this.connected && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        
        this.readBuffer += decoder.decode(value);
        
        let newlineIndex;
        while ((newlineIndex = this.readBuffer.indexOf("\n")) !== -1) {
          const line = this.readBuffer.slice(0, newlineIndex).trim();
          this.readBuffer = this.readBuffer.slice(newlineIndex + 1);
          
          if (line && line.startsWith("{") && this.responseResolver) {
            try {
              const response = JSON.parse(line) as PiWalletResponse;
              if (this.responseTimeout) {
                clearTimeout(this.responseTimeout);
                this.responseTimeout = null;
              }
              this.responseResolver(response);
              this.responseResolver = null;
            } catch {}
          }
        }
      } catch (error) {
        if (this.connected) {
          console.error("Read error:", error);
        }
        break;
      }
    }
  }

  async sendCommand(action: string, params?: Record<string, any>): Promise<PiWalletResponse> {
    if (!this.writer || !this.connected) {
      throw new Error("Not connected to Pico wallet");
    }

    const message = JSON.stringify({ action, ...params }) + "\r\n";
    const encoder = new TextEncoder();
    await this.writer.write(encoder.encode(message));

    return new Promise((resolve, reject) => {
      this.responseResolver = resolve;
      this.responseTimeout = setTimeout(() => {
        this.responseResolver = null;
        reject(new Error("Command timed out"));
      }, 10000);
    });
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.sendCommand("ping");
      return response.pong === true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<PiWalletStatus | null> {
    try {
      const response = await this.sendCommand("status");
      return {
        initialized: response.has_wallet === true,
        locked: response.unlocked !== true,
        has_seed: response.has_wallet === true,
        device_name: "Pico Hardware Wallet",
      };
    } catch {
      return null;
    }
  }

  async setupWallet(pin: string, seedPhrase: string): Promise<boolean> {
    const response = await this.sendCommand("setup", { pin, seed: seedPhrase });
    if (response.error) {
      throw new Error(response.error);
    }
    if (response.success) {
      this.currentPin = pin;
      this.cachedSeed = seedPhrase;
      return true;
    }
    return false;
  }

  async unlock(pin: string): Promise<boolean> {
    const response = await this.sendCommand("unlock", { pin });
    if (response.error) {
      throw new Error(response.error);
    }
    if (response.success) {
      this.currentPin = pin;
      
      if (!this.cachedSeed) {
        const seedResponse = await this.sendCommand("get_seed", { pin });
        if (seedResponse.seed) {
          this.cachedSeed = seedResponse.seed;
        }
      }
      return true;
    }
    return false;
  }

  async lock(): Promise<boolean> {
    const response = await this.sendCommand("lock");
    this.cachedSeed = null;
    return response.success === true;
  }

  getSeedPhrase(): string | null {
    return this.cachedSeed;
  }

  async getAddress(chainId: number = 1): Promise<string | null> {
    if (!this.cachedSeed) {
      throw new Error("Wallet not unlocked");
    }
    
    const { ethers } = await import("ethers");
    const mnemonic = ethers.Mnemonic.fromPhrase(this.cachedSeed);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
    return hdNode.address;
  }

  async getAddresses(chainIds: number[]): Promise<Array<{ chainId: number; address: string; path: string }>> {
    if (!this.cachedSeed) {
      throw new Error("Wallet not unlocked");
    }

    const { ethers } = await import("ethers");
    const mnemonic = ethers.Mnemonic.fromPhrase(this.cachedSeed);
    const path = "m/44'/60'/0'/0/0";
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, path);
    
    return chainIds.map(chainId => ({
      chainId,
      address: hdNode.address,
      path,
    }));
  }

  async signTransaction(tx: {
    to: string;
    value: string;
    data?: string;
    nonce: number;
    gasLimit: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    chainId: number;
  }): Promise<string> {
    if (!this.cachedSeed) {
      throw new Error("Wallet not unlocked");
    }

    const { ethers } = await import("ethers");
    const mnemonic = ethers.Mnemonic.fromPhrase(this.cachedSeed);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
    
    const txRequest: Record<string, any> = {
      to: tx.to,
      value: BigInt(tx.value),
      data: tx.data || "0x",
      nonce: tx.nonce,
      gasLimit: BigInt(tx.gasLimit),
      chainId: tx.chainId,
    };

    if (tx.maxFeePerGas && tx.maxPriorityFeePerGas) {
      txRequest.maxFeePerGas = BigInt(tx.maxFeePerGas);
      txRequest.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
    } else if (tx.gasPrice) {
      txRequest.gasPrice = BigInt(tx.gasPrice);
    }

    const signedTx = await hdNode.signTransaction(txRequest);
    return signedTx;
  }

  async signMessage(message: string): Promise<string> {
    if (!this.cachedSeed) {
      throw new Error("Wallet not unlocked");
    }

    const { ethers } = await import("ethers");
    const mnemonic = ethers.Mnemonic.fromPhrase(this.cachedSeed);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
    
    return await hdNode.signMessage(message);
  }

  async initWallet(seedPhrase?: string): Promise<{ mnemonic: string } | null> {
    if (!this.currentPin) {
      throw new Error("PIN not set. Please unlock first.");
    }
    
    let mnemonic = seedPhrase;
    if (!mnemonic) {
      const { ethers } = await import("ethers");
      const wallet = ethers.Wallet.createRandom();
      mnemonic = wallet.mnemonic?.phrase;
    }
    
    if (!mnemonic) {
      throw new Error("Failed to generate mnemonic");
    }

    const success = await this.setupWallet(this.currentPin, mnemonic);
    if (success) {
      return { mnemonic };
    }
    return null;
  }

  async wipe(): Promise<boolean> {
    if (!this.currentPin) {
      throw new Error("PIN required to reset wallet");
    }
    const response = await this.sendCommand("reset", { pin: this.currentPin });
    if (response.success) {
      this.cachedSeed = null;
      return true;
    }
    return false;
  }

  async factoryReset(): Promise<boolean> {
    try {
      const response = await this.sendCommand("factory_reset");
      if (response.success) {
        this.cachedSeed = null;
        this.currentPin = null;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async saveChains(chains: StoredChainPreference[]): Promise<boolean> {
    if (!this.currentPin) {
      throw new Error("Wallet must be unlocked to save chains");
    }
    try {
      const response = await this.sendCommand("save_chains", { 
        pin: this.currentPin, 
        chains: JSON.stringify(chains) 
      });
      if (response.error === "unsupported_command") {
        console.log("[PiWallet] Device does not support chain storage - using fallback");
        return false;
      }
      return response.success === true;
    } catch (error: any) {
      if (error.message?.includes("unsupported") || error.message?.includes("unknown")) {
        console.log("[PiWallet] Device does not support chain storage - using fallback");
        return false;
      }
      throw error;
    }
  }

  async getChains(): Promise<StoredChainPreference[] | null> {
    if (!this.currentPin) {
      throw new Error("Wallet must be unlocked to get chains");
    }
    try {
      const response = await this.sendCommand("get_chains", { pin: this.currentPin });
      if (response.error === "unsupported_command") {
        console.log("[PiWallet] Device does not support chain storage - using fallback");
        return null;
      }
      if (response.chains) {
        if (typeof response.chains === "string") {
          return JSON.parse(response.chains);
        }
        return response.chains as unknown as StoredChainPreference[];
      }
      return [];
    } catch (error: any) {
      if (error.message?.includes("unsupported") || error.message?.includes("unknown") || error.message?.includes("timed out")) {
        console.log("[PiWallet] Device does not support chain storage or command timed out - using fallback");
        return null;
      }
      throw error;
    }
  }

  supportsChainStorage(): boolean {
    return true;
  }
}

export const piWallet = new PiWalletService();
