import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Capacitor } from "@capacitor/core";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Copy, 
  QrCode,
  Send,
  Shield,
  AlertCircle,
  Coins,
  ScanLine,
  Users,
  Check,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { ChainIcon } from "@/components/chain-icon";
import { HardwareStatusCard } from "@/components/hardware-status";
import { clientStorage, type CustomToken } from "@/lib/client-storage";
import { formatCryptoBalance } from "@/lib/price-service";
import { TOKEN_PARENT_CHAIN_SYMBOL } from "@/lib/chain-mappings";
import { nativeHttpPost } from "@/lib/native-http";
import type { Chain, Wallet } from "@shared/schema";

interface TokenOption {
  id: string;
  symbol: string;
  name: string;
  balance: string;
  isNative: boolean;
  contractAddress?: string;
  decimals?: number;
  image?: string;
}

function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

const formatBalance = formatCryptoBalance;

function getAddressPlaceholder(symbol: string | undefined): string {
  if (!symbol) return "Enter address...";
  
  switch (symbol.toUpperCase()) {
    case 'BTC':
      return "bc1... or 1... or 3...";
    case 'SOL':
      return "Base58 address...";
    case 'XRP':
      return "r...";
    case 'ADA':
      return "addr1...";
    case 'DOGE':
      return "D...";
    case 'DOT':
      return "1... (SS58 format)";
    case 'LTC':
      return "L... or M... or ltc1...";
    case 'BCH':
      return "bitcoincash:q...";
    case 'TRX':
      return "T...";
    case 'ATOM':
    case 'OSMO':
      return "cosmos1... or osmo1...";
    case 'ETH':
    case 'BNB':
    case 'MATIC':
    case 'AVAX':
    case 'ARB':
    default:
      return "0x...";
  }
}

interface GasEstimate {
  gasPrice: string;
  gasPriceGwei: string;
  estimatedGas: string;
  estimatedFee: string;
  estimatedFeeUsd: string | null;
  symbol: string;
  error?: string;
}

// RPC endpoints for client-side gas estimation (mobile)
const RPC_ENDPOINTS: Record<string, string> = {
  'chain-0': 'https://eth.llamarpc.com',           // Ethereum
  'chain-2': 'https://bsc-dataseed1.binance.org',  // BNB Chain (chain-2)
  'chain-3': 'https://polygon-rpc.com',            // Polygon
  'chain-4': 'https://api.avax.network/ext/bc/C/rpc', // Avalanche
  'chain-5': 'https://arb1.arbitrum.io/rpc',       // Arbitrum
  'chain-7': 'https://mainnet.optimism.io',        // Optimism
};

const DEFAULT_GAS_LIMITS: Record<string, number> = {
  'chain-0': 21000,  // Ethereum
  'chain-1': 250,    // Bitcoin (vbytes)
  'chain-2': 21000,  // BNB Chain
  'chain-3': 21000,  // Polygon
  'chain-4': 21000,  // Avalanche
  'chain-5': 21000,  // Arbitrum
  'chain-7': 21000,  // Optimism
  'chain-11': 5000,  // Solana (compute units)
  'chain-8': 0,      // TRON (bandwidth)
};

const TOKEN_GAS_LIMITS: Record<string, number> = {
  'chain-0': 65000,  // Ethereum ERC20
  'chain-2': 65000,  // BNB Chain BEP20
  'chain-3': 65000,  // Polygon ERC20
  'chain-4': 65000,  // Avalanche ERC20
  'chain-5': 65000,  // Arbitrum ERC20
  'chain-7': 65000,  // Optimism ERC20
};

// Non-EVM chain symbols and their static fees
const NON_EVM_CHAIN_FEES: Record<string, { fee: string; unit: string }> = {
  'BTC': { fee: '0.00001', unit: 'BTC' },
  'SOL': { fee: '0.000005', unit: 'SOL' },
  'TRX': { fee: '0', unit: 'TRX' },
  'XRP': { fee: '0.00001', unit: 'XRP' },
  'DOGE': { fee: '1', unit: 'DOGE' },
  'LTC': { fee: '0.0001', unit: 'LTC' },
  'BCH': { fee: '0.00001', unit: 'BCH' },
  'ADA': { fee: '0.17', unit: 'ADA' },
  'ATOM': { fee: '0.005', unit: 'ATOM' },
  'OSMO': { fee: '0.005', unit: 'OSMO' },
  'DOT': { fee: '0.01', unit: 'DOT' },
};

