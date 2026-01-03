import { Capacitor, registerPlugin } from "@capacitor/core";
import { dappBridge } from "./dapp-bridge";

interface DAppBrowserPlugin {
  open(options: { url: string; address: string; chainId: number }): Promise<{ success: boolean }>;
  close(): Promise<{ success: boolean }>;
  updateAccount(options: { address: string; chainId: number }): Promise<{ success: boolean }>;
  sendResponse(options: { id: number; result?: string; error?: string }): Promise<{ success: boolean }>;
  resumeBrowser(): Promise<{ success: boolean }>;
  requestPin(options: { walletGroupId: string }): Promise<{ success: boolean }>;
  addListener(event: "browserEvent", callback: (data: { url: string; loading: boolean }) => void): Promise<{ remove: () => void }>;
  addListener(event: "web3Request", callback: (data: { id: number; method: string; params: string; confirmed?: boolean }) => void): Promise<{ remove: () => void }>;
  addListener(event: "pinResponse", callback: (data: { pin: string; walletGroupId: string; cancelled: boolean }) => void): Promise<{ remove: () => void }>;
}

const DAppBrowser = registerPlugin<DAppBrowserPlugin>("DAppBrowser");

export function isNativeDAppBrowserAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export class NativeDAppBrowserService {
  private browserEventListener: { remove: () => void } | null = null;
  private web3RequestListener: { remove: () => void } | null = null;
  private pinResponseListener: { remove: () => void } | null = null;
  private currentAddress: string = "";
  private currentChainId: number = 1;
  private onLoadingChange: ((loading: boolean) => void) | null = null;
  private onUrlChange: ((url: string) => void) | null = null;
  private onChainChange: ((chainId: number) => void) | null = null;
  private onDisconnect: (() => void) | null = null;
  private onSignRequest: ((method: string, params: any[], confirmed: boolean) => Promise<string | null>) | null = null;
  private onPinRequest: ((walletGroupId: string) => Promise<string | null>) | null = null;
  private pendingPinResolve: ((pin: string | null) => void) | null = null;

  async open(url: string, address: string, chainId: number): Promise<boolean> {
    console.log("[NativeDAppBrowser] open() called - url:", url, "address:", address, "chainId:", chainId);
    
    if (!isNativeDAppBrowserAvailable()) {
      console.log("[NativeDAppBrowser] Not available on this platform");
      return false;
    }

    this.currentAddress = address;
    this.currentChainId = chainId;

    try {
      // Setup listeners first
      this.browserEventListener = await DAppBrowser.addListener("browserEvent", (data) => {
        console.log("[NativeDAppBrowser] Browser event:", data);
        if (this.onLoadingChange) {
          this.onLoadingChange(data.loading);
        }
        if (this.onUrlChange && data.url) {
          this.onUrlChange(data.url);
        }
      });

      this.web3RequestListener = await DAppBrowser.addListener("web3Request", async (data) => {
        console.log("[NativeDAppBrowser] Web3 request:", data.method, "confirmed:", data.confirmed);
        await this.handleWeb3Request(data.id, data.method, data.params, data.confirmed || false);
      });
      
      this.pinResponseListener = await DAppBrowser.addListener("pinResponse", (data) => {
        console.log("[NativeDAppBrowser] PIN response received, cancelled:", data.cancelled);
        if (this.pendingPinResolve) {
          this.pendingPinResolve(data.cancelled ? null : data.pin);
          this.pendingPinResolve = null;
        }
      });

      // Open the browser activity
      const result = await DAppBrowser.open({ url, address, chainId });
      console.log("[NativeDAppBrowser] open result:", result);
      return result.success;
    } catch (e: any) {
      console.error("[NativeDAppBrowser] Error opening:", e?.message || e);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.browserEventListener) {
      this.browserEventListener.remove();
      this.browserEventListener = null;
    }
    if (this.web3RequestListener) {
      this.web3RequestListener.remove();
      this.web3RequestListener = null;
    }
    if (this.pinResponseListener) {
      this.pinResponseListener.remove();
      this.pinResponseListener = null;
    }

    if (isNativeDAppBrowserAvailable()) {
      try {
        await DAppBrowser.close();
      } catch (e) {
        console.error("[NativeDAppBrowser] Error closing:", e);
      }
    }
  }

  async updateAccount(address: string, chainId: number): Promise<void> {
    this.currentAddress = address;
    this.currentChainId = chainId;
    
    if (isNativeDAppBrowserAvailable()) {
      try {
        await DAppBrowser.updateAccount({ address, chainId });
      } catch (e) {
        console.error("[NativeDAppBrowser] Error updating account:", e);
      }
    }
  }

  setOnLoadingChange(callback: (loading: boolean) => void): void {
    this.onLoadingChange = callback;
  }

  setOnUrlChange(callback: (url: string) => void): void {
    this.onUrlChange = callback;
  }

  setOnChainChange(callback: (chainId: number) => void): void {
    this.onChainChange = callback;
  }

  setOnDisconnect(callback: () => void): void {
    this.onDisconnect = callback;
  }

  setOnSignRequest(callback: (method: string, params: any[], confirmed: boolean) => Promise<string | null>): void {
    this.onSignRequest = callback;
  }
  
  setOnPinRequest(callback: (walletGroupId: string) => Promise<string | null>): void {
    this.onPinRequest = callback;
  }
  
  // Request PIN from native dialog and wait for response
  async requestPin(walletGroupId: string): Promise<string | null> {
    if (!isNativeDAppBrowserAvailable()) return null;
    
    return new Promise((resolve) => {
      this.pendingPinResolve = resolve;
      DAppBrowser.requestPin({ walletGroupId }).catch(() => {
        this.pendingPinResolve = null;
        resolve(null);
      });
    });
  }

  private async handleWeb3Request(id: number, method: string, paramsStr: string, confirmed: boolean): Promise<void> {
    console.log("[NativeDAppBrowser] Handling request:", method, "id:", id, "confirmed:", confirmed);
    
    try {
      const params = JSON.parse(paramsStr || "[]");
      
      // Handle signing requests through the bridge
      // For signing methods, the native dialog shows confirmation first
      // Only process when confirmed=true (user clicked Confirm in native dialog)
      if (method === "eth_sendTransaction" || 
          method === "eth_signTransaction" ||
          method === "personal_sign" ||
          method === "eth_sign" ||
          method === "eth_signTypedData" ||
          method === "eth_signTypedData_v3" ||
          method === "eth_signTypedData_v4") {
        
        // Use the callback if set
        if (this.onSignRequest) {
          const result = await this.onSignRequest(method, params, confirmed);
          if (result) {
            await this.sendResponse(id, result, null);
          } else {
            await this.sendResponse(id, null, "User rejected");
          }
        } else {
          // Use dappBridge for signing
          dappBridge.setAccount(this.currentAddress);
          dappBridge.setChainId(this.currentChainId);
          await dappBridge.handleRequest({
            type: "web3_request",
            id,
            method,
            params
          });
          // Response is handled by dappBridge's response handler
        }
        return;
      }

      // Handle chain switch requests
      if (method === "wallet_switchEthereumChain") {
        const chainIdHex = params[0]?.chainId;
        if (chainIdHex) {
          const newChainId = parseInt(chainIdHex, 16);
          this.currentChainId = newChainId;
          if (this.onChainChange) {
            this.onChainChange(newChainId);
          }
        }
        await this.sendResponse(id, "null", null);
        return;
      }

      // For other methods, respond with success
      await this.sendResponse(id, "null", null);
    } catch (e: any) {
      console.error("[NativeDAppBrowser] Request error:", e);
      await this.sendResponse(id, null, e?.message || "Unknown error");
    }
  }

  private async sendResponse(id: number, result: string | null, error: string | null): Promise<void> {
    if (!isNativeDAppBrowserAvailable()) return;

    try {
      await DAppBrowser.sendResponse({
        id,
        result: result || undefined,
        error: error || undefined,
      });
    } catch (e) {
      console.error("[NativeDAppBrowser] Error sending response:", e);
    }
  }
}

export const nativeDAppBrowser = new NativeDAppBrowserService();
