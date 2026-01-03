import { Capacitor, registerPlugin } from "@capacitor/core";

interface UsbDevice {
  deviceId: number;
  vendorId: number;
  productId: number;
  deviceName: string;
  productName?: string;
  manufacturerName?: string;
}

interface UsbSerialPlugin {
  getDevices(): Promise<{ success: boolean; devices: Record<string, UsbDevice>; count: number }>;
  connect(options: { vendorId?: number; productId?: number }): Promise<{ success: boolean; deviceName?: string; error?: string }>;
  disconnect(): Promise<{ success: boolean }>;
  write(options: { data: string }): Promise<{ success: boolean; bytesWritten?: number; error?: string }>;
  read(options?: { timeout?: number }): Promise<{ success: boolean; data?: string; bytesRead?: number; error?: string }>;
  isConnected(): Promise<{ connected: boolean }>;
  requestDevice?(options?: { vendorId?: number }): Promise<{ success: boolean; device?: UsbDevice; error?: string }>;
  addListener(event: "usbData", callback: (data: { data: string }) => void): Promise<{ remove: () => void }>;
  addListener(event: "usbDisconnected", callback: () => void): Promise<{ remove: () => void }>;
  addListener(event: "usbAttached", callback: (data: { device: UsbDevice }) => void): Promise<{ remove: () => void }>;
}

const UsbSerial = registerPlugin<UsbSerialPlugin>("UsbSerial");

