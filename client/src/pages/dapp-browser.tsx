import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ExternalLink, ChevronDown, Globe, RefreshCw, X, Link2, Check, Unlink, Copy } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { ChainIcon } from "@/components/chain-icon";
import { useLocation, Link } from "wouter";
import { DEFAULT_CHAINS } from "@shared/schema";
import { walletConnectService, type SessionProposal, type DAppSession } from "@/lib/walletconnect-service";
import { dappBridge } from "@/lib/dapp-bridge";
import { getWeb3ProviderScript, createProviderMessageHandler } from "@/lib/web3-provider-injection";
import { nativeHttpPost } from "@/lib/native-http";

const EVM_CHAINS = DEFAULT_CHAINS.filter(c => c.chainId > 0);

export default function DAppBrowser() {
  const { isConnected, isUnlocked, wallets, chains } = useWallet();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [selectedChainId, setSelectedChainId] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const initialUrl = urlParams.get("url");

  useEffect(() => {
    if (initialUrl) {
      const decodedUrl = decodeURIComponent(initialUrl);
      setUrl(decodedUrl);
      setCurrentUrl(decodedUrl);
    }
  }, [initialUrl]);

  const selectedChain = EVM_CHAINS.find(c => c.chainId === selectedChainId) || EVM_CHAINS[0];
  const currentWallet = wallets.find(w => {
    const chain = chains.find(c => c.id === w.chainId);
    return chain?.chainId === selectedChainId;
  }) || wallets[0];

  const handleDAppRequest = useCallback(async (request: { id: number; method: string; params: any[] }) => {
    dappBridge.setChainId(selectedChainId);
    dappBridge.setAccount(currentWallet?.address || null);
    
    return new Promise<{ result?: any; error?: { code: number; message: string } }>((resolve) => {
      dappBridge.setResponseHandler((response) => {
        resolve({ result: response.result, error: response.error });
      });
      dappBridge.handleRequest({
        type: 'eth',
        id: request.id,
        method: request.method,
        params: request.params
      });
    });
  }, [selectedChainId, currentWallet?.address]);

  useEffect(() => {
    const messageHandler = createProviderMessageHandler(handleDAppRequest);
    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [handleDAppRequest]);

  useEffect(() => {
    dappBridge.setChainId(selectedChainId);
    dappBridge.setAccount(currentWallet?.address || null);
  }, [selectedChainId, currentWallet?.address]);

  const injectWeb3Provider = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !currentWallet?.address) return;
    
    try {
      const script = getWeb3ProviderScript(currentWallet.address, selectedChainId);
      iframeRef.current.contentWindow.postMessage({
        type: 'INJECT_PROVIDER',
        script
      }, '*');
    } catch (e) {
      console.log('[DAppBrowser] Provider injection not available for cross-origin iframe');
    }
  }, [currentWallet?.address, selectedChainId]);

  const handleNavigate = () => {
    if (!url.trim()) return;
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = "https://" + formattedUrl;
    }
    setCurrentUrl(formattedUrl);
    setIframeError(false);
    setIsLoading(true);
  };

  const handleRefresh = () => {
    if (iframeRef.current && currentUrl) {
      setIsLoading(true);
      setIframeError(false);
      iframeRef.current.src = currentUrl;
    }
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
    injectWeb3Provider();
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setIframeError(true);
  };

  const handleChainSwitch = (chainId: number) => {
    setSelectedChainId(chainId);
    toast({
      title: "Chain Switched",
      description: `Switched to ${EVM_CHAINS.find(c => c.chainId === chainId)?.name}`,
    });
  };

  const openExternal = () => {
    if (currentUrl) {
      window.open(currentUrl, "_blank");
    }
  };

  if (!isConnected || !isUnlocked) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-3xl font-bold">DApp Browser</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <Globe className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Connect your wallet to use the DApp browser</p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-1.5 p-2">
          <BackButton fallbackPath="/dapps" />

          <div className="flex-1 flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNavigate()}
              placeholder="Enter URL..."
              className="flex-1 border-0 bg-transparent h-8 text-sm focus-visible:ring-0 px-1"
              data-testid="input-browser-url"
            />
            <Button size="sm" onClick={handleNavigate} className="h-7 px-3" data-testid="button-go">
              Go
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-chain-selector">
                <ChainIcon symbol={selectedChain.symbol} iconColor={selectedChain.iconColor} size="sm" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
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

        </div>
      </div>

      <div className="flex-1 relative bg-muted/30">
        {!currentUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md p-6">
              <Globe className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-semibold mb-2">DApp Browser</h2>
              <p className="text-muted-foreground mb-4">
                Browse decentralized applications. For best compatibility, connect to DApps using WalletConnect.
              </p>
              {currentWallet && (
                <p className="text-xs text-muted-foreground mb-4">
                  Connected: {currentWallet.address.slice(0, 8)}...{currentWallet.address.slice(-6)} ({selectedChain.name})
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "PancakeSwap", url: "pancakeswap.finance" },
                  { name: "Uniswap", url: "app.uniswap.org" },
                  { name: "Aave", url: "app.aave.com" },
                  { name: "1inch", url: "app.1inch.io" },
                ].map((dapp) => (
                  <Button
                    key={dapp.name}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUrl("https://" + dapp.url);
                      setCurrentUrl("https://" + dapp.url);
                      setIsLoading(true);
                    }}
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
                This DApp cannot be embedded due to security restrictions.
                Open it externally and use WalletConnect to connect your VaultKey wallet.
              </p>
              {currentWallet && (
                <div className="text-xs bg-muted p-2 rounded mb-4">
                  <span className="text-muted-foreground">Address to connect: </span>
                  <span className="font-mono">{currentWallet.address.slice(0, 10)}...{currentWallet.address.slice(-8)}</span>
                </div>
              )}
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={openExternal}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in New Tab
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/dapps">
                    Back to DApps
                  </Link>
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
    </div>
  );
}
