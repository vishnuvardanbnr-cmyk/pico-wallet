import { useState } from "react";
import { 
  Plus, 
  ExternalLink, 
  Copy,
  Layers,
  Coins,
  Trash2,
  Loader2,
  AlertCircle,
  Edit2,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { ChainIcon } from "@/components/chain-icon";
import { SeedVerificationModal } from "@/components/seed-verification-modal";
import { HardwareStatusCard } from "@/components/hardware-status";
import { getTokenInfo } from "@/lib/blockchain";
import type { Chain, Token, Wallet } from "@shared/schema";
import type { CustomToken } from "@/lib/client-storage";

function ChainCard({ chain, wallet, onRename }: { chain: Chain; wallet?: Wallet; onRename?: (walletId: string, newLabel: string) => Promise<void> }) {
  const { toast } = useToast();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newLabel, setNewLabel] = useState(wallet?.label || chain.name);
  const [isRenaming, setIsRenaming] = useState(false);

  const copyAddress = () => {
    if (wallet) {
      navigator.clipboard.writeText(wallet.address);
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard.",
      });
    }
  };

  const handleRename = async () => {
    if (!wallet || !onRename || !newLabel.trim()) return;
    
    setIsRenaming(true);
    try {
      await onRename(wallet.id, newLabel.trim());
      toast({
        title: "Wallet Renamed",
        description: `Wallet renamed to "${newLabel.trim()}"`,
      });
      setShowRenameDialog(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to rename wallet",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <Card className="overflow-hidden" data-testid={`card-chain-${chain.symbol}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <ChainIcon symbol={chain.symbol} iconColor={chain.iconColor} size="lg" />
            <div>
              <div className="flex items-center gap-1">
                <h3 className="font-semibold">{wallet?.label || chain.name}</h3>
                {wallet && onRename && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6"
                    onClick={() => {
                      setNewLabel(wallet.label || chain.name);
                      setShowRenameDialog(true);
                    }}
                    data-testid={`button-rename-${chain.symbol}`}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{chain.symbol}</p>
            </div>
          </div>
          <div className="flex gap-1">
            {chain.isDefault && (
              <Badge variant="secondary" className="text-xs">Default</Badge>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Chain ID</span>
            <span className="font-mono">{chain.chainId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Decimals</span>
            <span>{chain.decimals}</span>
          </div>
          {wallet && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Address</span>
              <div className="flex items-center gap-1">
                <code className="text-xs font-mono">
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                </code>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-6 w-6"
                  onClick={copyAddress}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {chain.blockExplorer && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => window.open(chain.blockExplorer, "_blank")}
            data-testid={`button-explorer-${chain.symbol}`}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Block Explorer
          </Button>
        )}
      </CardContent>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Wallet</DialogTitle>
            <DialogDescription>
              Give your {chain.name} wallet a custom name
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="wallet-name">Wallet Name</Label>
            <Input
              id="wallet-name"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="My Wallet"
              className="mt-2"
              data-testid="input-rename-wallet"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRename} 
              disabled={isRenaming || !newLabel.trim()}
              data-testid="button-confirm-rename"
            >
              {isRenaming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddChainDialog({ addCustomChain }: { addCustomChain: (chain: Omit<import("@/lib/client-storage").CustomChain, 'id' | 'addedAt'>) => Promise<import("@/lib/client-storage").CustomChain> }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    symbol: "",
    rpcUrl: "",
    chainId: "",
    blockExplorer: "",
    decimals: "18",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      symbol: "",
      rpcUrl: "",
      chainId: "",
      blockExplorer: "",
      decimals: "18",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      await addCustomChain({
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        rpcUrl: formData.rpcUrl,
        chainId: parseInt(formData.chainId),
        blockExplorer: formData.blockExplorer || undefined,
        decimals: parseInt(formData.decimals),
        iconColor: "#6B7280",
      });
      toast({
        title: "Network Added",
        description: `${formData.name} has been added successfully.`,
      });
      setOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add network. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-chain">
          <Plus className="mr-2 h-4 w-4" />
          Add Network
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Network</DialogTitle>
          <DialogDescription>
            Add a new blockchain network to your wallet
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Network Name</Label>
            <Input
              id="name"
              placeholder="Ethereum Mainnet"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              data-testid="input-chain-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Currency Symbol</Label>
              <Input
                id="symbol"
                placeholder="ETH"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                required
                data-testid="input-chain-symbol"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chainId">Chain ID</Label>
              <Input
                id="chainId"
                type="number"
                placeholder="1"
                value={formData.chainId}
                onChange={(e) => setFormData({ ...formData, chainId: e.target.value })}
                required
                data-testid="input-chain-id"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rpcUrl">RPC URL</Label>
            <Input
              id="rpcUrl"
              placeholder="https://mainnet.infura.io/v3/..."
              value={formData.rpcUrl}
              onChange={(e) => setFormData({ ...formData, rpcUrl: e.target.value })}
              required
              data-testid="input-chain-rpc"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blockExplorer">Block Explorer URL (Optional)</Label>
            <Input
              id="blockExplorer"
              placeholder="https://etherscan.io"
              value={formData.blockExplorer}
              onChange={(e) => setFormData({ ...formData, blockExplorer: e.target.value })}
              data-testid="input-chain-explorer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="decimals">Decimals</Label>
            <Input
              id="decimals"
              type="number"
              placeholder="18"
              value={formData.decimals}
              onChange={(e) => setFormData({ ...formData, decimals: e.target.value })}
              required
              data-testid="input-chain-decimals"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isAdding} data-testid="button-submit-chain">
              {isAdding ? "Adding..." : "Add Network"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SUPPORTED_TOKEN_CHAINS = [
  { id: 'ETH', name: 'Ethereum (ERC-20)', evmChainId: 1, rpcUrl: 'https://eth.llamarpc.com', type: 'evm' as const },
  { id: 'BNB', name: 'BNB Chain (BEP-20)', evmChainId: 56, rpcUrl: 'https://bsc-dataseed.binance.org', type: 'evm' as const },
  { id: 'MATIC', name: 'Polygon', evmChainId: 137, rpcUrl: 'https://polygon-rpc.com', type: 'evm' as const },
  { id: 'ARB', name: 'Arbitrum', evmChainId: 42161, rpcUrl: 'https://arb1.arbitrum.io/rpc', type: 'evm' as const },
  { id: 'TRX', name: 'TRON (TRC-20)', evmChainId: 0, rpcUrl: '', type: 'tron' as const },
];

interface TokenChainOption {
  id: string;
  name: string;
  evmChainId: number;
  rpcUrl: string;
  type: 'evm' | 'tron';
  isCustom?: boolean;
}

function AddTokenDialog({ addCustomToken, customChains }: { 
  addCustomToken: (token: Omit<CustomToken, 'id' | 'addedAt'>) => Promise<CustomToken>;
  customChains: import("@/lib/client-storage").CustomChain[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedChain, setSelectedChain] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number } | null>(null);
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualDecimals, setManualDecimals] = useState("18");

  // Merge default chains with custom chains
  const allTokenChains: TokenChainOption[] = [
    ...SUPPORTED_TOKEN_CHAINS,
    ...customChains.map(c => ({
      id: c.id,
      name: `${c.name} (Custom)`,
      evmChainId: c.chainId,
      rpcUrl: c.rpcUrl,
      type: 'evm' as const,
      isCustom: true,
    })),
  ];

  const selectedChainData = allTokenChains.find(c => c.id === selectedChain);
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

  const fetchTokenInfoHandler = async () => {
    if (!selectedChain || !contractAddress) return;
    
    const chain = allTokenChains.find(c => c.id === selectedChain);
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

    const chain = allTokenChains.find(c => c.id === selectedChain);
    if (!chain) return;

    const tokenData = isTronChain
      ? { name: manualName.trim(), symbol: manualSymbol.trim().toUpperCase(), decimals: parseInt(manualDecimals) || 18 }
      : tokenInfo;

    if (!tokenData) return;

    setIsAdding(true);
    try {
      await addCustomToken({
        chainId: chain.id,
        chainType: chain.type,
        contractAddress: contractAddress.trim(),
        name: tokenData.name,
        symbol: tokenData.symbol,
        decimals: tokenData.decimals,
        evmChainId: chain.evmChainId,
        rpcUrl: chain.rpcUrl,
      });

      toast({
        title: "Token Added",
        description: `${tokenData.name} has been added successfully.`,
      });

      resetDialog();
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add token. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetDialog();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-add-token">
          <Plus className="mr-2 h-4 w-4" />
          Add Token
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Token</DialogTitle>
          <DialogDescription>
            Add an ERC-20, BEP-20, or TRC-20 token by entering its contract address.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="chain">Blockchain Network</Label>
            <Select value={selectedChain} onValueChange={handleChainChange}>
              <SelectTrigger id="chain" data-testid="select-token-chain">
                <SelectValue placeholder="Select a network" />
              </SelectTrigger>
              <SelectContent>
                {allTokenChains.map((chain) => (
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
                className="font-mono"
                data-testid="input-token-contract"
              />
              {!isTronChain && (
                <Button
                  variant="outline"
                  onClick={fetchTokenInfoHandler}
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
          <Button variant="outline" onClick={() => { resetDialog(); setOpen(false); }}>
            Cancel
          </Button>
          <Button
            onClick={handleAddToken}
            disabled={!canAddToken() || isAdding}
            data-testid="button-submit-token"
          >
            {isAdding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Add Token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomTokenCard({ token, onRemove }: { token: CustomToken; onRemove: (id: string) => void }) {
  const chain = SUPPORTED_TOKEN_CHAINS.find(c => c.id === token.chainId);
  
  return (
    <Card data-testid={`card-token-${token.symbol}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"
            >
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{token.name}</h3>
              <p className="text-sm text-muted-foreground">{token.symbol}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {chain && (
              <Badge variant="outline" className="text-xs">
                {chain.name.split(' ')[0]}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(token.id)}
              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/20"
              data-testid={`button-remove-token-${token.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contract</span>
            <code className="text-xs font-mono">
              {token.contractAddress.slice(0, 6)}...{token.contractAddress.slice(-4)}
            </code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Decimals</span>
            <span>{token.decimals}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="uppercase text-xs">{token.chainType}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddNetworkCard({ chain, onClick }: { chain: Chain; onClick: () => void }) {
  return (
    <Card 
      className="cursor-pointer hover-elevate active-elevate-2 transition-all" 
      onClick={onClick}
      data-testid={`card-add-network-${chain.symbol}`}
    >
      <CardContent className="flex flex-col items-center justify-center p-6 text-center">
        <ChainIcon symbol={chain.symbol} iconColor={chain.iconColor} size="lg" />
        <h3 className="mt-3 font-semibold">{chain.name}</h3>
        <p className="text-xs text-muted-foreground mt-1">Tap to add</p>
      </CardContent>
    </Card>
  );
}

export default function Chains() {
  const { 
    wallets, 
    isUnlocked, 
    chains, 
    customTokens, 
    addCustomToken, 
    removeCustomToken, 
    addCustomChain, 
    customChains,
    pendingAddChain,
    setPendingAddChain,
    walletMode,
    renameWallet,
  } = useWallet();
  const hasWallet = wallets.length > 0;
  const [activeTab, setActiveTab] = useState("chains");
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // Separate chains into active (has wallet) and available (no wallet yet)
  const activeChains = chains.filter(chain => wallets.some(w => w.chainId === chain.id));
  const availableChains = chains.filter(chain => !wallets.some(w => w.chainId === chain.id));

  const handleAddNetwork = (chain: Chain) => {
    // For soft wallets, require seed verification
    if (walletMode === "soft_wallet") {
      setPendingAddChain({ chainId: chain.id, chainName: chain.name });
      setShowVerificationModal(true);
    }
  };

  if (!hasWallet || !isUnlocked) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-3xl font-bold">Chains & Tokens</h1>
        <HardwareStatusCard />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-3xl font-bold">Chains & Tokens</h1>
        </div>
        <div className="flex gap-2">
          <AddTokenDialog addCustomToken={addCustomToken} customChains={customChains} />
          <AddChainDialog addCustomChain={addCustomChain} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="chains" data-testid="tab-chains">
            <Layers className="mr-2 h-4 w-4" />
            Networks ({activeChains.length})
          </TabsTrigger>
          <TabsTrigger value="tokens" data-testid="tab-tokens">
            <Coins className="mr-2 h-4 w-4" />
            Tokens ({customTokens.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chains" className="space-y-8">
          {/* Your Chains Section */}
          <div>
            <h2 className="text-lg font-semibold mb-2">Your Chains</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {activeChains.length} network{activeChains.length !== 1 ? 's' : ''} active
            </p>
            {activeChains.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeChains.map((chain) => {
                  const wallet = wallets.find((w) => w.chainId === chain.id);
                  return <ChainCard key={chain.id} chain={chain} wallet={wallet} onRename={renameWallet} />;
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No active networks. Add one below.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Add Networks Section */}
          {availableChains.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Add Networks</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {availableChains.length} available
              </p>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {availableChains.map((chain) => (
                  <AddNetworkCard 
                    key={chain.id} 
                    chain={chain} 
                    onClick={() => handleAddNetwork(chain)}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tokens">
          {customTokens.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Coins className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Custom Tokens</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add custom ERC-20, BEP-20, or TRC-20 tokens to track
                </p>
                <AddTokenDialog addCustomToken={addCustomToken} customChains={customChains} />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {customTokens.map((token) => (
                <CustomTokenCard key={token.id} token={token} onRemove={removeCustomToken} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Seed Verification Modal */}
      <SeedVerificationModal 
        open={showVerificationModal && !!pendingAddChain}
        onOpenChange={setShowVerificationModal}
      />
    </div>
  );
}
