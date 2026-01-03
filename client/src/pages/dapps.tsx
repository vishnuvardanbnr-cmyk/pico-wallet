import { useState, useRef, useEffect, useCallback } from "react";
import { ExternalLink, Globe, Wallet, RefreshCw, X, ArrowLeft, AlertTriangle, Send, FileSignature } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-context";
import { ChainIcon } from "@/components/chain-icon";
import { DEFAULT_CHAINS } from "@shared/schema";
import { isNativeDAppBrowserAvailable, nativeDAppBrowser } from "@/lib/native-dapp-browser";
import { dappBridge } from "@/lib/dapp-bridge";
import { ethers } from "ethers";

interface PendingSignRequest {
  method: string;
  params: any[];
  resolve: (result: string | null) => void;
}

const EVM_CHAINS = DEFAULT_CHAINS.filter(c => c.chainId > 0);

interface DAppInfo {
  name: string;
  url: string;
  description: string;
  category: string;
}

const POPULAR_DAPPS: DAppInfo[] = [
  { name: "PancakeSwap", url: "https://pancakeswap.finance/", description: "Trade, earn crypto", category: "DEX" },
  { name: "Uniswap", url: "https://app.uniswap.org/", description: "Swap tokens", category: "DEX" },
  { name: "Aave", url: "https://app.aave.com/", description: "Lending protocol", category: "Lending" },
  { name: "1inch", url: "https://app.1inch.io/", description: "DEX aggregator", category: "DEX" },
];

