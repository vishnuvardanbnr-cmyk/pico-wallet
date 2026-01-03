import { useState, useMemo, useEffect } from "react";
import { useWallet } from "@/lib/wallet-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RefreshCw, CheckSquare, Square, Plus, Trash2, Loader2, AlertCircle, Radio, ArrowLeft } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { getTokenInfo } from "@/lib/blockchain";
import { Link, useSearch, useLocation } from "wouter";
import { TOKEN_PARENT_CHAIN_SYMBOL, TOKEN_PARENT_CHAIN } from "@/lib/chain-mappings";
import { FALLBACK_TOP_ASSETS } from "@shared/schema";

// Direct symbol-to-logo mapping (using Trust Wallet CDN which is more reliable)
const CUSTOM_TOKEN_LOGOS: Record<string, string> = {
  'CAKE': 'https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/logo.png',
  'TWT': 'https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0x4B0F1812e5Df2A09796481Ff14017e6005508003/logo.png',
  'BABY': 'https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0xc748673057861a797275CD8A068AbB95A902e8de/logo.png',
  'XVS': 'https://assets-cdn.trustwallet.com/blockchains/smartchain/assets/0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63/logo.png',
};

// Get token image with fallback to FALLBACK_TOP_ASSETS
function getTokenImage(tokenId: string, tokenSymbol: string, tokenImage?: string): string | undefined {
  // Check direct image first
  if (tokenImage && tokenImage.trim()) {
    return tokenImage;
  }
  
  // Check CUSTOM_TOKEN_LOGOS by symbol
  const symbolUpper = tokenSymbol.toUpperCase().trim();
  if (CUSTOM_TOKEN_LOGOS[symbolUpper]) {
    return CUSTOM_TOKEN_LOGOS[symbolUpper];
  }
  
  // Check FALLBACK_TOP_ASSETS by token ID
  const matchingAsset = FALLBACK_TOP_ASSETS.find(a => a.id === tokenId);
  if (matchingAsset?.image && matchingAsset.image.trim()) {
    return matchingAsset.image;
  }
  
  // Check FALLBACK_TOP_ASSETS by symbol
  const matchingBySymbol = FALLBACK_TOP_ASSETS.find(a => a.symbol.toUpperCase() === symbolUpper);
  if (matchingBySymbol?.image && matchingBySymbol.image.trim()) {
    return matchingBySymbol.image;
  }
  
  return undefined;
}

// Fetch token logo from CoinGecko API
async function fetchTokenLogoFromCoinGecko(symbol: string, name: string): Promise<string | undefined> {
  try {
    const symbolUpper = symbol.toUpperCase().trim();
    
    // Try direct symbol mapping first
    if (CUSTOM_TOKEN_LOGOS[symbolUpper]) {
      return CUSTOM_TOKEN_LOGOS[symbolUpper];
    }

    // Search CoinGecko by symbol
    const searchResponse = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!searchResponse.ok) return undefined;
    const searchData = await searchResponse.json();
    
    if (!searchData.coins || searchData.coins.length === 0) return undefined;

    // Find the best match - first by exact symbol match, then by name
    let bestMatch = searchData.coins[0];
    for (const coin of searchData.coins) {
      if (coin.symbol?.toUpperCase() === symbolUpper) {
        bestMatch = coin;
        break;
      }
      if (coin.name?.toLowerCase() === name.toLowerCase()) {
        bestMatch = coin;
        break;
      }
    }

    if (bestMatch?.large) {
      console.log(`[COINGECKO] Found logo for ${symbol}:`, bestMatch.large);
      return bestMatch.large;
    }
  } catch (error) {
    console.log(`[COINGECKO] Failed to fetch logo for ${symbol}:`, error);
  }
  
  return undefined;
}

const SUPPORTED_CHAINS = [
  { id: 'ETH', name: 'Ethereum (ERC-20)', evmChainId: 1, rpcUrl: 'https://eth.llamarpc.com', type: 'evm' as const },
  { id: 'BNB', name: 'BNB Chain (BEP-20)', evmChainId: 56, rpcUrl: 'https://bsc-dataseed.binance.org', type: 'evm' as const },
  { id: 'MATIC', name: 'Polygon', evmChainId: 137, rpcUrl: 'https://polygon-rpc.com', type: 'evm' as const },
  { id: 'ARB', name: 'Arbitrum', evmChainId: 42161, rpcUrl: 'https://arb1.arbitrum.io/rpc', type: 'evm' as const },
  { id: 'TRX', name: 'TRON (TRC-20)', evmChainId: 0, rpcUrl: '', type: 'tron' as const },
];