export function isMobileWithUsbSupport(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export class MobileUsbSerialService {
  private connected = false;
  private readBuffer = "";
  private responseResolver: ((value: any) => void) | null = null;
  private responseTimeout: ReturnType<typeof setTimeout> | null = null;
  private dataListener: { remove: () => void } | null = null;
  private disconnectListener: { remove: () => void } | null = null;
  private attachListener: { remove: () => void } | null = null;
  private cachedSeed: string | null = null;
  private currentPin: string | null = null;
  private onDeviceAttachedCallback: ((device: UsbDevice) => void) | null = null;
  private onDeviceDetachedCallback: (() => void) | null = null;

  async isAvailable(): Promise<boolean> {
    if (!isMobileWithUsbSupport()) {
      return false;
    }
    try {
      const result = await UsbSerial.getDevices();
      console.log('[MobileUsbSerial] getDevices result:', result);
      return result.success && result.count > 0;
    } catch (e) {
      console.log('[MobileUsbSerial] getDevices error:', e);
      return false;
    }
  }

  async getDeviceList(): Promise<UsbDevice[]> {
    if (!isMobileWithUsbSupport()) {
      return [];
    }
    try {
      const result = await UsbSerial.getDevices();
      if (result.success && result.devices) {
        return Object.values(result.devices);
      }
      return [];
    } catch {
      return [];
    }
  }

  onDeviceAttached(callback: (device: UsbDevice) => void): void {
    this.onDeviceAttachedCallback = callback;
  }

  onDeviceDetached(callback: () => void): void {
    this.onDeviceDetachedCallback = callback;
  }

  async startDeviceMonitoring(): Promise<void> {
    if (!isMobileWithUsbSupport()) return;
    
    try {
      this.attachListener = await UsbSerial.addListener("usbAttached", (data) => {
        console.log('[MobileUsbSerial] Device attached:', data.device);
        if (this.onDeviceAttachedCallback) {
          this.onDeviceAttachedCallback(data.device);
        }
      });
      
      this.disconnectListener = await UsbSerial.addListener("usbDisconnected", () => {
        console.log('[MobileUsbSerial] Device detached');
        this.connected = false;
        this.cachedSeed = null;
        if (this.onDeviceDetachedCallback) {
          this.onDeviceDetachedCallback();
        }
      });
    } catch (e) {
      console.log('[MobileUsbSerial] Failed to start device monitoring:', e);
    }
  }

  stopDeviceMonitoring(): void {
    if (this.attachListener) {
      this.attachListener.remove();
      this.attachListener = null;
    }
    if (this.disconnectListener) {
      this.disconnectListener.remove();
      this.disconnectListener = null;
    }
  }

  async connect(): Promise<boolean> {
    if (!isMobileWithUsbSupport()) {
      throw new Error("Mobile USB serial not available on this platform");
    }

    try {
      const result = await UsbSerial.connect({ vendorId: 11914 });
      
      if (!result.success) {
        throw new Error(result.error || "Failed to connect");
      }

      this.connected = true;
      
      this.dataListener = await UsbSerial.addListener("usbData", (event) => {
        this.handleData(event.data);
      });

      return true;
    } catch (error: any) {
      this.connected = false;
      throw error;
    }
  }

  private handleData(data: string) {
    this.readBuffer += data;
    
    let newlineIndex;
    while ((newlineIndex = this.readBuffer.indexOf("\n")) !== -1) {
      const line = this.readBuffer.slice(0, newlineIndex).trim();
      this.readBuffer = this.readBuffer.slice(newlineIndex + 1);
      
      if (line && line.startsWith("{") && this.responseResolver) {
        try {
          const response = JSON.parse(line);
          if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
          }
          this.responseResolver(response);
          this.responseResolver = null;
        } catch {}
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.dataListener) {
      this.dataListener.remove();
      this.dataListener = null;
    }
    
    try {
      await UsbSerial.disconnect();
    } catch {}
    
    this.connected = false;
    this.cachedSeed = null;
    this.readBuffer = "";
  }

  async sendCommand(action: string, params?: Record<string, any>): Promise<any> {
    if (!this.connected) {
      throw new Error("Not connected to Pico wallet");
    }

    const message = JSON.stringify({ action, ...params }) + "\r\n";
    
    const writeResult = await UsbSerial.write({ data: message });
    if (!writeResult.success) {
      throw new Error(writeResult.error || "Write failed");
    }

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

  async getStatus(): Promise<{ initialized: boolean; locked: boolean; has_seed: boolean; device_name: string } | null> {
    try {
      const response = await this.sendCommand("status");
      return {
        initialized: response.has_wallet === true,
        locked: response.unlocked !== true,
        has_seed: response.has_wallet === true,
        device_name: "Pico Hardware Wallet (USB)",
      };
    } catch {
      return null;
    }
  }

  async unlock(pin: string): Promise<boolean> {
    const response = await this.sendCommand("unlock", { pin });
    if (response.error) {
      throw new Error(response.error);
    }
    
    if (response.success === true || response.unlocked === true) {
      this.currentPin = pin;
      // Cache the seed for non-EVM signing
      if (!this.cachedSeed) {
        try {
          const seedResponse = await this.sendCommand("get_seed", { pin });
          if (seedResponse.seed) {
            this.cachedSeed = seedResponse.seed;
          }
        } catch (e) {
          console.warn("[MobileUsbSerial] Failed to cache seed:", e);
        }
      }
      return true;
    }
    return false;
  }
  
  getSeedPhrase(): string | null {
    return this.cachedSeed;
  }
  
  async ensureSeedCached(): Promise<string | null> {
    if (this.cachedSeed) {
      return this.cachedSeed;
    }
    
    // Use stored PIN from unlock
    if (!this.currentPin) {
      console.warn("[MobileUsbSerial] Cannot fetch seed: no PIN available (wallet not unlocked?)");
      return null;
    }
    
    try {
      const response = await this.sendCommand("get_seed", { pin: this.currentPin });
      if (response.seed) {
        this.cachedSeed = response.seed;
        return this.cachedSeed;
      }
    } catch (e) {
      console.warn("[MobileUsbSerial] Failed to retrieve seed:", e);
    }
    return null;
  }

  async setupWallet(pin: string, seedPhrase: string): Promise<boolean> {
    const response = await this.sendCommand("setup", { pin, seed: seedPhrase });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.success === true;
  }

  async getAddress(chainId: number): Promise<string | null> {
    try {
      const response = await this.sendCommand("get_address", { chain_id: chainId });
      if (response.error) {
        throw new Error(response.error);
      }
      return response.address || null;
    } catch {
      return null;
    }
  }

  async getAddresses(chainIds: number[]): Promise<{ path: string; address: string; chainId: number }[]> {
    try {
      const response = await this.sendCommand("get_addresses", { chain_ids: chainIds });
      if (response.error) {
        throw new Error(response.error);
      }
      return response.addresses || [];
    } catch {
      return [];
    }
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
  }): Promise<string | null> {
    try {
      const response = await this.sendCommand("sign_transaction", { tx });
      if (response.error) {
        throw new Error(response.error);
      }
      return response.signed_tx || null;
    } catch {
      return null;
    }
  }

  async signMessage(message: string): Promise<string | null> {
    try {
      const response = await this.sendCommand("sign_message", { message });
      if (response.error) {
        throw new Error(response.error);
      }
      return response.signature || null;
    } catch {
      return null;
    }
  }

  async lock(): Promise<boolean> {
    try {
      const response = await this.sendCommand("lock");
      // Clear cached seed and PIN on lock for security
      this.cachedSeed = null;
      this.currentPin = null;
      return response.success === true || response.locked === true;
    } catch {
      this.cachedSeed = null;
      this.currentPin = null;
      return false;
    }
  }

  async saveChains(chains: any[]): Promise<boolean> {
    try {
      const response = await this.sendCommand("save_chains", { chains });
      return response.success === true;
    } catch {
      return false;
    }
  }

  async getChains(): Promise<any[]> {
    try {
      const response = await this.sendCommand("get_chains");
      return response.chains || [];
    } catch {
      return [];
    }
  }

  isConnectedSync(): boolean {
    return this.connected;
  }
}

export const mobileUsbSerial = new MobileUsbSerialService();