async function fetchClientSideGasEstimate(chainId: string, isNative: boolean, chainSymbol?: string): Promise<GasEstimate> {
  const symbol = chainSymbol || 'ETH';
  
  // Non-EVM chains have static fees - check by symbol
  const nonEvmFee = NON_EVM_CHAIN_FEES[symbol];
  if (nonEvmFee) {
    return {
      gasPrice: '0',
      gasPriceGwei: 'N/A',
      estimatedGas: '0',
      estimatedFee: nonEvmFee.fee,
      estimatedFeeUsd: null,
      symbol: nonEvmFee.unit,
    };
  }
  
  // For EVM chains, fetch gas price from RPC
  const rpcUrl = RPC_ENDPOINTS[chainId];
  if (!rpcUrl) {
    return {
      gasPrice: '0',
      gasPriceGwei: '20',
      estimatedGas: '21000',
      estimatedFee: '0.00042',
      estimatedFeeUsd: null,
      symbol,
      error: 'No RPC endpoint available',
    };
  }
  
  try {
    console.log('[GasEstimate] Fetching gas price for chain:', chainId, 'RPC:', rpcUrl);
    
    // Use native HTTP for mobile, regular fetch for web
    const data = await nativeHttpPost(rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_gasPrice',
      params: [],
      id: 1,
    });
    
    console.log('[GasEstimate] Response:', data);
    
    if (!data.result) {
      console.error('[GasEstimate] No result in response:', data);
      throw new Error('No gas price result');
    }
    
    const gasPriceWei = BigInt(data.result);
    const gasPriceGwei = (Number(gasPriceWei) / 1e9).toFixed(2);
    const gasLimit = isNative 
      ? (DEFAULT_GAS_LIMITS[chainId] || 21000)
      : (TOKEN_GAS_LIMITS[chainId] || 65000);
    const estimatedFeeWei = gasPriceWei * BigInt(gasLimit);
    const estimatedFee = (Number(estimatedFeeWei) / 1e18).toFixed(6);
    
    return {
      gasPrice: gasPriceWei.toString(),
      gasPriceGwei,
      estimatedGas: gasLimit.toString(),
      estimatedFee,
      estimatedFeeUsd: null,
      symbol,
    };
  } catch (error) {
    console.error('[GasEstimate] Client-side fetch failed:', error);
    // Return chain-specific fallback estimates
    const fallbackGasPrice = getFallbackGasPrice(chainId);
    const gasLimit = isNative 
      ? (DEFAULT_GAS_LIMITS[chainId] || 21000)
      : (TOKEN_GAS_LIMITS[chainId] || 65000);
    const estimatedFee = (fallbackGasPrice * gasLimit / 1e9).toFixed(6);
    
    return {
      gasPrice: (fallbackGasPrice * 1e9).toString(),
      gasPriceGwei: fallbackGasPrice.toString(),
      estimatedGas: gasLimit.toString(),
      estimatedFee,
      estimatedFeeUsd: null,
      symbol,
      error: 'Using estimated values',
    };
  }
}

// Chain-specific fallback gas prices in Gwei
function getFallbackGasPrice(chainId: string): number {
  const fallbacks: Record<string, number> = {
    'chain-0': 20,    // Ethereum ~20 Gwei
    'chain-2': 1,     // BNB Chain ~1 Gwei (actual is 0.05 but using 1 as safe fallback)
    'chain-3': 30,    // Polygon ~30 Gwei
    'chain-4': 25,    // Avalanche ~25 Gwei
    'chain-5': 0.1,   // Arbitrum ~0.1 Gwei
    'chain-7': 0.001, // Optimism ~0.001 Gwei
  };
  return fallbacks[chainId] || 20;
}