export default function ManageCrypto() {
  const { 
    topAssets, 
    enabledAssetIds, 
    isLoadingAssets, 
    toggleAssetEnabled, 
    refreshTopAssets,
    enableAllAssets,
    disableAllAssets,
    customTokens,
    addCustomToken,
    removeCustomToken,
    walletMode,
    wallets,
  } = useWallet();

  // Get chain and wallet from URL params
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const chainFromUrl = urlParams.get('chain');
  const walletFromUrl = urlParams.get('wallet');
  const isChainSpecific = !!chainFromUrl;

  // Get available chains based on URL param
  const availableChains = isChainSpecific 
    ? SUPPORTED_CHAINS.filter(c => c.id === chainFromUrl)
    : SUPPORTED_CHAINS;
  
  const chainData = SUPPORTED_CHAINS.find(c => c.id === chainFromUrl);
  const tokenTypeLabel = chainFromUrl === 'ETH' ? 'ERC-20' :
                         chainFromUrl === 'BNB' ? 'BEP-20' :
                         chainFromUrl === 'TRX' ? 'TRC-20' :
                         chainData?.name || 'custom';

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedChain, setSelectedChain] = useState(chainFromUrl || "");
  const [contractAddress, setContractAddress] = useState("");
  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number } | null>(null);
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualDecimals, setManualDecimals] = useState("18");

  // Update selected chain when URL param changes
  useEffect(() => {
    if (chainFromUrl && SUPPORTED_CHAINS.some(c => c.id === chainFromUrl)) {
      setSelectedChain(chainFromUrl);
    }
  }, [chainFromUrl]);

  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return topAssets;
    const query = searchQuery.toLowerCase();
    return topAssets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(query) ||
        asset.symbol.toLowerCase().includes(query)
    );
  }, [topAssets, searchQuery]);

  const enabledCount = enabledAssetIds.size;
  const totalCount = topAssets.length;

  const selectedChainData = SUPPORTED_CHAINS.find(c => c.id === selectedChain);
  const isTronChain = selectedChainData?.type === 'tron';

  const handleChainChange = (chainId: string) => {
    setSelectedChain(chainId);
    setTokenInfo(null);
    setFetchError("");
    setManualName("");
    setManualSymbol("");
    setManualDecimals("18");
  };

  const handleContractAddressChange = (address: string) => {
    setContractAddress(address);
    setTokenInfo(null);
    setFetchError("");
  };

  const fetchTokenInfo = async () => {
    if (!selectedChain || !contractAddress) return;
    
    const chain = SUPPORTED_CHAINS.find(c => c.id === selectedChain);
    if (!chain) return;

    if (chain.type === 'tron') {
      setFetchError("TRON tokens require manual entry. Please fill in the token details below.");
      return;
    }

    setIsFetchingInfo(true);
    setFetchError("");

    try {
      const info = await getTokenInfo(contractAddress, chain.rpcUrl, chain.evmChainId);
      if (info) {
        setTokenInfo(info);
      } else {
        setFetchError("Could not fetch token info. Please verify the contract address.");
      }
    } catch (error) {
      setFetchError("Failed to fetch token info. Please check the address.");
    } finally {
      setIsFetchingInfo(false);
    }
  };

  const canAddToken = () => {
    if (!selectedChain || !contractAddress) return false;
    if (isTronChain) {
      return manualName.trim() && manualSymbol.trim() && manualDecimals;
    }
    return !!tokenInfo;
  };

  const handleAddToken = async () => {
    if (!selectedChain || !contractAddress) return;

    const chain = SUPPORTED_CHAINS.find(c => c.id === selectedChain);
    if (!chain) return;

    const tokenData = isTronChain
      ? { name: manualName.trim(), symbol: manualSymbol.trim().toUpperCase(), decimals: parseInt(manualDecimals) || 18 }
      : tokenInfo;

    if (!tokenData) return;

    // Find the wallet to add the token to
    // If walletFromUrl is specified, use that; otherwise find a wallet on the selected chain
    let targetWalletId = walletFromUrl;
    if (!targetWalletId) {
      // Find any wallet on this chain
      const chainWallet = wallets.find(w => {
        const walletChain = w.chainId;
        // Match by chain symbol (e.g., ETH, BNB, etc.)
        return walletChain && walletChain.includes(chain.id.toLowerCase());
      });
      if (chainWallet) {
        targetWalletId = chainWallet.id;
      } else if (wallets.length > 0) {
        // Fallback to first wallet
        targetWalletId = wallets[0].id;
      }
    }

    if (!targetWalletId) {
      setFetchError("No wallet available to add token to");
      return;
    }

    setIsAdding(true);
    try {
      // Fetch token logo from CoinGecko (with caching via direct mapping)
      console.log(`[TOKEN_ADD] Fetching logo for ${tokenData.symbol}...`);
      let tokenImage = await fetchTokenLogoFromCoinGecko(tokenData.symbol, tokenData.name);
      
      // Fallback to FALLBACK_TOP_ASSETS if CoinGecko fetch failed
      if (!tokenImage || !tokenImage.trim()) {
        const symbolUpper = tokenData.symbol.toUpperCase().trim();
        const matchingAsset = FALLBACK_TOP_ASSETS.find(
          a => a.symbol.toUpperCase().trim() === symbolUpper
        );
        tokenImage = matchingAsset?.image || '';
      }
      
      // Ensure tokenImage is never undefined (use empty string as fallback)
      if (!tokenImage) {
        tokenImage = '';
      }
      
      console.log(`[TOKEN_ADD] Logo for ${tokenData.symbol}:`, tokenImage);

      await addCustomToken({
        chainId: chain.id,
        chainType: chain.type,
        contractAddress: contractAddress.trim(),
        name: tokenData.name,
        symbol: tokenData.symbol,
        decimals: tokenData.decimals,
        evmChainId: chain.evmChainId,
        rpcUrl: chain.rpcUrl,
        image: tokenImage,
        walletId: targetWalletId,
      });

      resetDialog();
      setIsAddDialogOpen(false);
    } catch (error) {
      setFetchError("Failed to add token");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveToken = async (id: string) => {
    await removeCustomToken(id);
  };

  const resetDialog = () => {
    setSelectedChain("");
    setContractAddress("");
    setTokenInfo(null);
    setFetchError("");
    setManualName("");
    setManualSymbol("");
    setManualDecimals("18");
  };

  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (isChainSpecific && chainFromUrl && walletFromUrl) {
      // When viewing chain-specific page, navigate directly to wallet page
      setLocation(`/?chain=${chainFromUrl}&wallet=${walletFromUrl}`);
    } else {
      // Otherwise use browser back
      window.history.back();
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              {isChainSpecific ? `Add ${tokenTypeLabel} Token` : 'Manage Crypto'}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {isChainSpecific 
              ? `Add a custom ${tokenTypeLabel} token to track in your ${chainData?.name || chainFromUrl} wallet.`
              : 'Choose which cryptocurrencies to display on your dashboard. Enable or disable assets to customize your view.'}
          </p>
        </div>

        {walletMode !== "hard_wallet" && isChainSpecific && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Popular Tokens</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {topAssets
                    .filter(asset => {
                      const parentChainSymbol = TOKEN_PARENT_CHAIN_SYMBOL[asset.id];
                      return parentChainSymbol === chainFromUrl && TOKEN_PARENT_CHAIN[asset.id];
                    })
                    .filter(a => enabledAssetIds.has(a.id)).length} enabled
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Enable major tokens to display them in your wallet</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topAssets
                .filter(asset => {
                  const parentChainSymbol = TOKEN_PARENT_CHAIN_SYMBOL[asset.id];
                  return parentChainSymbol === chainFromUrl && TOKEN_PARENT_CHAIN[asset.id];
                })
                .slice(0, 10)
                .map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between p-3 rounded-md border"
                    data-testid={`major-token-row-${token.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {(() => {
                        const imageUrl = getTokenImage(token.id, token.symbol, token.image);
                        if (imageUrl) {
                          return (
                            <img
                              src={imageUrl}
                              alt={token.name}
                              className="h-8 w-8 rounded-full shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          );
                        }
                        return (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0">
                            {token.symbol.slice(0, 2).toUpperCase()}
                          </div>
                        );
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{token.name}</p>
                        <p className="text-xs text-muted-foreground">{token.symbol}</p>
                      </div>
                    </div>
                    <Switch
                      checked={enabledAssetIds.has(token.id)}
                      onCheckedChange={() => toggleAssetEnabled(token.id, !enabledAssetIds.has(token.id))}
                      data-testid={`switch-enable-token-${token.id}`}
                    />
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
        )}

        {walletMode !== "hard_wallet" && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Custom Tokens</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {isChainSpecific && walletFromUrl 
                    ? customTokens.filter(t => t.chainId === chainFromUrl && t.walletId === walletFromUrl).length 
                    : customTokens.length} added
                </Badge>
              </div>
              <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                setIsAddDialogOpen(open);
                if (!open) resetDialog();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-custom-token">
                    <Plus className="mr-1 h-4 w-4" />
                    Add Custom Token
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Custom Token</DialogTitle>
                    <DialogDescription>
                      {isChainSpecific 
                        ? `Add a ${tokenTypeLabel} token by entering its contract address.`
                        : 'Add an ERC-20, BEP-20, or TRC-20 token by entering its contract address.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="chain">Blockchain Network</Label>
                      <Select value={selectedChain} onValueChange={handleChainChange} disabled={isChainSpecific}>
                        <SelectTrigger id="chain" data-testid="select-chain">
                          <SelectValue placeholder="Select a network" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableChains.map((chain) => (
                            <SelectItem key={chain.id} value={chain.id}>
                              {chain.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contract">Contract Address</Label>
                      <div className="flex gap-2">
                        <Input
                          id="contract"
                          placeholder={isTronChain ? "T..." : "0x..."}
                          value={contractAddress}
                          onChange={(e) => handleContractAddressChange(e.target.value)}
                          data-testid="input-contract-address"
                        />
                        {!isTronChain && (
                          <Button
                            variant="outline"
                            onClick={fetchTokenInfo}
                            disabled={!selectedChain || !contractAddress || isFetchingInfo}
                            data-testid="button-fetch-info"
                          >
                            {isFetchingInfo ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Fetch"
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    {fetchError && (
                      <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-4 w-4" />
                        {fetchError}
                      </div>
                    )}
                    {isTronChain && selectedChain && (
                      <div className="space-y-3 rounded-md border p-3 bg-muted/50">
                        <p className="text-sm text-muted-foreground">Enter token details manually for TRC-20 tokens:</p>
                        <div className="space-y-2">
                          <Label htmlFor="manualName">Token Name</Label>
                          <Input
                            id="manualName"
                            placeholder="e.g., Tether USD"
                            value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                            data-testid="input-manual-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="manualSymbol">Token Symbol</Label>
                          <Input
                            id="manualSymbol"
                            placeholder="e.g., USDT"
                            value={manualSymbol}
                            onChange={(e) => setManualSymbol(e.target.value)}
                            data-testid="input-manual-symbol"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="manualDecimals">Decimals</Label>
                          <Input
                            id="manualDecimals"
                            type="number"
                            min="0"
                            max="18"
                            placeholder="18"
                            value={manualDecimals}
                            onChange={(e) => setManualDecimals(e.target.value)}
                            data-testid="input-manual-decimals"
                          />
                        </div>
                      </div>
                    )}
                    {tokenInfo && !isTronChain && (
                      <div className="rounded-md border p-3 space-y-2 bg-muted/50">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Name:</span>
                          <span className="font-medium">{tokenInfo.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Symbol:</span>
                          <span className="font-medium">{tokenInfo.symbol}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Decimals:</span>
                          <span className="font-medium">{tokenInfo.decimals}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        resetDialog();
                        setIsAddDialogOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddToken}
                      disabled={!canAddToken() || isAdding}
                      data-testid="button-confirm-add-token"
                    >
                      {isAdding ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Add Token
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              // Filter tokens to show only those for the current wallet
              const tokensToShow = isChainSpecific && walletFromUrl
                ? customTokens.filter(t => t.chainId === chainFromUrl && t.walletId === walletFromUrl)
                : customTokens;
              
              // Find tokens from other wallets on the same chain that could be added
              const availableTokensFromOtherWallets = isChainSpecific && walletFromUrl
                ? customTokens.filter(t => 
                    t.chainId === chainFromUrl && 
                    t.walletId !== walletFromUrl &&
                    // Check if this token isn't already added to current wallet
                    !customTokens.some(existing => 
                      existing.walletId === walletFromUrl && 
                      existing.contractAddress.toLowerCase() === t.contractAddress.toLowerCase()
                    )
                  )
                  // Remove duplicates (same token might be in multiple other wallets)
                  .filter((token, index, self) => 
                    index === self.findIndex(t => t.contractAddress.toLowerCase() === token.contractAddress.toLowerCase())
                  )
                : [];

              const handleAddTokenToWallet = async (token: typeof customTokens[0]) => {
                if (!walletFromUrl) return;
                await addCustomToken({
                  chainId: token.chainId,
                  chainType: token.chainType,
                  contractAddress: token.contractAddress,
                  name: token.name,
                  symbol: token.symbol,
                  decimals: token.decimals,
                  evmChainId: token.evmChainId,
                  rpcUrl: token.rpcUrl,
                  walletId: walletFromUrl,
                });
              };
              
              if (tokensToShow.length === 0 && availableTokensFromOtherWallets.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <p>No custom tokens added yet.</p>
                    <p className="text-sm">
                      {isChainSpecific 
                        ? `Click "Add Custom Token" to track any ${tokenTypeLabel} token.`
                        : 'Click "Add Custom Token" to track any ERC-20, BEP-20, or TRC-20 token.'}
                    </p>
                  </div>
                );
              }
              
              return (
              <div className="space-y-4">
                {tokensToShow.length > 0 && (
                  <div className="space-y-2">
                    {tokensToShow.map((token) => {
                      const chain = SUPPORTED_CHAINS.find(c => c.id === token.chainId);
                      const sym = token.symbol.toUpperCase().trim();
                      const icon = token.image || CUSTOM_TOKEN_LOGOS[sym] || FALLBACK_TOP_ASSETS.find(a => a.symbol.toUpperCase().trim() === sym)?.image;
                      return (
                        <div
                          key={token.id}
                          className="flex items-center justify-between rounded-md border p-3"
                          data-testid={`custom-token-row-${token.id}`}
                        >
                          <div className="flex items-center gap-3">
                            {icon ? (
                              <img
                                src={icon}
                                alt={token.name}
                                className="h-8 w-8 rounded-full bg-muted"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : null}
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold ${icon ? 'hidden' : ''}`}>
                              {token.symbol.slice(0, 2)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">{token.name}</span>
                              <span className="text-sm text-muted-foreground">
                                {token.symbol} on {chain?.name || token.chainId}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveToken(token.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/20"
                            data-testid={`button-remove-token-${token.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {availableTokensFromOtherWallets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground font-medium">Available from other wallets:</p>
                    {availableTokensFromOtherWallets.map((token) => {
                      const chain = SUPPORTED_CHAINS.find(c => c.id === token.chainId);
                      const sym = token.symbol.toUpperCase().trim();
                      const icon = token.image || CUSTOM_TOKEN_LOGOS[sym] || FALLBACK_TOP_ASSETS.find(a => a.symbol.toUpperCase().trim() === sym)?.image;
                      return (
                        <div
                          key={`available-${token.id}`}
                          className="flex items-center justify-between rounded-md border border-dashed p-3"
                          data-testid={`available-token-row-${token.contractAddress}`}
                        >
                          <div className="flex items-center gap-3">
                            {icon ? (
                              <img
                                src={icon}
                                alt={token.name}
                                className="h-8 w-8 rounded-full bg-muted"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : null}
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold ${icon ? 'hidden' : ''}`}>
                              {token.symbol.slice(0, 2)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">{token.name}</span>
                              <span className="text-sm text-muted-foreground">
                                {token.symbol} on {chain?.name || token.chainId}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAddTokenToWallet(token)}
                            className="text-primary"
                            data-testid={`button-add-available-token-${token.contractAddress}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })()}
          </CardContent>
        </Card>
        )}

        {!isChainSpecific && walletMode === "hard_wallet" && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Top Cryptocurrencies</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {enabledCount}/{totalCount} enabled
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={enableAllAssets}
                  data-testid="button-enable-all"
                >
                  <CheckSquare className="mr-1 h-4 w-4" />
                  Enable All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disableAllAssets}
                  data-testid="button-disable-all"
                >
                  <Square className="mr-1 h-4 w-4" />
                  Disable All
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={refreshTopAssets}
                  disabled={isLoadingAssets}
                  data-testid="button-refresh-assets"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingAssets ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-assets"
              />
            </div>

            {isLoadingAssets && topAssets.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No assets found matching "{searchQuery}"
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAssets.map((asset) => {
                  const isEnabled = enabledAssetIds.has(asset.id);

                  return (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between rounded-md border p-3 hover-elevate"
                      data-testid={`asset-row-${asset.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {asset.image ? (
                          <img
                            src={asset.image}
                            alt={asset.name}
                            className="h-8 w-8 rounded-full bg-muted"
                            data-testid={`img-asset-${asset.id}`}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold ${asset.image ? 'hidden' : ''}`}>
                          {asset.symbol.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium" data-testid={`text-asset-name-${asset.id}`}>
                            {asset.name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {asset.symbol}
                          </span>
                        </div>
                      </div>

                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => toggleAssetEnabled(asset.id, checked)}
                        data-testid={`switch-asset-${asset.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