export default function DApps() {
  const { isConnected, isUnlocked, wallets, chains, walletMode, isWalletGroupUnlocked, lockWalletGroup, unlockWalletGroup, setPinAction, setShowPinModal, setPendingWalletGroupId } = useWallet();
  const { toast } = useToast();
  
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(56); // BNB Chain default
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [connectedWalletGroupId, setConnectedWalletGroupId] = useState<string | undefined>(undefined);
  const [isNativeBrowserOpen, setIsNativeBrowserOpen] = useState(false);
  const [pendingSignRequest, setPendingSignRequest] = useState<PendingSignRequest | null>(null);
  const [isSigningInProgress, setIsSigningInProgress] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("dapp-search-history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMobile = isNativeDAppBrowserAvailable();
  const selectedChain = EVM_CHAINS.find(c => c.chainId === selectedChainId) || EVM_CHAINS[0];

  // Get wallets for current chain
  const chainWallets = wallets.filter(w => {
    const chain = chains.find(c => c.id === w.chainId);
    return chain && chain.chainId === selectedChainId;
  });

  // All EVM wallets
  const evmWallets = wallets.filter(w => {
    const chain = chains.find(c => c.id === w.chainId);
    return chain && chain.chainId > 0;
  });

  // Cleanup native browser on unmount
  useEffect(() => {
    return () => {
      if (isNativeBrowserOpen) {
        nativeDAppBrowser.close();
      }
    };
  }, [isNativeBrowserOpen]);

  // Update native browser when account changes
  useEffect(() => {
    if (isNativeBrowserOpen && connectedWallet) {
      nativeDAppBrowser.updateAccount(connectedWallet, selectedChainId);
    }
  }, [connectedWallet, selectedChainId, isNativeBrowserOpen]);

  // Handle sign request from DApp - native dialog shows confirmation, we handle signing
  const handleSignRequest = useCallback(async (method: string, params: any[], confirmed: boolean): Promise<string | null> => {
    console.log("[DApps] handleSignRequest:", method, "confirmed:", confirmed, "walletMode:", walletMode);
    
    // Only proceed if user confirmed in native dialog
    if (!confirmed) {
      return null; // User rejected in native dialog
    }
    
    // For soft wallet, ALWAYS require PIN for each transaction (one-shot security)
    // Lock the wallet first to ensure PIN is always required
    if (walletMode === "soft_wallet" && connectedWalletGroupId) {
      console.log("[DApps] Locking wallet for one-shot PIN verification");
      lockWalletGroup(connectedWalletGroupId);
      
      // Request PIN from native dialog
      console.log("[DApps] Requesting PIN from native dialog for:", connectedWalletGroupId);
      const pin = await nativeDAppBrowser.requestPin(connectedWalletGroupId);
      
      if (!pin) {
        console.log("[DApps] PIN entry cancelled");
        return null;
      }
      
      // Verify and unlock with PIN
      try {
        console.log("[DApps] Verifying PIN...");
        const success = await unlockWalletGroup(connectedWalletGroupId, pin);
        if (!success) {
          console.log("[DApps] PIN verification failed");
          toast({
            title: "Invalid PIN",
            description: "The PIN you entered is incorrect",
            variant: "destructive",
          });
          return null;
        }
        console.log("[DApps] PIN verified successfully");
      } catch (e: any) {
        console.error("[DApps] PIN verification error:", e);
        return null;
      }
    }
    
    // Now proceed with signing
    try {
      dappBridge.setAccount(connectedWallet || "");
      dappBridge.setChainId(selectedChainId);
      dappBridge.setWalletMode(walletMode === "hard_wallet" ? "hardware" : "soft_wallet");
      dappBridge.setWalletGroupId(connectedWalletGroupId);
      
      // Create a promise to capture the response
      let signedResult: string | null = null;
      
      dappBridge.setResponseHandler((response) => {
        if (response.result) {
          signedResult = response.result;
        }
      });
      
      // Execute the request through dappBridge
      await dappBridge.handleRequest({
        type: "web3_request",
        id: Date.now(),
        method,
        params
      });
      
      // Lock wallet after signing (one-shot pattern)
      if (walletMode === "soft_wallet" && connectedWalletGroupId) {
        lockWalletGroup(connectedWalletGroupId);
      }
      
      if (signedResult) {
        toast({
          title: "Signed Successfully",
          description: method.includes("send") ? "Transaction sent" : "Request signed",
          duration: 3000,
        });
      }
      
      return signedResult;
    } catch (error: any) {
      console.error("[DApps] Sign error:", error);
      toast({
        title: "Signing Failed",
        description: error?.message || "Failed to sign request",
        variant: "destructive",
      });
      
      // Lock after failure too
      if (walletMode === "soft_wallet" && connectedWalletGroupId) {
        lockWalletGroup(connectedWalletGroupId);
      }
      
      return null;
    }
  }, [connectedWallet, connectedWalletGroupId, selectedChainId, walletMode, toast, isWalletGroupUnlocked, lockWalletGroup, unlockWalletGroup]);

  // Format transaction details for display
  const formatTransactionDetails = useCallback((method: string, params: any[]) => {
    if (method === "eth_sendTransaction" || method === "eth_signTransaction") {
      const tx = params[0] || {};
      const value = tx.value ? ethers.formatEther(BigInt(tx.value)) : "0";
      return {
        type: "Transaction",
        to: tx.to || "Contract Creation",
        value: `${value} ${selectedChain.symbol}`,
        data: tx.data ? (tx.data.length > 66 ? tx.data.slice(0, 66) + "..." : tx.data) : "0x",
        hasData: tx.data && tx.data !== "0x",
      };
    } else if (method === "personal_sign" || method === "eth_sign") {
      const message = params[0] || "";
      let displayMessage = message;
      if (message.startsWith("0x")) {
        try {
          displayMessage = Buffer.from(message.slice(2), "hex").toString("utf8");
        } catch {
          displayMessage = message;
        }
      }
      return {
        type: "Message Signature",
        message: displayMessage.length > 200 ? displayMessage.slice(0, 200) + "..." : displayMessage,
      };
    } else if (method.includes("signTypedData")) {
      try {
        const typedData = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        return {
          type: "Typed Data Signature",
          domain: typedData.domain?.name || "Unknown DApp",
          primaryType: typedData.primaryType || "Unknown",
        };
      } catch {
        return { type: "Typed Data Signature" };
      }
    }
    return { type: method };
  }, [selectedChain]);

  // Approve sign request - requires PIN verification for wallet group
  const approveSignRequest = useCallback(async () => {
    if (!pendingSignRequest) return;
    
    // For soft wallet mode, verify wallet group is unlocked BEFORE setting signing in progress
    if (walletMode === "soft_wallet") {
      const groupUnlocked = isWalletGroupUnlocked(connectedWalletGroupId);
      if (!groupUnlocked) {
        // Request PIN to unlock the wallet group for signing
        // Keep the sign request pending - user will click Confirm again after PIN entry
        setPendingWalletGroupId(connectedWalletGroupId || null);
        setPinAction("access");
        setShowPinModal(true);
        
        toast({
          title: "PIN Required",
          description: "Please enter your PIN, then confirm the transaction again",
          duration: 4000,
        });
        // Return early WITHOUT clearing pending request - dialog stays open for retry
        return;
      }
    }
    
    // Now proceed with signing - wallet group is confirmed unlocked
    setIsSigningInProgress(true);
    try {
      dappBridge.setAccount(connectedWallet || "");
      dappBridge.setChainId(selectedChainId);
      dappBridge.setWalletMode(walletMode === "hard_wallet" ? "hardware" : "soft_wallet");
      dappBridge.setWalletGroupId(connectedWalletGroupId);
      
      // Create a promise to capture the response
      let signedResult: string | null = null;
      
      dappBridge.setResponseHandler((response) => {
        if (response.result) {
          signedResult = response.result;
        }
      });
      
      // Execute the request through dappBridge
      await dappBridge.handleRequest({
        type: "web3_request",
        id: Date.now(),
        method: pendingSignRequest.method,
        params: pendingSignRequest.params,
      });
      
      pendingSignRequest.resolve(signedResult);
      
      toast({
        title: "Signed Successfully",
        description: pendingSignRequest.method.includes("send") ? "Transaction sent" : "Request signed",
        duration: 3000,
      });
      
      // Cleanup after successful signing
      setIsSigningInProgress(false);
      setPendingSignRequest(null);
      
      // One-shot verification: lock the wallet group after signing
      // This ensures PIN is required for each transaction
      if (walletMode === "soft_wallet" && connectedWalletGroupId) {
        lockWalletGroup(connectedWalletGroupId);
      }
    } catch (error: any) {
      console.error("[DApps] Sign error:", error);
      toast({
        title: "Signing Failed",
        description: error?.message || "Failed to sign request",
        variant: "destructive",
      });
      pendingSignRequest.resolve(null);
      
      // Cleanup after failed signing
      setIsSigningInProgress(false);
      setPendingSignRequest(null);
      
      // Also lock after failure to ensure one-shot pattern
      if (walletMode === "soft_wallet" && connectedWalletGroupId) {
        lockWalletGroup(connectedWalletGroupId);
      }
    }
  }, [pendingSignRequest, connectedWallet, connectedWalletGroupId, selectedChainId, walletMode, toast, isWalletGroupUnlocked, setPinAction, setShowPinModal, setPendingWalletGroupId, lockWalletGroup]);

  // Reject sign request
  const rejectSignRequest = useCallback(() => {
    if (pendingSignRequest) {
      pendingSignRequest.resolve(null);
      setPendingSignRequest(null);
      toast({
        title: "Request Rejected",
        description: "You declined the signing request",
        duration: 2000,
      });
    }
  }, [pendingSignRequest, toast]);

  const openNativeBrowser = async (targetUrl: string) => {
    // Use any EVM wallet address since they're chain-agnostic
    const address = connectedWallet || chainWallets[0]?.address || evmWallets[0]?.address || "";
    
    console.log("[DApps] openNativeBrowser called", { 
      targetUrl, 
      address, 
      hasConnectedWallet: !!connectedWallet,
      chainWalletsCount: chainWallets.length,
      evmWalletsCount: evmWallets.length,
      isMobile 
    });
    
    if (!address) {
      toast({
        title: "No Wallet Found",
        description: "Please create a wallet first to use DApps",
        variant: "destructive",
      });
      return;
    }
    
    console.log("[DApps] Opening native browser:", targetUrl, "with address:", address, "chainId:", selectedChainId);

    setIsLoading(true);
    
    nativeDAppBrowser.setOnLoadingChange((loading) => {
      setIsLoading(loading);
    });
    
    nativeDAppBrowser.setOnUrlChange((newUrl) => {
      setUrl(newUrl);
      setCurrentUrl(newUrl);
    });

    nativeDAppBrowser.setOnChainChange((newChainId) => {
      setSelectedChainId(newChainId);
      toast({
        title: "Network Changed",
        description: `DApp requested switch to ${EVM_CHAINS.find(c => c.chainId === newChainId)?.name || 'Unknown Network'}`,
        duration: 2000,
      });
    });

    nativeDAppBrowser.setOnDisconnect(() => {
      setConnectedWallet(null);
    });

    // Set up sign request handler to show confirmation dialog
    nativeDAppBrowser.setOnSignRequest(handleSignRequest);

    try {
      toast({
        title: "Opening DApp...",
        description: "Launching browser",
        duration: 2000,
      });
      
      const success = await nativeDAppBrowser.open(targetUrl, address, selectedChainId);
      console.log("[DApps] Native browser open result:", success);
      
      if (success) {
        setIsNativeBrowserOpen(true);
        setConnectedWallet(address);
        setCurrentUrl(targetUrl);
      } else {
        setIsLoading(false);
        toast({
          title: "Browser Error",
          description: "Failed to open DApp browser. Try updating the app.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[DApps] Error opening native browser:", error);
      setIsLoading(false);
      toast({
        title: "Browser Error",
        description: error?.message || "Failed to open DApp browser",
        variant: "destructive",
      });
    }
  };

  const closeNativeBrowser = async () => {
    await nativeDAppBrowser.close();
    setIsNativeBrowserOpen(false);
    setCurrentUrl("");
    setUrl("");
  };

  // Save URL to search history
  const saveToHistory = useCallback((urlToSave: string) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(u => u !== urlToSave);
      const updated = [urlToSave, ...filtered].slice(0, 10); // Keep last 10
      try {
        localStorage.setItem("dapp-search-history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Remove URL from history
  const removeFromHistory = useCallback((urlToRemove: string) => {
    setSearchHistory(prev => {
      const updated = prev.filter(u => u !== urlToRemove);
      try {
        localStorage.setItem("dapp-search-history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleNavigate = async () => {
    if (!url.trim()) return;
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = "https://" + formattedUrl;
    }
    
    saveToHistory(formattedUrl);
    setShowHistory(false);
    
    if (isMobile) {
      await openNativeBrowser(formattedUrl);
    } else {
      setCurrentUrl(formattedUrl);
      setUrl(formattedUrl);
      setIframeError(false);
      setIsLoading(true);
    }
  };

  const handleOpenDapp = async (dappUrl: string) => {
    saveToHistory(dappUrl);
    setShowHistory(false);
    
    if (isMobile) {
      setUrl(dappUrl);
      await openNativeBrowser(dappUrl);
    } else {
      setUrl(dappUrl);
      setCurrentUrl(dappUrl);
      setIframeError(false);
      setIsLoading(true);
    }
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setIframeError(true);
  };

  const handleChainSwitch = (chainId: number) => {
    setSelectedChainId(chainId);
    setConnectedWallet(null);
    toast({
      title: "Chain Switched",
      description: `Switched to ${EVM_CHAINS.find(c => c.chainId === chainId)?.name}`,
      duration: 2000,
    });
  };

  const handleConnectWallet = () => {
    setShowWalletSelector(true);
  };

  const handleWalletSelect = (walletAddress: string, chainName: string, walletGroupId?: string) => {
    setConnectedWallet(walletAddress);
    setConnectedWalletGroupId(walletGroupId);
    
    toast({
      title: "Wallet Connected",
      description: `${chainName} wallet connected`,
      duration: 2000,
    });
    
    setShowWalletSelector(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with URL Bar and Controls */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* URL Search Bar Row */}
        <div className="flex items-center gap-2 p-3">
          {(currentUrl || isNativeBrowserOpen) && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                if (isNativeBrowserOpen) {
                  closeNativeBrowser();
                } else if (currentUrl) {
                  setCurrentUrl("");
                  setUrl("");
                }
              }}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="flex-1 relative">
            <div className="flex items-center bg-muted/60 border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50">
              <Globe className="h-4 w-4 text-muted-foreground ml-3 shrink-0" />
              <Input
                ref={inputRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNavigate()}
                onFocus={() => {
                  setIsInputFocused(true);
                  setShowHistory(true);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setIsInputFocused(false);
                    setShowHistory(false);
                  }, 200);
                }}
                placeholder="Enter DApp URL..."
                className="flex-1 border-0 bg-transparent h-10 text-sm focus-visible:ring-0 px-2"
                data-testid="input-browser-url"
              />
              <Button 
                onClick={handleNavigate} 
                className="h-10 px-5 rounded-none rounded-r-lg"
                data-testid="button-go"
              >
                Go
              </Button>
            </div>

            {/* Search History Dropdown */}
            {showHistory && searchHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                <div className="p-2 text-xs font-medium text-muted-foreground border-b">Recent</div>
                {searchHistory.map((historyUrl, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer group"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setUrl(historyUrl);
                      handleOpenDapp(historyUrl);
                    }}
                    data-testid={`history-item-${index}`}
                  >
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm truncate">{historyUrl}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeFromHistory(historyUrl);
                      }}
                      data-testid={`remove-history-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Wallet and Chain Selectors Row */}
        <div className="flex items-center gap-2 px-3 pb-3">
          {/* Chain Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-chain-selector">
                <ChainIcon symbol={selectedChain.symbol} iconColor={selectedChain.iconColor} size="sm" />
                <span className="text-xs">{selectedChain.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {EVM_CHAINS.map((chain) => (
                <DropdownMenuItem
                  key={chain.chainId}
                  onClick={() => handleChainSwitch(chain.chainId)}
                  className="gap-2"
                  data-testid={`menu-chain-${chain.symbol.toLowerCase()}`}
                >
                  <ChainIcon symbol={chain.symbol} iconColor={chain.iconColor} size="sm" />
                  {chain.name}
                  {chain.chainId === selectedChainId && (
                    <span className="ml-auto text-primary">•</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Wallet Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant={connectedWallet ? "outline" : "secondary"}
                size="sm"
                className="gap-2"
                data-testid="button-wallet-selector"
              >
                <Wallet className="h-4 w-4" />
                {connectedWallet ? (
                  <span className="font-mono text-xs">
                    {connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)}
                  </span>
                ) : (
                  <span className="text-xs">Select Wallet</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {chainWallets.length > 0 ? (
                chainWallets.map((wallet) => {
                  const chain = chains.find(c => c.id === wallet.chainId);
                  if (!chain) return null;
                  const isSelected = wallet.address === connectedWallet;
                  
                  return (
                    <DropdownMenuItem
                      key={wallet.id}
                      onClick={() => handleWalletSelect(wallet.address, wallet.label || `${chain.name} Wallet`, wallet.walletGroupId)}
                      className="gap-2 cursor-pointer"
                      data-testid={`menu-wallet-${wallet.address.slice(0, 8)}`}
                    >
                      <ChainIcon symbol={chain.symbol} iconColor={chain.iconColor} size="sm" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{wallet.label || `${chain.name} Wallet`}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {wallet.address.slice(0, 10)}...{wallet.address.slice(-6)}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </DropdownMenuItem>
                  );
                })
              ) : (
                <div className="p-3 text-center text-sm text-muted-foreground">
                  No wallets for {selectedChain.name}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Browser content */}
      <div className="flex-1 relative bg-muted/30">
        {isNativeBrowserOpen ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md p-6">
              <Globe className="mx-auto h-16 w-16 text-primary/50 mb-4 animate-pulse" />
              <h2 className="text-xl font-semibold mb-2">Native Browser Active</h2>
              <p className="text-muted-foreground mb-4">
                Web3 provider injected. Click any wallet option (MetaMask, Trust Wallet, etc.) to connect with VaultKey.
              </p>
              <div className="p-3 bg-muted rounded-lg mb-4">
                <p className="text-sm font-mono break-all">{currentUrl}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Connected: {connectedWallet?.slice(0, 8)}...{connectedWallet?.slice(-6)}
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={closeNativeBrowser}
                data-testid="button-close-native-browser"
              >
                <X className="mr-2 h-4 w-4" />
                Close Browser
              </Button>
            </div>
          </div>
        ) : !currentUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md p-6">
              <Globe className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-semibold mb-2">DApp Browser</h2>
              <p className="text-muted-foreground mb-6">
                {isMobile 
                  ? "Open a DApp and all wallet connections will use VaultKey" 
                  : "Enter a URL or select a popular DApp below"}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {POPULAR_DAPPS.map((dapp) => (
                  <Button
                    key={dapp.name}
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDapp(dapp.url)}
                    className="justify-start"
                    data-testid={`quick-${dapp.name.toLowerCase()}`}
                  >
                    {dapp.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : iframeError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md p-6">
              <X className="mx-auto h-16 w-16 text-destructive/50 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Cannot Load DApp</h2>
              <p className="text-muted-foreground mb-4">
                This DApp cannot be embedded. Try opening in external browser.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => window.open(currentUrl, "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open External
                </Button>
                <Button variant="outline" onClick={() => { setCurrentUrl(""); setUrl(""); }}>
                  Back
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={currentUrl}
              className="w-full h-full border-0"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              data-testid="iframe-dapp"
            />
          </>
        )}
      </div>

      {/* Wallet Selection Dialog */}
      <Dialog open={showWalletSelector} onOpenChange={setShowWalletSelector}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Select Wallet
            </DialogTitle>
            <DialogDescription>
              Choose a wallet to connect
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-64 overflow-auto">
            {chainWallets.length > 0 ? (
              chainWallets.map((wallet, index) => {
                const chain = chains.find(c => c.id === wallet.chainId);
                if (!chain) return null;
                
                const walletName = wallet.label || `${chain.name} Wallet${chainWallets.length > 1 ? ` ${index + 1}` : ''}`;
                
                return (
                  <Button
                    key={wallet.id}
                    variant={wallet.address === connectedWallet ? "default" : "outline"}
                    className="w-full justify-start gap-3 h-auto py-3"
                    onClick={() => handleWalletSelect(wallet.address, walletName, wallet.walletGroupId)}
                    data-testid={`select-wallet-${chain.symbol.toLowerCase()}`}
                  >
                    <ChainIcon symbol={chain.symbol} iconColor={chain.iconColor} size="sm" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">{walletName}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                      </div>
                    </div>
                    {wallet.address === connectedWallet && (
                      <span className="text-xs">Connected</span>
                    )}
                  </Button>
                );
              })
            ) : (
              <p className="text-center text-muted-foreground py-4">
                No wallets for {selectedChain.name}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowWalletSelector(false)} className="w-full">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign Request Confirmation Dialog */}
      <Dialog open={!!pendingSignRequest} onOpenChange={(open) => !open && rejectSignRequest()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingSignRequest?.method.includes("send") ? (
                <>
                  <Send className="h-5 w-5 text-primary" />
                  Confirm Transaction
                </>
              ) : (
                <>
                  <FileSignature className="h-5 w-5 text-primary" />
                  Sign Request
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {currentUrl ? new URL(currentUrl).hostname : "DApp"} is requesting your signature
            </DialogDescription>
          </DialogHeader>

          {pendingSignRequest && (() => {
            const details = formatTransactionDetails(pendingSignRequest.method, pendingSignRequest.params);
            return (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <span className="text-sm font-medium">{details.type}</span>
                  </div>
                  
                  {"to" in details && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">To</span>
                      <span className="text-sm font-mono">
                        {details.to.length > 20 ? `${details.to.slice(0, 10)}...${details.to.slice(-8)}` : details.to}
                      </span>
                    </div>
                  )}
                  
                  {"value" in details && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Value</span>
                      <span className="text-sm font-medium">{details.value}</span>
                    </div>
                  )}

                  {"hasData" in details && details.hasData && (
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs">Contains contract interaction data</span>
                    </div>
                  )}

                  {"message" in details && (
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">Message</span>
                      <p className="text-xs bg-background p-2 rounded font-mono break-all">
                        {details.message}
                      </p>
                    </div>
                  )}

                  {"domain" in details && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Domain</span>
                        <span className="text-sm">{details.domain}</span>
                      </div>
                      {"primaryType" in details && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Action</span>
                          <span className="text-sm">{details.primaryType}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Only sign if you trust this DApp. Malicious sites can steal your funds.
                  </p>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button 
              onClick={approveSignRequest} 
              className="w-full"
              disabled={isSigningInProgress}
              data-testid="button-approve-sign"
            >
              {isSigningInProgress ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                pendingSignRequest?.method.includes("send") ? "Confirm Transaction" : "Sign"
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={rejectSignRequest} 
              className="w-full"
              disabled={isSigningInProgress}
              data-testid="button-reject-sign"
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