function SendTab({ chains, wallets, initialChainId, initialTokenId }: { chains: Chain[]; wallets: Wallet[]; initialChainId?: string; initialTokenId?: string }) {
  const { setShowPinModal, setPinAction, setPendingTransaction, topAssets, enabledAssetIds, tokenBalances, customTokenBalances } = useWallet();
  const { toast } = useToast();
  const [selectedChainId, setSelectedChainId] = useState<string>(initialChainId || "");
  const [selectedTokenId, setSelectedTokenId] = useState<string>(initialTokenId || "native");
  const isTokenLocked = !!initialTokenId;
  const [tokenOptions, setTokenOptions] = useState<TokenOption[]>([]);
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  console.log("[SendTab] initialChainId:", initialChainId, "selectedChainId:", selectedChainId, "chains.length:", chains.length);

  const selectedChain = chains.find((c) => c.id === selectedChainId);
  const selectedWallet = wallets.find((w) => w.chainId === selectedChainId);
  const selectedToken = tokenOptions.find(t => t.id === selectedTokenId) || tokenOptions[0];

  const isNativeToken = selectedToken?.isNative ?? true;
  const isMobile = Capacitor.isNativePlatform();
  
  // Non-EVM chains - determined by chain symbol (more reliable than hardcoded IDs)
  const NON_EVM_SYMBOLS = new Set(['BTC', 'SOL', 'TRX', 'XRP', 'DOGE', 'LTC', 'BCH', 'ADA', 'ATOM', 'OSMO', 'DOT']);
  const isNonEvmChain = selectedChain ? NON_EVM_SYMBOLS.has(selectedChain.symbol) : false;
  
  const { data: gasEstimate, isLoading: gasLoading } = useQuery<GasEstimate>({
    queryKey: ["/api/gas-estimate", selectedChainId, isNativeToken, isMobile, isNonEvmChain, selectedChain?.symbol],
    queryFn: async () => {
      // Non-EVM chains always use client-side static fees
      if (isNonEvmChain) {
        return fetchClientSideGasEstimate(selectedChainId, isNativeToken, selectedChain?.symbol);
      }
      // On mobile, use client-side gas estimation (no backend available)
      if (isMobile) {
        return fetchClientSideGasEstimate(selectedChainId, isNativeToken, selectedChain?.symbol);
      }
      // On desktop for EVM chains, use backend API
      const response = await fetch(`/api/gas-estimate?chainId=${selectedChainId}&isNative=${isNativeToken}`);
      return response.json();
    },
    enabled: !!selectedChainId && !!selectedChain,
    refetchInterval: 30000,
  });

  // Update selected chain when initialChainId changes (e.g., user clicks different chain's Send button)
  useEffect(() => {
    console.log("[SendTab useEffect] initialChainId:", initialChainId, "chains.length:", chains.length, "current selectedChainId:", selectedChainId);
    if (initialChainId && chains.find(c => c.id === initialChainId)) {
      console.log("[SendTab useEffect] Setting selectedChainId to initialChainId:", initialChainId);
      setSelectedChainId(initialChainId);
    } else if (chains.length > 0 && !selectedChainId) {
      console.log("[SendTab useEffect] Defaulting to first chain:", chains[0].id);
      setSelectedChainId(chains[0].id);
    }
  }, [chains, initialChainId]);

  // Load custom tokens when chain or wallet changes
  useEffect(() => {
    async function loadTokenOptions() {
      if (!selectedChain || !selectedWallet) {
        setTokenOptions([]);
        return;
      }

      // Start with native token
      const options: TokenOption[] = [{
        id: "native",
        symbol: selectedChain.symbol,
        name: selectedChain.name,
        balance: selectedWallet.balance,
        isNative: true,
      }];

      // Add standard tokens from topAssets that match this chain
      const chainSymbol = selectedChain.symbol;
      topAssets.forEach(asset => {
        const parentChainSymbol = TOKEN_PARENT_CHAIN_SYMBOL[asset.id];
        if (parentChainSymbol === chainSymbol && enabledAssetIds.has(asset.id)) {
          const balance = tokenBalances[asset.id] || "0";
          options.push({
            id: asset.id,
            symbol: asset.symbol.toUpperCase(),
            name: asset.name,
            balance,
            isNative: false,
            image: asset.image,
          });
        }
      });

      // Load wallet-specific custom tokens
      try {
        const customTokens = await clientStorage.getCustomTokens();
        const walletTokens = customTokens.filter(token => 
          token.chainId === selectedChainId && 
          (token.walletId === selectedWallet.id || !token.walletId)
        );

        for (const token of walletTokens) {
          const balance = customTokenBalances[token.id] || "0";
          options.push({
            id: token.id,
            symbol: token.symbol,
            name: token.name,
            balance,
            isNative: false,
            contractAddress: token.contractAddress,
            decimals: token.decimals,
            image: token.image,
          });
        }
      } catch (err) {
        console.error("Failed to load custom tokens:", err);
      }

      setTokenOptions(options);
      // Only reset to native if no initialTokenId is provided
      if (!initialTokenId) {
        setSelectedTokenId("native");
      }
    }

    loadTokenOptions();
  }, [selectedChainId, selectedChain, selectedWallet, initialTokenId, topAssets, enabledAssetIds, tokenBalances, customTokenBalances]);

  const handleSend = () => {
    setError("");

    if (!toAddress) {
      setError("Please enter a recipient address");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    const balance = parseFloat(selectedToken?.balance || "0");
    if (parseFloat(amount) > balance) {
      setError("Insufficient balance");
      return;
    }

    setPendingTransaction({
      toAddress,
      amount,
      chainId: selectedChainId,
      tokenSymbol: selectedToken?.symbol,
      tokenContractAddress: selectedToken?.contractAddress,
      isNativeToken: selectedToken?.isNative ?? true,
      fromAddress: selectedWallet?.address,
      walletGroupId: selectedWallet?.walletGroupId,
    });
    setPinAction("sign");
    setShowPinModal(true);
  };

  const handleMaxAmount = () => {
    if (selectedToken) {
      setAmount(selectedToken.balance);
    }
  };

  const handleChainChange = (chainId: string) => {
    setSelectedChainId(chainId);
    setSelectedTokenId("native");
    setAmount("");
  };

  return (
    <div className="space-y-6">
      {!initialChainId && (
        <div className="space-y-2">
          <Label htmlFor="chain">Network</Label>
          <Select value={selectedChainId} onValueChange={handleChainChange}>
            <SelectTrigger id="chain" data-testid="select-send-chain">
              <SelectValue placeholder="Select network" />
            </SelectTrigger>
            <SelectContent>
              {chains.map((chain) => {
                const wallet = wallets.find((w) => w.chainId === chain.id);
                return (
                  <SelectItem key={chain.id} value={chain.id}>
                    <div className="flex items-center gap-2">
                      <ChainIcon symbol={chain.symbol} iconColor={chain.iconColor} size="sm" />
                      <span>{chain.name}</span>
                      <span className="text-muted-foreground">
                        ({formatBalance(wallet?.balance || "0")} {chain.symbol})
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="token">Coin / Token {isTokenLocked && <span className="text-xs text-muted-foreground">(locked)</span>}</Label>
        <Select value={selectedTokenId} onValueChange={setSelectedTokenId} disabled={isTokenLocked}>
          <SelectTrigger id="token" data-testid="select-send-token" className={isTokenLocked ? "opacity-70" : ""}>
            <SelectValue placeholder="Select coin or token" />
          </SelectTrigger>
          <SelectContent>
            {tokenOptions.map((token) => (
              <SelectItem key={token.id} value={token.id}>
                <div className="flex items-center gap-2">
                  {token.isNative ? (
                    <ChainIcon symbol={token.symbol} size="sm" />
                  ) : token.image ? (
                    <img 
                      src={token.image} 
                      alt={token.symbol} 
                      className="h-5 w-5 rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Coins className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{token.symbol}</span>
                  <span className="text-muted-foreground">
                    {token.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({formatBalance(token.balance)})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="recipient">Recipient Address</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto py-0 text-xs gap-1"
                data-testid="button-select-wallet"
              >
                <Users className="h-3 w-3" />
                Select Wallet
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {wallets
                .filter(w => w.chainId === selectedChainId && w.address !== selectedWallet?.address)
                .map((wallet) => (
                  <DropdownMenuItem
                    key={wallet.id}
                    onClick={() => setToAddress(wallet.address)}
                    className="flex items-center gap-2 font-mono text-xs"
                    data-testid={`wallet-option-${wallet.id}`}
                  >
                    <ChainIcon symbol={selectedChain?.symbol || ''} size="sm" />
                    <span className="truncate flex-1">
                      {wallet.address.slice(0, 12)}...{wallet.address.slice(-8)}
                    </span>
                    {toAddress === wallet.address && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              {wallets.filter(w => w.chainId === selectedChainId && w.address !== selectedWallet?.address).length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                  No other wallets on this chain
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex gap-1">
          <Input
            id="recipient"
            placeholder={getAddressPlaceholder(selectedChain?.symbol)}
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            className="font-mono flex-1"
            data-testid="input-recipient-address"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              if (Capacitor.isNativePlatform()) {
                toast({
                  title: "QR Scanner",
                  description: "QR scanning will open your camera",
                });
              } else {
                toast({
                  title: "QR Scanner",
                  description: "QR scanning is available on mobile app",
                });
              }
            }}
            data-testid="button-scan-qr"
          >
            <ScanLine className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="amount">Amount</Label>
          <Button 
            type="button"
            variant="ghost" 
            size="sm" 
            className="h-auto py-0 text-xs"
            onClick={handleMaxAmount}
            data-testid="button-max-amount"
          >
            Max: {formatBalance(selectedToken?.balance || "0")} {selectedToken?.symbol || selectedChain?.symbol}
          </Button>
        </div>
        <div className="relative">
          <Input
            id="amount"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pr-16"
            data-testid="input-send-amount"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {selectedToken?.symbol || selectedChain?.symbol}
          </span>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg bg-muted/50 p-4">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Gas Price</span>
          {gasLoading ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <span data-testid="text-gas-price">
              {isNonEvmChain 
                ? 'Fixed fee' 
                : gasEstimate?.gasPriceGwei && gasEstimate.gasPriceGwei !== 'N/A' 
                  ? `${gasEstimate.gasPriceGwei} Gwei` 
                  : '~20 Gwei'}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Estimated Gas Fee</span>
          {gasLoading ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <span data-testid="text-gas-fee">
              ~{gasEstimate?.estimatedFee || "0.00042"} {selectedChain?.symbol}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Total</span>
          {gasLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className="font-medium" data-testid="text-total-amount">
              {isNativeToken ? (
                // Native token: amount + gas fee (both in same currency)
                <>
                  {amount 
                    ? (parseFloat(amount) + parseFloat(gasEstimate?.estimatedFee || "0")).toFixed(6) 
                    : "0.00"} {selectedChain?.symbol}
                </>
              ) : (
                // Token transfer: show amount in token + gas fee in native
                <>
                  {amount || "0"} {selectedToken?.symbol} + ~{gasEstimate?.estimatedFee || "0"} {selectedChain?.symbol}
                </>
              )}
            </span>
          )}
        </div>
        {gasEstimate?.error && (
          <p className="mt-2 text-xs text-muted-foreground">
            Using estimated values (live data unavailable)
          </p>
        )}
      </div>

      <Button 
        type="button"
        className="w-full" 
        size="lg"
        onClick={handleSend}
        disabled={!toAddress || !amount}
        data-testid="button-sign-transaction"
      >
        <Shield className="mr-2 h-4 w-4" />
        Sign & Send Transaction
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        You will need to enter your PIN to authorize this transaction
      </p>
    </div>
  );
}

function ReceiveTab({ chains, wallets, initialChainId }: { chains: Chain[]; wallets: Wallet[]; initialChainId?: string }) {
  const { toast } = useToast();
  const [selectedChainId, setSelectedChainId] = useState<string>(initialChainId || "");

  const selectedChain = chains.find((c) => c.id === selectedChainId);
  const selectedWallet = wallets.find((w) => w.chainId === selectedChainId);

  // Update selected chain when initialChainId changes (e.g., user clicks different chain's Receive button)
  useEffect(() => {
    if (initialChainId && chains.find(c => c.id === initialChainId)) {
      setSelectedChainId(initialChainId);
    } else if (chains.length > 0 && !selectedChainId) {
      setSelectedChainId(chains[0].id);
    }
  }, [chains, initialChainId]);

  const copyAddress = () => {
    if (selectedWallet) {
      navigator.clipboard.writeText(selectedWallet.address);
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="receive-chain">Network</Label>
        <Select value={selectedChainId} onValueChange={setSelectedChainId}>
          <SelectTrigger id="receive-chain" data-testid="select-receive-chain">
            <SelectValue placeholder="Select network" />
          </SelectTrigger>
          <SelectContent>
            {chains.map((chain) => (
              <SelectItem key={chain.id} value={chain.id}>
                <div className="flex items-center gap-2">
                  <ChainIcon symbol={chain.symbol} iconColor={chain.iconColor} size="sm" />
                  <span>{chain.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col items-center justify-center py-6">
        <div className="mb-6 flex h-64 w-64 items-center justify-center rounded-xl bg-white p-4">
          {selectedWallet ? (
            <QRCodeSVG 
              value={selectedWallet.address} 
              size={224}
              level="M"
              includeMargin={false}
              data-testid="qr-code-address"
            />
          ) : (
            <div className="text-center">
              <QrCode className="mx-auto h-32 w-32 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">Select a network</p>
            </div>
          )}
        </div>

        {selectedWallet && (
          <>
            <div className="mb-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Your {selectedChain?.name} Address</p>
              <code className="block rounded-lg bg-muted/50 px-4 py-3 font-mono text-sm break-all">
                {selectedWallet.address}
              </code>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={copyAddress} data-testid="button-copy-receive-address">
                <Copy className="mr-2 h-4 w-4" />
                Copy Address
              </Button>
            </div>
          </>
        )}
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Only send {selectedChain?.symbol} and tokens on the {selectedChain?.name} network to this address. Sending other assets may result in permanent loss.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function Transfer() {
  const { isConnected, isUnlocked, chains, wallets, visibleWallets, walletMode, refreshBalances } = useWallet();
  
  // Use visibleWallets for hard wallet mode to ensure proper data display
  const displayWallets = walletMode === "hard_wallet" ? visibleWallets : wallets;
  
  // Track URL search string reactively using window events
  const [searchString, setSearchString] = useState(() => window.location.search);
  
  // Listen for URL changes (popstate for back/forward, and custom event for Link navigation)
  useEffect(() => {
    const updateSearch = () => {
      setSearchString(window.location.search);
    };
    
    // popstate fires on back/forward navigation
    window.addEventListener('popstate', updateSearch);
    
    // Check for search string changes on every render (handles Link navigation)
    updateSearch();
    
    return () => {
      window.removeEventListener('popstate', updateSearch);
    };
  }, []);
  
  // Also check on any navigation by using an interval briefly or checking regularly
  // This is needed because wouter's Link doesn't fire popstate
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (window.location.search !== searchString) {
        setSearchString(window.location.search);
      }
    }, 100);
    
    return () => clearInterval(checkInterval);
  }, [searchString]);
  
  const queryParams = new URLSearchParams(searchString);
  const defaultTab = queryParams.get("type") === "receive" ? "receive" : "send";
  const chainParam = queryParams.get("chain") || undefined;
  const tokenParam = queryParams.get("token") || undefined;
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  // Update active tab when query params change
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const typeParam = params.get("type");
    if (typeParam === "receive" || typeParam === "send") {
      setActiveTab(typeParam);
    }
  }, [searchString]);
  
  console.log("[Transfer] chainParam:", chainParam, "search:", searchString);

  // Track if we've already refreshed balances on this page load
  const hasRefreshedRef = useRef(false);
  
  // Refresh balances once when page loads in hard wallet mode
  useEffect(() => {
    if (walletMode === "hard_wallet" && displayWallets.length > 0 && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      refreshBalances();
    }
  }, [walletMode, displayWallets.length, refreshBalances]);

  if (displayWallets.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-3xl font-bold">Send / Receive</h1>
        <HardwareStatusCard />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <BackButton />
        <h1 className="text-3xl font-bold">Send / Receive</h1>
      </div>

      <Card className="max-w-lg mx-auto">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="send" data-testid="tab-send">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Send
              </TabsTrigger>
              <TabsTrigger value="receive" data-testid="tab-receive">
                <ArrowDownLeft className="mr-2 h-4 w-4" />
                Receive
              </TabsTrigger>
            </TabsList>

            <TabsContent value="send">
              <SendTab key={`send-${chainParam}-${tokenParam}`} chains={chains} wallets={displayWallets} initialChainId={chainParam} initialTokenId={tokenParam} />
            </TabsContent>

            <TabsContent value="receive">
              <ReceiveTab key={`receive-${chainParam}`} chains={chains} wallets={displayWallets} initialChainId={chainParam} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
