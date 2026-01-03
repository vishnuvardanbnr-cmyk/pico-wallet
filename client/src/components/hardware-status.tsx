import { useState } from "react";
import { motion } from "framer-motion";
import { Usb, Lock, Unlock, Shield, Unplug, RotateCcw, AlertTriangle, Laptop, Cpu, Copy, Check, Plus, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { hardwareWallet } from "@/lib/hardware-wallet";
import { softWallet } from "@/lib/soft-wallet";
import { ethers } from "ethers";
import { DEFAULT_CHAINS } from "@shared/schema";
import { ChainIcon } from "@/components/chain-icon";

function getChainIcon(symbol: string) {
  return <ChainIcon symbol={symbol} size="sm" />;
}

export function HardwareStatus() {
  const { 
    isConnected, 
    isUnlocked, 
    hardwareState,
    setShowPinModal,
    setPinAction,
    lockWallet,
    connectRaspberryPi,
    connectLedger,
    connectSimulated,
    unlockWallet,
    deriveWallets,
    isLoading,
    walletMode,
    setWalletMode,
  } = useWallet();
  const { toast } = useToast();
  
  const [showHeaderSetupDialog, setShowHeaderSetupDialog] = useState(false);
  const [showHeaderPicoSetupDialog, setShowHeaderPicoSetupDialog] = useState(false);
  const [headerSetupTab, setHeaderSetupTab] = useState<"hard_wallet" | "soft_wallet">("soft_wallet");
  
  // Soft wallet wizard states - chain selection is first step
  const [softWalletStep, setSoftWalletStep] = useState<"select-chains" | "choose" | "display" | "confirm" | "pin">("select-chains");
  const [softWalletWordCount, setSoftWalletWordCount] = useState<12 | 24>(24);
  const [softWalletGeneratedSeed, setSoftWalletGeneratedSeed] = useState("");
  const [softWalletSeedConfirmed, setSoftWalletSeedConfirmed] = useState(false);
  const [softWalletCopied, setSoftWalletCopied] = useState(false);
  const [softWalletMode, setSoftWalletMode] = useState<"create" | "import">("create");
  const [softWalletImportSeed, setSoftWalletImportSeed] = useState("");
  const [softWalletSelectedChains, setSoftWalletSelectedChains] = useState<Set<string>>(new Set());
  
  // Form states for soft wallet
  const [softWalletPin, setSoftWalletPin] = useState("");
  const [softWalletConfirmPin, setSoftWalletConfirmPin] = useState("");
  const [softWalletError, setSoftWalletError] = useState("");
  const [softWalletLoading, setSoftWalletLoading] = useState(false);
  
  // Form states for Pico setup - multi-step wizard
  const [headerPicoStep, setHeaderPicoStep] = useState<"choose" | "display" | "confirm" | "pin">("choose");
  const [headerPicoWordCount, setHeaderPicoWordCount] = useState<12 | 24>(24);
  const [headerPicoGeneratedSeed, setHeaderPicoGeneratedSeed] = useState("");
  const [headerPicoSeedConfirmed, setHeaderPicoSeedConfirmed] = useState(false);
  const [headerPicoCopied, setHeaderPicoCopied] = useState(false);
  const [headerPicoPin, setHeaderPicoPin] = useState("");
  const [headerPicoConfirmPin, setHeaderPicoConfirmPin] = useState("");
  const [headerPicoError, setHeaderPicoError] = useState("");
  const [headerPicoLoading, setHeaderPicoLoading] = useState(false);
  const [headerPicoMode, setHeaderPicoMode] = useState<"create" | "import">("create");
  const [headerPicoImportSeed, setHeaderPicoImportSeed] = useState("");

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const handleConnect = () => {
    console.log("[HardwareStatus] handleConnect() - isConnected:", isConnected, "isUnlocked:", isUnlocked, "isMobile:", isMobile);
    if (!isConnected) {
      // For hard wallet mode on mobile, go directly to the bridge page
      if (walletMode === "hard_wallet" && isMobile) {
        console.log("[HardwareStatus] Mobile hard wallet - navigating to bridge");
        window.location.href = "/bridge";
        return;
      }
      
      console.log("[HardwareStatus] Not connected - showing setup dialog");
      // Set the dialog tab to match the current wallet mode
      setHeaderSetupTab(walletMode);
      // Pre-select default chains (ETH, BTC, BNB, TRX) using chain-${index} format
      const popularChains = new Set<string>();
      DEFAULT_CHAINS.forEach((chain, index) => {
        if (['ETH', 'BTC', 'BNB', 'TRX'].includes(chain.symbol)) {
          popularChains.add(`chain-${index}`);
        }
      });
      setSoftWalletSelectedChains(popularChains);
      setSoftWalletStep("select-chains");
      setShowHeaderSetupDialog(true);
    } else if (!isUnlocked) {
      console.log("[HardwareStatus] Connected but locked - showing PIN unlock");
      setPinAction("unlock");
      setShowPinModal(true);
    }
  };
  
  const handleHeaderConnectRaspberryPi = async () => {
    console.log("[HardwareStatus] handleHeaderConnectRaspberryPi() called");
    const result = await connectRaspberryPi();
    console.log("[HardwareStatus] connectRaspberryPi result:", result);
    
    if (result.success) {
      setShowHeaderSetupDialog(false);
      
      if (!result.hasWallet) {
        console.log("[HardwareStatus] NEW DEVICE - showing wallet setup");
        toast({
          title: "New Device Detected",
          description: "This is a new device. Let's set up your wallet.",
        });
        // Reset all Pico setup state
        setHeaderPicoStep("choose");
        setHeaderPicoMode("create");
        setHeaderPicoWordCount(24);
        setHeaderPicoGeneratedSeed("");
        setHeaderPicoSeedConfirmed(false);
        setHeaderPicoCopied(false);
        setHeaderPicoPin("");
        setHeaderPicoConfirmPin("");
        setHeaderPicoError("");
        setHeaderPicoImportSeed("");
        setShowHeaderPicoSetupDialog(true);
      } else {
        console.log("[HardwareStatus] EXISTING WALLET - showing PIN unlock");
        toast({
          title: "Wallet Found",
          description: "Existing wallet detected. Please enter your PIN to unlock.",
        });
        setPinAction("unlock");
        setShowPinModal(true);
      }
    } else {
      console.log("[HardwareStatus] Connection failed:", result.error);
      toast({
        title: "Connection Failed",
        description: result.error || "Failed to connect",
        variant: "destructive",
      });
    }
  };
  
  const handleHeaderConnectLedger = async () => {
    const success = await connectLedger();
    if (success) {
      setShowHeaderSetupDialog(false);
      toast({ title: "Ledger Connected", description: "Please enter your PIN to unlock." });
      setPinAction("unlock");
      setShowPinModal(true);
    } else if (hardwareState.error) {
      toast({ title: "Connection Failed", description: hardwareState.error, variant: "destructive" });
    }
  };
  
  // Soft wallet wizard functions
  const handleSoftWalletGenerateSeed = () => {
    try {
      let phrase: string;
      if (softWalletWordCount === 12) {
        const entropy = ethers.randomBytes(16);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      } else {
        const entropy = ethers.randomBytes(32);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      }
      setSoftWalletGeneratedSeed(phrase);
      setSoftWalletStep("display");
    } catch (error: any) {
      setSoftWalletError("Failed to generate seed phrase");
    }
  };

  const handleSoftWalletCopySeed = async () => {
    try {
      await navigator.clipboard.writeText(softWalletGeneratedSeed);
      setSoftWalletCopied(true);
      setTimeout(() => setSoftWalletCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please manually select and copy", variant: "destructive" });
    }
  };

  // Validate chain selection and proceed to recovery phrase step
  const handleConfirmChainSelection = () => {
    if (softWalletSelectedChains.size === 0) {
      setSoftWalletError("Please select at least one chain.");
      return;
    }
    setSoftWalletError("");
    setSoftWalletStep("choose");
  };

  // Validate PIN and create wallet
  const handleValidatePinAndCreateWallet = () => {
    setSoftWalletError("");
    
    const seedToUse = softWalletMode === "create" ? softWalletGeneratedSeed : softWalletImportSeed;
    
    if (!seedToUse || seedToUse.trim().length === 0) {
      setSoftWalletError("No recovery phrase found. Please go back and generate one.");
      return;
    }
    
    const words = seedToUse.trim().toLowerCase().split(/\s+/);
    
    if (words.length !== 12 && words.length !== 24) {
      setSoftWalletError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    if (softWalletPin.length !== 5 || !/^\d+$/.test(softWalletPin)) {
      setSoftWalletError("PIN must be 5 digits.");
      return;
    }
    if (softWalletPin !== softWalletConfirmPin) {
      setSoftWalletError("PINs do not match.");
      return;
    }
    
    // Proceed to create wallet
    handleSetupSoftWallet();
  };

  const handleSetupSoftWallet = async () => {
    console.log("[handleSetupSoftWallet] Starting soft wallet setup");
    setSoftWalletError("");
    
    if (softWalletSelectedChains.size === 0) {
      setSoftWalletError("Please select at least one chain.");
      return;
    }
    
    const seedToUse = softWalletMode === "create" ? softWalletGeneratedSeed : softWalletImportSeed;
    const words = seedToUse.trim().toLowerCase().split(/\s+/);
    
    setSoftWalletLoading(true);
    try {
      console.log("[handleSetupSoftWallet] Calling softWallet.setup()");
      const success = await softWallet.setup(words.join(" "), softWalletPin);
      console.log("[handleSetupSoftWallet] softWallet.setup() result:", success);
      
      if (success) {
        console.log("[handleSetupSoftWallet] Creating wallets for selected chains:", Array.from(softWalletSelectedChains));
        // Create wallets only for selected chains
        await deriveWallets(Array.from(softWalletSelectedChains));
        console.log("[handleSetupSoftWallet] deriveWallets() completed");
        
        setShowHeaderSetupDialog(false);
        // Reset soft wallet wizard state
        setSoftWalletStep("select-chains");
        setSoftWalletGeneratedSeed("");
        setSoftWalletImportSeed("");
        setSoftWalletPin("");
        setSoftWalletConfirmPin("");
        setSoftWalletSeedConfirmed(false);
        setSoftWalletSelectedChains(new Set());
        toast({ title: "Wallet Created", description: "Your soft wallet is ready." });
      } else {
        const errorMsg = softWallet.getState().error;
        console.log("[handleSetupSoftWallet] Setup failed:", errorMsg);
        setSoftWalletError(errorMsg || "Failed to set up wallet.");
      }
    } catch (error: any) {
      console.error("[handleSetupSoftWallet] Exception:", error);
      setSoftWalletError(error.message || "Failed to create wallet.");
    } finally {
      setSoftWalletLoading(false);
    }
  };
  
  const handleHeaderGenerateSeed = () => {
    try {
      let phrase: string;
      if (headerPicoWordCount === 12) {
        const entropy = ethers.randomBytes(16);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      } else {
        const entropy = ethers.randomBytes(32);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      }
      setHeaderPicoGeneratedSeed(phrase);
      setHeaderPicoStep("display");
    } catch (error: any) {
      setHeaderPicoError("Failed to generate seed phrase");
    }
  };

  const handleHeaderCopySeed = async () => {
    try {
      await navigator.clipboard.writeText(headerPicoGeneratedSeed);
      setHeaderPicoCopied(true);
      setTimeout(() => setHeaderPicoCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please manually select and copy", variant: "destructive" });
    }
  };

  const handleHeaderSetupPico = async () => {
    setHeaderPicoError("");
    
    const seedToUse = headerPicoMode === "create" ? headerPicoGeneratedSeed : headerPicoImportSeed;
    const words = seedToUse.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setHeaderPicoError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    if (headerPicoPin.length < 4 || headerPicoPin.length > 6 || !/^\d+$/.test(headerPicoPin)) {
      setHeaderPicoError("PIN must be 4-6 digits.");
      return;
    }
    if (headerPicoPin !== headerPicoConfirmPin) {
      setHeaderPicoError("PINs do not match.");
      return;
    }
    
    setHeaderPicoLoading(true);
    try {
      // Use hardwareWallet.setupWallet which routes correctly for mobile vs desktop
      const success = await hardwareWallet.setupWallet(headerPicoPin, words.join(" "));
      if (success) {
        hardwareWallet.setHasWalletOnDevice(true);
        const unlocked = await unlockWallet(headerPicoPin);
        if (unlocked) {
          // Derive wallets for default chains (ETH, BTC, BNB, TRX)
          const defaultChainIds: string[] = [];
          DEFAULT_CHAINS.forEach((chain, index) => {
            if (['ETH', 'BTC', 'BNB', 'TRX'].includes(chain.symbol)) {
              defaultChainIds.push(`chain-${index}`);
            }
          });
          await deriveWallets(defaultChainIds);
          setShowHeaderPicoSetupDialog(false);
          setHeaderPicoGeneratedSeed("");
          setHeaderPicoImportSeed("");
          setHeaderPicoPin("");
          setHeaderPicoConfirmPin("");
          toast({ title: "Wallet Created", description: "Your hardware wallet is ready." });
        }
      } else {
        setHeaderPicoError("Failed to set up wallet on device.");
      }
    } catch (error: any) {
      setHeaderPicoError(error.message || "Failed to create wallet.");
    } finally {
      setHeaderPicoLoading(false);
    }
  };

  const isWebHIDSupported = hardwareWallet.isWebHIDSupported();

  // For soft wallet mode, show different statuses
  const statusBadge = walletMode === "soft_wallet" ? (
    // Soft wallet mode - no device connection needed
    !isConnected ? (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1.5 text-muted-foreground">
          <Laptop className="h-3 w-3" />
          <span className="hidden sm:inline">Not Set Up</span>
        </Badge>
        <Button size="sm" onClick={handleConnect} data-testid="button-setup-soft-wallet">
          <Shield className="mr-1.5 h-4 w-4" />
          Set Up
        </Button>
      </div>
    ) : !isUnlocked ? (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1.5">
          <Lock className="h-3 w-3" />
          <span className="hidden sm:inline">Locked</span>
        </Badge>
        <Button size="sm" onClick={handleConnect} data-testid="button-unlock-wallet">
          <Unlock className="mr-1.5 h-4 w-4" />
          Unlock
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <Badge className="gap-1.5 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="hidden sm:inline">Active</span>
        </Badge>
        <Button size="sm" variant="ghost" onClick={lockWallet} data-testid="button-lock-wallet">
          <Lock className="h-4 w-4" />
        </Button>
      </div>
    )
  ) : (
    // Hard wallet mode - device connection required
    !isConnected ? (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1.5 text-muted-foreground">
          <Unplug className="h-3 w-3" />
          <span className="hidden sm:inline">No Device</span>
        </Badge>
        <Button size="sm" onClick={handleConnect} data-testid="button-connect-device">
          <Usb className="mr-1.5 h-4 w-4" />
          Connect
        </Button>
      </div>
    ) : !isUnlocked ? (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1.5">
          <Lock className="h-3 w-3" />
          <span className="hidden sm:inline">Locked</span>
        </Badge>
        <Button size="sm" onClick={handleConnect} data-testid="button-unlock-wallet">
          <Unlock className="mr-1.5 h-4 w-4" />
          Unlock
        </Button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <Badge className="gap-1.5 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="hidden sm:inline">{hardwareState.deviceName || "Connected"}</span>
        </Badge>
        <Button size="sm" variant="ghost" onClick={lockWallet} data-testid="button-lock-wallet">
          <Lock className="h-4 w-4" />
        </Button>
      </div>
    )
  );

  return (
    <>
      {statusBadge}
      
      {/* Device Selection Dialog */}
      <Dialog open={showHeaderSetupDialog} onOpenChange={setShowHeaderSetupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {walletMode === "soft_wallet" ? (
                <>
                  {softWalletStep === "select-chains" && "Select Chains"}
                  {softWalletStep === "choose" && "Set Up Recovery Phrase"}
                  {softWalletStep === "display" && "Your Recovery Phrase"}
                  {softWalletStep === "confirm" && "Confirm Backup"}
                  {softWalletStep === "pin" && "Create Your PIN"}
                </>
              ) : "Connect Your Wallet"}
            </DialogTitle>
            <DialogDescription>
              {walletMode === "soft_wallet" ? (
                <>
                  {softWalletStep === "select-chains" && "Choose the blockchain networks for your wallet."}
                  {softWalletStep === "choose" && "Generate a new recovery phrase or import an existing one."}
                  {softWalletStep === "display" && "Write down these words in order and store them safely."}
                  {softWalletStep === "confirm" && "Confirm that you have saved your recovery phrase."}
                  {softWalletStep === "pin" && "Set a PIN to protect your wallet."}
                </>
              ) : "Choose how you want to set up your wallet."}
            </DialogDescription>
          </DialogHeader>
          
          {/* Hard Wallet Mode - Show tabs for device selection */}
          {walletMode === "hard_wallet" && (
            <div className="space-y-4 mt-4">
              {/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? (
                <>
                  <Alert>
                    <Smartphone className="h-4 w-4" />
                    <AlertDescription>
                      USB connection is not available on mobile devices. Use the Mobile Bridge to connect through a desktop computer.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    className="w-full" 
                    onClick={() => {
                      setShowHeaderSetupDialog(false);
                      window.location.href = "/bridge";
                    }}
                    data-testid="button-mobile-bridge"
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    Open Mobile Bridge
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Or use a desktop browser with USB support.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Connect your hardware wallet device via USB.</p>
                  <Button className="w-full" onClick={handleHeaderConnectRaspberryPi} disabled={isLoading} data-testid="button-header-connect-hard-wallet">
                    {isLoading ? "Connecting..." : "Connect Hard Wallet"}
                  </Button>
                </>
              )}
            </div>
          )}
          
          {/* Soft Wallet Mode - Direct wizard flow */}
          {walletMode === "soft_wallet" && (
            <>
              {/* Soft Wallet Wizard - Step 1: Select Chains (FIRST) */}
              {softWalletStep === "select-chains" && (
                <div className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Select the blockchain networks you want to use. You can add more chains later.
                  </p>
                  <ScrollArea className="h-64">
                    <div className="space-y-2 pr-4">
                      {DEFAULT_CHAINS.map((chain, index) => {
                        const chainId = `chain-${index}`;
                        const isSelected = softWalletSelectedChains.has(chainId);
                        return (
                          <div
                            key={chainId}
                            className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                              isSelected 
                                ? "border-primary bg-primary/5" 
                                : "border-border hover:border-muted-foreground/50"
                            }`}
                            onClick={() => {
                              const newSet = new Set(softWalletSelectedChains);
                              if (isSelected) {
                                newSet.delete(chainId);
                              } else {
                                newSet.add(chainId);
                              }
                              setSoftWalletSelectedChains(newSet);
                            }}
                            data-testid={`chain-select-${chain.symbol}`}
                          >
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const newSet = new Set(softWalletSelectedChains);
                                if (checked) {
                                  newSet.add(chainId);
                                } else {
                                  newSet.delete(chainId);
                                }
                                setSoftWalletSelectedChains(newSet);
                              }}
                            />
                            <div className="flex items-center gap-2 flex-1">
                              {getChainIcon(chain.symbol)}
                              <div>
                                <p className="font-medium text-sm">{chain.name}</p>
                                <p className="text-xs text-muted-foreground">{chain.symbol}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{softWalletSelectedChains.size} chain{softWalletSelectedChains.size !== 1 ? 's' : ''} selected</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (softWalletSelectedChains.size === DEFAULT_CHAINS.length) {
                          setSoftWalletSelectedChains(new Set());
                        } else {
                          setSoftWalletSelectedChains(new Set(DEFAULT_CHAINS.map((_, i) => `chain-${i}`)));
                        }
                      }}
                    >
                      {softWalletSelectedChains.size === DEFAULT_CHAINS.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  {softWalletError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{softWalletError}</AlertDescription></Alert>}
                  <Button
                    className="w-full"
                    onClick={handleConfirmChainSelection}
                    disabled={softWalletSelectedChains.size === 0}
                    data-testid="button-confirm-chains"
                  >
                    Continue
                  </Button>
                </div>
              )}

              {/* Soft Wallet Wizard - Step 2: Choose word count */}
              {softWalletStep === "choose" && (
                <div className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">Choose the number of words for your recovery phrase:</p>
                  <div className="flex gap-2">
                    <Button
                      variant={softWalletWordCount === 12 ? "default" : "outline"}
                      onClick={() => setSoftWalletWordCount(12)}
                      className="flex-1"
                      data-testid="button-soft-12-words"
                    >
                      12 Words
                    </Button>
                    <Button
                      variant={softWalletWordCount === 24 ? "default" : "outline"}
                      onClick={() => setSoftWalletWordCount(24)}
                      className="flex-1"
                      data-testid="button-soft-24-words"
                    >
                      24 Words (Recommended)
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSoftWalletStep("select-chains")} className="flex-1" data-testid="button-back-to-chains">
                      Back
                    </Button>
                    <Button className="flex-1" onClick={handleSoftWalletGenerateSeed} data-testid="button-soft-generate-seed">
                      <Shield className="mr-2 h-4 w-4" />Generate
                    </Button>
                  </div>
                </div>
              )}

              {/* Soft Wallet Wizard - Step 2: Display Seed */}
              {softWalletStep === "display" && (
                <div className="space-y-4">
                  <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Write these words down on paper. Never store them digitally or share with anyone.</AlertDescription></Alert>
                  <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-md">
                    {softWalletGeneratedSeed.split(" ").map((word, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-5 text-right">{idx + 1}.</span>
                        <span className="font-mono" data-testid={`soft-word-${idx + 1}`}>{word}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleSoftWalletCopySeed} data-testid="button-soft-copy-seed">
                    {softWalletCopied ? <><Check className="mr-2 h-4 w-4" />Copied!</> : <><Copy className="mr-2 h-4 w-4" />Copy to Clipboard</>}
                  </Button>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="soft-seed-confirmed"
                      checked={softWalletSeedConfirmed}
                      onCheckedChange={(checked) => setSoftWalletSeedConfirmed(checked === true)}
                      data-testid="checkbox-soft-seed-confirmed"
                    />
                    <label htmlFor="soft-seed-confirmed" className="text-sm cursor-pointer">
                      I have written down my recovery phrase and stored it safely
                    </label>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => setSoftWalletStep("confirm")}
                    disabled={!softWalletSeedConfirmed}
                    data-testid="button-soft-continue-to-confirm"
                  >
                    Continue
                  </Button>
                </div>
              )}

              {/* Soft Wallet Wizard - Step 3: Confirm */}
              {softWalletStep === "confirm" && (
                <div className="space-y-4">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Important:</strong> Your recovery phrase is the ONLY way to recover your wallet if you lose access. 
                      If you lose it, your funds will be lost forever. Make sure you have stored it safely before continuing.
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSoftWalletStep("display")} className="flex-1" data-testid="button-soft-go-back">
                      Go Back
                    </Button>
                    <Button onClick={() => setSoftWalletStep("pin")} className="flex-1" data-testid="button-soft-continue-to-pin">
                      I Understand, Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Soft Wallet Wizard - Step 4: PIN */}
              {softWalletStep === "pin" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Create a PIN (5 digits) to protect your wallet. You will need this PIN every time you want to unlock your wallet.</p>
                  <div className="space-y-2">
                    <Label>New PIN (5 digits)</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="Enter PIN"
                      value={softWalletPin}
                      onChange={(e) => { setSoftWalletPin(e.target.value.replace(/\D/g, "")); setSoftWalletError(""); }}
                      data-testid="input-soft-wallet-pin"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="Confirm PIN"
                      value={softWalletConfirmPin}
                      onChange={(e) => { setSoftWalletConfirmPin(e.target.value.replace(/\D/g, "")); setSoftWalletError(""); }}
                      data-testid="input-soft-wallet-confirm-pin"
                    />
                  </div>
                  {softWalletError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{softWalletError}</AlertDescription></Alert>}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSoftWalletStep(softWalletMode === "create" ? "confirm" : "choose")}
                      className="flex-1"
                      data-testid="button-soft-back"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleValidatePinAndCreateWallet}
                      disabled={!softWalletPin || !softWalletConfirmPin || softWalletLoading}
                      className="flex-1"
                      data-testid="button-soft-wallet-create"
                    >
                      {softWalletLoading ? "Creating..." : "Create Wallet"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Pico Wallet Setup Dialog - Multi-step Wizard */}
      <Dialog open={showHeaderPicoSetupDialog} onOpenChange={setShowHeaderPicoSetupDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {headerPicoStep === "choose" && "Set Up New Wallet"}
              {headerPicoStep === "display" && "Your Recovery Phrase"}
              {headerPicoStep === "confirm" && "Confirm Backup"}
              {headerPicoStep === "pin" && "Create Your PIN"}
            </DialogTitle>
            <DialogDescription>
              {headerPicoStep === "choose" && "Create a new wallet or import an existing one"}
              {headerPicoStep === "display" && "Write down these words in order and store them safely"}
              {headerPicoStep === "confirm" && "Confirm that you have saved your recovery phrase"}
              {headerPicoStep === "pin" && "Set a PIN to protect your wallet"}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Choose create or import */}
          {headerPicoStep === "choose" && (
            <div className="space-y-4">
              <Tabs value={headerPicoMode} onValueChange={(v) => setHeaderPicoMode(v as "create" | "import")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="create" data-testid="tab-create-new">
                    <Plus className="mr-2 h-4 w-4" />Create New
                  </TabsTrigger>
                  <TabsTrigger value="import" data-testid="tab-import-existing">
                    <Download className="mr-2 h-4 w-4" />Import Existing
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="create" className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">Generate a new recovery phrase for your wallet. Choose the number of words:</p>
                  <div className="flex gap-2">
                    <Button
                      variant={headerPicoWordCount === 12 ? "default" : "outline"}
                      onClick={() => setHeaderPicoWordCount(12)}
                      className="flex-1"
                      data-testid="button-12-words"
                    >
                      12 Words
                    </Button>
                    <Button
                      variant={headerPicoWordCount === 24 ? "default" : "outline"}
                      onClick={() => setHeaderPicoWordCount(24)}
                      className="flex-1"
                      data-testid="button-24-words"
                    >
                      24 Words (Recommended)
                    </Button>
                  </div>
                  <Button className="w-full" onClick={handleHeaderGenerateSeed} data-testid="button-generate-seed">
                    <Shield className="mr-2 h-4 w-4" />Generate Recovery Phrase
                  </Button>
                </TabsContent>

                <TabsContent value="import" className="space-y-4 mt-4">
                  <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Only import a phrase you trust. Never share it with anyone.</AlertDescription></Alert>
                  <div className="space-y-2">
                    <Label>Recovery Phrase (12 or 24 words)</Label>
                    <textarea
                      className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Enter your recovery phrase, separated by spaces"
                      value={headerPicoImportSeed}
                      onChange={(e) => { setHeaderPicoImportSeed(e.target.value); setHeaderPicoError(""); }}
                      data-testid="input-import-seed"
                    />
                  </div>
                  {headerPicoError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{headerPicoError}</AlertDescription></Alert>}
                  <Button
                    className="w-full"
                    onClick={() => {
                      const words = headerPicoImportSeed.trim().toLowerCase().split(/\s+/);
                      if (words.length !== 12 && words.length !== 24) {
                        setHeaderPicoError("Recovery phrase must be 12 or 24 words.");
                        return;
                      }
                      setHeaderPicoStep("pin");
                    }}
                    disabled={!headerPicoImportSeed.trim()}
                    data-testid="button-continue-import"
                  >
                    Continue to PIN Setup
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Step 2: Display generated seed */}
          {headerPicoStep === "display" && (
            <div className="space-y-4">
              <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Write these words down on paper. Never store them digitally or share with anyone.</AlertDescription></Alert>
              <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-md">
                {headerPicoGeneratedSeed.split(" ").map((word, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-5 text-right">{idx + 1}.</span>
                    <span className="font-mono" data-testid={`word-${idx + 1}`}>{word}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={handleHeaderCopySeed} data-testid="button-copy-seed">
                {headerPicoCopied ? <><Check className="mr-2 h-4 w-4" />Copied!</> : <><Copy className="mr-2 h-4 w-4" />Copy to Clipboard</>}
              </Button>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="seed-confirmed"
                  checked={headerPicoSeedConfirmed}
                  onCheckedChange={(checked) => setHeaderPicoSeedConfirmed(checked === true)}
                  data-testid="checkbox-seed-confirmed"
                />
                <label htmlFor="seed-confirmed" className="text-sm cursor-pointer">
                  I have written down my recovery phrase and stored it safely
                </label>
              </div>
              <Button
                className="w-full"
                onClick={() => setHeaderPicoStep("confirm")}
                disabled={!headerPicoSeedConfirmed}
                data-testid="button-continue-to-confirm"
              >
                Continue
              </Button>
            </div>
          )}

          {/* Step 3: Confirm backup warning */}
          {headerPicoStep === "confirm" && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> Your recovery phrase is the ONLY way to recover your wallet if you lose access. 
                  If you lose it, your funds will be lost forever. Make sure you have stored it safely before continuing.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setHeaderPicoStep("display")} className="flex-1">
                  Go Back
                </Button>
                <Button onClick={() => setHeaderPicoStep("pin")} className="flex-1" data-testid="button-continue-to-pin">
                  I Understand, Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: PIN setup */}
          {headerPicoStep === "pin" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Create a PIN (4-6 digits) to protect your wallet. You will need this PIN every time you want to unlock your wallet.</p>
              <div className="space-y-2">
                <Label>New PIN (4-6 digits)</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter PIN"
                  value={headerPicoPin}
                  onChange={(e) => { setHeaderPicoPin(e.target.value.replace(/\D/g, "")); setHeaderPicoError(""); }}
                  data-testid="input-header-pico-pin"
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Confirm PIN"
                  value={headerPicoConfirmPin}
                  onChange={(e) => { setHeaderPicoConfirmPin(e.target.value.replace(/\D/g, "")); setHeaderPicoError(""); }}
                  data-testid="input-header-pico-confirm-pin"
                />
              </div>
              {headerPicoError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{headerPicoError}</AlertDescription></Alert>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setHeaderPicoStep(headerPicoMode === "create" ? "confirm" : "choose")}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleHeaderSetupPico}
                  disabled={!headerPicoPin || !headerPicoConfirmPin || headerPicoLoading}
                  className="flex-1"
                  data-testid="button-header-setup-pico"
                >
                  {headerPicoLoading ? "Setting up..." : "Create Wallet"}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setShowHeaderPicoSetupDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HardwareStatusCard() {
  const { 
    isConnected, 
    isUnlocked, 
    hardwareState,
    hasWalletOnDevice,
    setShowPinModal, 
    setPinAction, 
    connectLedger,
    connectRaspberryPi,
    connectSimulated,
    unlockWallet,
    deriveWallets,
    isLoading,
    walletMode,
  } = useWallet();
  const { toast } = useToast();
  
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showRecoverDialog, setShowRecoverDialog] = useState(false);
  const [showPicoSetupDialog, setShowPicoSetupDialog] = useState(false);
  const [seedPhraseInput, setSeedPhraseInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [recoverError, setRecoverError] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const [setupTab, setSetupTab] = useState<"hard_wallet" | "soft_wallet">("soft_wallet");
  
  // Soft wallet setup - multi-step wizard state (chain selection is first step)
  const [softWalletStep, setSoftWalletStep] = useState<"select-chains" | "choose" | "display" | "confirm" | "pin">("select-chains");
  const [softWalletSelectedChains, setSoftWalletSelectedChains] = useState<Set<string>>(() => {
    // Pre-select ETH, BTC, BNB, TRX by default
    const defaultSelected = new Set<string>();
    DEFAULT_CHAINS.forEach((chain, index) => {
      if (['ETH', 'BTC', 'BNB', 'TRX'].includes(chain.symbol)) {
        defaultSelected.add(`chain-${index}`);
      }
    });
    return defaultSelected;
  });
  const [softWalletWordCount, setSoftWalletWordCount] = useState<12 | 24>(24);
  const [softWalletGeneratedSeed, setSoftWalletGeneratedSeed] = useState("");
  const [softWalletSeedConfirmed, setSoftWalletSeedConfirmed] = useState(false);
  const [softWalletCopied, setSoftWalletCopied] = useState(false);
  const [softWalletMode, setSoftWalletMode] = useState<"create" | "import">("create");
  const [softWalletImportSeed, setSoftWalletImportSeed] = useState("");
  const [softWalletNewPin, setSoftWalletNewPin] = useState("");
  const [softWalletConfirmPin, setSoftWalletConfirmPin] = useState("");
  const [softWalletError, setSoftWalletError] = useState("");
  const [isSoftWalletLoading, setIsSoftWalletLoading] = useState(false);
  
  // Pico setup dialog - multi-step wizard state
  const [picoStep, setPicoStep] = useState<"choose" | "display" | "confirm" | "pin">("choose");
  const [picoWordCount, setPicoWordCount] = useState<12 | 24>(24);
  const [picoGeneratedSeed, setPicoGeneratedSeed] = useState("");
  const [picoSeedConfirmed, setPicoSeedConfirmed] = useState(false);
  const [picoCopied, setPicoCopied] = useState(false);
  const [picoMode, setPicoMode] = useState<"create" | "import">("create");
  const [picoImportSeed, setPicoImportSeed] = useState("");
  const [picoNewPin, setPicoNewPin] = useState("");
  const [picoConfirmPin, setPicoConfirmPin] = useState("");
  const [picoSetupError, setPicoSetupError] = useState("");
  const [isPicoSetupLoading, setIsPicoSetupLoading] = useState(false);

  const handleAction = () => {
    if (!isConnected) {
      setShowSetupDialog(true);
    } else if (!isUnlocked) {
      setPinAction("unlock");
      setShowPinModal(true);
    }
  };

  const handleConnectLedger = async () => {
    const success = await connectLedger();
    if (success) {
      setShowSetupDialog(false);
      toast({
        title: "Ledger Connected",
        description: "Your Ledger device is now connected. Please enter your PIN to unlock.",
      });
      setPinAction("unlock");
      setShowPinModal(true);
    } else if (hardwareState.error) {
      toast({
        title: "Connection Failed",
        description: hardwareState.error,
        variant: "destructive",
      });
    }
  };

  const handleConnectRaspberryPi = async () => {
    console.log("[HardwareStatusCard] handleConnectRaspberryPi() called");
    const result = await connectRaspberryPi();
    console.log("[HardwareStatusCard] connectRaspberryPi result:", result);
    
    if (result.success) {
      setShowSetupDialog(false);
      
      if (!result.hasWallet) {
        console.log("[HardwareStatusCard] NEW DEVICE DETECTED - showing wallet setup dialog");
        toast({
          title: "Hard Wallet Connected",
          description: "This is a new device. Please set up your wallet.",
        });
        // Reset all Pico wizard state
        setPicoStep("choose");
        setPicoMode("create");
        setPicoWordCount(24);
        setPicoGeneratedSeed("");
        setPicoSeedConfirmed(false);
        setPicoCopied(false);
        setPicoImportSeed("");
        setPicoNewPin("");
        setPicoConfirmPin("");
        setPicoSetupError("");
        setShowPicoSetupDialog(true);
      } else {
        console.log("[HardwareStatusCard] EXISTING WALLET DETECTED - showing PIN unlock");
        toast({
          title: "Hard Wallet Connected",
          description: "Your hardware wallet is now connected. Please enter your PIN to unlock.",
        });
        setPinAction("unlock");
        setShowPinModal(true);
      }
    } else {
      console.log("[HardwareStatusCard] Connection failed:", result.error);
      toast({
        title: "Connection Failed",
        description: result.error || "Failed to connect to hardware wallet",
        variant: "destructive",
      });
    }
  };

  const handleGenerateSeed = () => {
    try {
      let phrase: string;
      if (picoWordCount === 12) {
        const entropy = ethers.randomBytes(16);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      } else {
        const entropy = ethers.randomBytes(32);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      }
      setPicoGeneratedSeed(phrase);
      setPicoStep("display");
    } catch (error: any) {
      setPicoSetupError("Failed to generate seed phrase");
    }
  };

  const handleSoftWalletGenerateSeed = () => {
    try {
      let phrase: string;
      if (softWalletWordCount === 12) {
        const entropy = ethers.randomBytes(16);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      } else {
        const entropy = ethers.randomBytes(32);
        phrase = ethers.Mnemonic.entropyToPhrase(entropy);
      }
      setSoftWalletGeneratedSeed(phrase);
      setSoftWalletStep("display");
    } catch (error: any) {
      setSoftWalletError("Failed to generate seed phrase");
    }
  };

  const handleSoftWalletCopySeed = async () => {
    try {
      await navigator.clipboard.writeText(softWalletGeneratedSeed);
      setSoftWalletCopied(true);
      setTimeout(() => setSoftWalletCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please manually select and copy", variant: "destructive" });
    }
  };

  const handleSetupSoftWallet = async () => {
    console.log("[HardwareStatusCard] handleSetupSoftWallet() called");
    setSoftWalletError("");
    
    const seedToUse = softWalletMode === "create" ? softWalletGeneratedSeed : softWalletImportSeed;
    console.log("[HardwareStatusCard] Mode:", softWalletMode, "Seed length:", seedToUse?.length || 0);
    
    if (!seedToUse || seedToUse.trim().length === 0) {
      setSoftWalletError("No recovery phrase found. Please go back and generate one.");
      return;
    }
    
    const words = seedToUse.trim().toLowerCase().split(/\s+/);
    console.log("[HardwareStatusCard] Word count:", words.length);
    
    if (words.length !== 12 && words.length !== 24) {
      setSoftWalletError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    
    if (softWalletNewPin.length !== 5) {
      setSoftWalletError("PIN must be 5 digits.");
      return;
    }
    
    if (!/^\d+$/.test(softWalletNewPin)) {
      setSoftWalletError("PIN must contain only numbers.");
      return;
    }
    
    if (softWalletNewPin !== softWalletConfirmPin) {
      setSoftWalletError("PINs do not match.");
      return;
    }
    
    setIsSoftWalletLoading(true);
    try {
      console.log("[HardwareStatusCard] Calling softWallet.setup()");
      // Use softWallet.setup() to encrypt and store seed with PIN
      const success = await softWallet.setup(words.join(" "), softWalletNewPin);
      console.log("[HardwareStatusCard] softWallet.setup() result:", success);
      
      if (success) {
        console.log("[HardwareStatusCard] Creating wallets for selected chains:", Array.from(softWalletSelectedChains));
        // softWallet.setup() already unlocks the wallet
        // Only create wallets for the selected chains
        await deriveWallets(Array.from(softWalletSelectedChains));
        console.log("[HardwareStatusCard] deriveWallets() completed");
        
        setShowSetupDialog(false);
        // Reset soft wallet wizard state
        setSoftWalletStep("select-chains");
        setSoftWalletGeneratedSeed("");
        setSoftWalletImportSeed("");
        setSoftWalletNewPin("");
        setSoftWalletConfirmPin("");
        setSoftWalletSeedConfirmed(false);
        
        toast({
          title: "Wallet Created",
          description: "Your soft wallet has been set up successfully.",
        });
      } else {
        const errorMsg = softWallet.getState().error;
        console.log("[HardwareStatusCard] Setup failed:", errorMsg);
        setSoftWalletError(errorMsg || "Failed to set up wallet.");
      }
    } catch (error: any) {
      console.error("[HardwareStatusCard] Exception:", error);
      setSoftWalletError(error.message || "Failed to create wallet.");
    } finally {
      setIsSoftWalletLoading(false);
    }
  };

  const handleCopySeed = async () => {
    try {
      await navigator.clipboard.writeText(picoGeneratedSeed);
      setPicoCopied(true);
      setTimeout(() => setPicoCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please manually select and copy", variant: "destructive" });
    }
  };

  const handleCreateSimulated = async () => {
    setRecoverError("");
    
    const words = seedPhraseInput.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setRecoverError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    
    if (newPin.length < 4 || newPin.length > 6) {
      setRecoverError("PIN must be 4-6 digits.");
      return;
    }
    
    if (!/^\d+$/.test(newPin)) {
      setRecoverError("PIN must contain only numbers.");
      return;
    }
    
    if (newPin !== confirmPin) {
      setRecoverError("PINs do not match.");
      return;
    }
    
    setIsRecovering(true);
    try {
      await hardwareWallet.setPin(newPin);
      const success = await connectSimulated(words.join(" "));
      
      if (success) {
        const unlocked = await unlockWallet(newPin);
        
        if (unlocked) {
          await deriveWallets();
          
          setShowSetupDialog(false);
          setSeedPhraseInput("");
          setNewPin("");
          setConfirmPin("");
          
          toast({
            title: "Wallet Created",
            description: "Your simulated wallet has been set up successfully.",
          });
        }
      } else if (hardwareState.error) {
        setRecoverError(hardwareState.error);
      }
    } catch (error: any) {
      setRecoverError(error.message || "Failed to create wallet.");
    } finally {
      setIsRecovering(false);
    }
  };

  const handleRecover = async () => {
    setRecoverError("");
    console.log("[handleRecover] Starting recovery, walletMode:", walletMode);
    
    const words = seedPhraseInput.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setRecoverError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    
    // Soft wallet requires exactly 5-digit PIN
    if (walletMode === "soft_wallet") {
      if (newPin.length !== 5) {
        setRecoverError("PIN must be exactly 5 digits for soft wallet.");
        return;
      }
    } else {
      if (newPin.length < 4 || newPin.length > 6) {
        setRecoverError("PIN must be 4-6 digits.");
        return;
      }
    }
    
    if (!/^\d+$/.test(newPin)) {
      setRecoverError("PIN must contain only numbers.");
      return;
    }
    
    if (newPin !== confirmPin) {
      setRecoverError("PINs do not match.");
      return;
    }
    
    setIsRecovering(true);
    try {
      if (walletMode === "soft_wallet") {
        console.log("[handleRecover] Using soft wallet import");
        // For soft wallet, use softWallet.setup which handles both seed and PIN
        const success = await softWallet.setup(words.join(" "), newPin);
        console.log("[handleRecover] Soft wallet setup result:", success);
        
        if (success) {
          const unlocked = await unlockWallet(newPin);
          console.log("[handleRecover] Soft wallet unlock result:", unlocked);
          
          if (unlocked) {
            await deriveWallets();
            
            setShowRecoverDialog(false);
            setSeedPhraseInput("");
            setNewPin("");
            setConfirmPin("");
            
            toast({
              title: "Wallet Recovered",
              description: "Your wallet has been successfully restored from the recovery phrase.",
            });
          }
        } else {
          const state = softWallet.getState();
          setRecoverError(state.error || "Failed to import wallet.");
        }
      } else {
        console.log("[handleRecover] Using hardware wallet import");
        await hardwareWallet.setPin(newPin);
        const success = await connectSimulated(words.join(" "));
        console.log("[handleRecover] Hardware wallet connect result:", success);
        
        if (success) {
          const unlocked = await unlockWallet(newPin);
          console.log("[handleRecover] Hardware wallet unlock result:", unlocked);
          
          if (unlocked) {
            await deriveWallets();
            
            setShowRecoverDialog(false);
            setSeedPhraseInput("");
            setNewPin("");
            setConfirmPin("");
            
            toast({
              title: "Wallet Recovered",
              description: "Your wallet has been successfully restored from the recovery phrase.",
            });
          }
        } else if (hardwareState.error) {
          setRecoverError(hardwareState.error);
        }
      }
    } catch (error: any) {
      console.error("[handleRecover] Error:", error);
      setRecoverError(error.message || "Failed to recover wallet.");
    } finally {
      setIsRecovering(false);
    }
  };

  const handleSetupPicoWallet = async () => {
    setPicoSetupError("");
    
    const seedToUse = picoMode === "create" ? picoGeneratedSeed : picoImportSeed;
    const words = seedToUse.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setPicoSetupError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    
    if (picoNewPin.length < 4 || picoNewPin.length > 6) {
      setPicoSetupError("PIN must be 4-6 digits.");
      return;
    }
    
    if (!/^\d+$/.test(picoNewPin)) {
      setPicoSetupError("PIN must contain only numbers.");
      return;
    }
    
    if (picoNewPin !== picoConfirmPin) {
      setPicoSetupError("PINs do not match.");
      return;
    }
    
    setIsPicoSetupLoading(true);
    try {
      // Use hardwareWallet.setupWallet which routes correctly for mobile vs desktop
      const success = await hardwareWallet.setupWallet(picoNewPin, words.join(" "));
      
      if (success) {
        hardwareWallet.setHasWalletOnDevice(true);
        const unlocked = await unlockWallet(picoNewPin);
        
        if (unlocked) {
          // Derive wallets for default chains (ETH, BTC, BNB, TRX)
          const defaultChainIds: string[] = [];
          DEFAULT_CHAINS.forEach((chain, index) => {
            if (['ETH', 'BTC', 'BNB', 'TRX'].includes(chain.symbol)) {
              defaultChainIds.push(`chain-${index}`);
            }
          });
          await deriveWallets(defaultChainIds);
          
          setShowPicoSetupDialog(false);
          setPicoGeneratedSeed("");
          setPicoImportSeed("");
          setPicoNewPin("");
          setPicoConfirmPin("");
          
          toast({
            title: "Wallet Created",
            description: "Your Raspberry Pi wallet has been set up successfully.",
          });
        }
      } else {
        setPicoSetupError("Failed to set up wallet on device.");
      }
    } catch (error: any) {
      setPicoSetupError(error.message || "Failed to create wallet.");
    } finally {
      setIsPicoSetupLoading(false);
    }
  };

  const isWebHIDSupported = hardwareWallet.isWebHIDSupported();

  return (
    <>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-8 text-center">
        {walletMode === "hard_wallet" ? (
          <div className="mb-4 relative h-52 w-40 flex flex-col items-center">
            <div className="relative w-24 h-40 rounded-3xl border-2 border-muted-foreground/30 bg-muted/20">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1.5 rounded-full bg-muted-foreground/20" />
              <div className="absolute inset-2 top-5 bottom-6 rounded-2xl bg-background flex flex-col items-center justify-center p-3 border border-border/50">
                <motion.div
                  className="text-center flex flex-col items-center"
                  animate={{ opacity: [0, 1, 1, 0] }}
                  transition={{
                    duration: 7,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0.10, 0.14, 0.86, 0.90],
                  }}
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <p className="text-[10px] font-bold text-foreground leading-none tracking-tight">VaultKey</p>
                  <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-[7px] font-semibold text-green-600 dark:text-green-400 leading-none">Connected</p>
                  </div>
                </motion.div>
              </div>
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full bg-muted-foreground/15" />
            </div>
            <motion.div
              className="-mt-1"
              animate={{ y: [10, -2, -2, 10] }}
              transition={{
                duration: 7,
                repeat: Infinity,
                ease: "easeInOut",
                times: [0, 0.10, 0.90, 1],
              }}
            >
              <div className="flex flex-col items-center">
                <div className="w-3 h-1.5 bg-muted-foreground/40 rounded-t-sm" />
                <div className="w-8 h-12 bg-primary rounded-lg border-2 border-primary flex flex-col items-center justify-center gap-0.5 shadow-md">
                  <div className="w-4 h-0.5 bg-background/50 rounded-full" />
                  <div className="w-4 h-0.5 bg-background/50 rounded-full" />
                  <Usb className="h-4 w-4 text-background/80 mt-0.5" />
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-10 w-10 text-primary" />
          </div>
        )}
        
        {!isConnected ? (
          <>
            {walletMode === "soft_wallet" && (
              <>
                <h3 className="mb-2 text-lg font-semibold">Set Up Your Soft Wallet</h3>
                <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                  Generate a new recovery phrase to secure your wallet.
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              <Button onClick={handleAction} data-testid="button-setup-wallet">
                {walletMode === "soft_wallet" 
                  ? <Laptop className="mr-2 h-4 w-4" />
                  : <Usb className="mr-2 h-4 w-4" />}
                {walletMode === "soft_wallet" ? "Create Wallet" : "Connect Wallet"}
              </Button>
              {walletMode === "soft_wallet" && (
                <Button variant="outline" onClick={() => setShowRecoverDialog(true)} data-testid="button-recover-wallet">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Recover Wallet
                </Button>
              )}
            </div>
          </>
        ) : !isUnlocked ? (
          <>
            <h3 className="mb-2 text-lg font-semibold">Wallet Locked</h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Enter your PIN to unlock and access your wallet.
            </p>
            <Button onClick={handleAction} data-testid="button-unlock-wallet-card">
              <Unlock className="mr-2 h-4 w-4" />
              Unlock Wallet
            </Button>
          </>
        ) : null}
      </div>

      <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{walletMode === "soft_wallet" ? "Set Up Soft Wallet" : "Connect Your Wallet"}</DialogTitle>
            <DialogDescription>
              {walletMode === "soft_wallet" 
                ? "Generate a new recovery phrase to secure your wallet."
                : "Connect your hardware wallet device via USB."}
            </DialogDescription>
          </DialogHeader>
          
          {/* Hard Wallet Mode - Show connection flow */}
          {walletMode === "hard_wallet" && (
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Connect your hardware wallet device via USB.
              </p>
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                <li>Connect your hardware wallet via USB</li>
                <li>Ensure the wallet software is running</li>
                <li>Click "Connect Hard Wallet" below</li>
              </ol>
              <Button 
                className="w-full" 
                onClick={handleConnectRaspberryPi}
                disabled={isLoading}
                data-testid="button-connect-hard-wallet"
              >
                {isLoading ? "Connecting..." : "Connect Hard Wallet"}
              </Button>
            </div>
          )}
          
          {/* Soft Wallet Mode - Direct wizard flow */}
          {walletMode === "soft_wallet" && (
            <>
              {/* Step 0: Select Chains */}
              {softWalletStep === "select-chains" && (
                <div className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">Select which blockchain networks you want to use:</p>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-2">
                      {DEFAULT_CHAINS.map((chain, index) => {
                        const chainId = `chain-${index}`;
                        const isSelected = softWalletSelectedChains.has(chainId);
                        return (
                          <div
                            key={chainId}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              isSelected ? "border-primary bg-primary/5" : "border-border hover-elevate"
                            }`}
                            onClick={() => {
                              const newSelected = new Set(softWalletSelectedChains);
                              if (isSelected) {
                                newSelected.delete(chainId);
                              } else {
                                newSelected.add(chainId);
                              }
                              setSoftWalletSelectedChains(newSelected);
                            }}
                            data-testid={`chain-select-${chain.symbol}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(softWalletSelectedChains);
                                if (checked) {
                                  newSelected.add(chainId);
                                } else {
                                  newSelected.delete(chainId);
                                }
                                setSoftWalletSelectedChains(newSelected);
                              }}
                            />
                            <div className="flex items-center gap-2 flex-1">
                              {getChainIcon(chain.symbol)}
                              <div>
                                <div className="font-medium">{chain.name}</div>
                                <div className="text-xs text-muted-foreground">{chain.symbol}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">
                      {softWalletSelectedChains.size} chain{softWalletSelectedChains.size !== 1 ? "s" : ""} selected
                    </span>
                    <Button
                      onClick={() => setSoftWalletStep("choose")}
                      disabled={softWalletSelectedChains.size === 0}
                      data-testid="button-continue-to-phrase"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 1: Choose word count */}
              {softWalletStep === "choose" && (
                <div className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">Choose the number of words for your recovery phrase:</p>
                  <div className="flex gap-2">
                    <Button
                      variant={softWalletWordCount === 12 ? "default" : "outline"}
                      onClick={() => setSoftWalletWordCount(12)}
                      className="flex-1"
                      data-testid="button-card-12-words"
                    >
                      12 Words
                    </Button>
                    <Button
                      variant={softWalletWordCount === 24 ? "default" : "outline"}
                      onClick={() => setSoftWalletWordCount(24)}
                      className="flex-1"
                      data-testid="button-card-24-words"
                    >
                      24 Words (Recommended)
                    </Button>
                  </div>
                  <Button className="w-full" onClick={handleSoftWalletGenerateSeed} data-testid="button-card-generate-seed">
                    <Shield className="mr-2 h-4 w-4" />Generate Recovery Phrase
                  </Button>
                </div>
              )}

              {/* Step 2: Display Seed */}
              {softWalletStep === "display" && (
                <div className="space-y-4">
                  <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Write these words down on paper. Never store them digitally or share with anyone.</AlertDescription></Alert>
                  <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-md">
                    {softWalletGeneratedSeed.split(" ").map((word, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-5 text-right">{idx + 1}.</span>
                        <span className="font-mono" data-testid={`card-word-${idx + 1}`}>{word}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleSoftWalletCopySeed} data-testid="button-card-copy-seed">
                    {softWalletCopied ? <><Check className="mr-2 h-4 w-4" />Copied!</> : <><Copy className="mr-2 h-4 w-4" />Copy to Clipboard</>}
                  </Button>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="card-seed-confirmed"
                      checked={softWalletSeedConfirmed}
                      onCheckedChange={(checked) => setSoftWalletSeedConfirmed(checked === true)}
                      data-testid="checkbox-card-seed-confirmed"
                    />
                    <label htmlFor="card-seed-confirmed" className="text-sm cursor-pointer">
                      I have written down my recovery phrase and stored it safely
                    </label>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => setSoftWalletStep("confirm")}
                    disabled={!softWalletSeedConfirmed}
                    data-testid="button-card-continue-to-confirm"
                  >
                    Continue
                  </Button>
                </div>
              )}

              {/* Step 3: Confirm */}
              {softWalletStep === "confirm" && (
                <div className="space-y-4">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Important:</strong> Your recovery phrase is the ONLY way to recover your wallet if you lose access. 
                      If you lose it, your funds will be lost forever. Make sure you have stored it safely before continuing.
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSoftWalletStep("display")} className="flex-1" data-testid="button-card-go-back">
                      Go Back
                    </Button>
                    <Button onClick={() => setSoftWalletStep("pin")} className="flex-1" data-testid="button-card-continue-to-pin">
                      I Understand, Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: PIN */}
              {softWalletStep === "pin" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Create a PIN (5 digits) to protect your wallet. You will need this PIN every time you want to unlock your wallet.</p>
                  <div className="space-y-2">
                    <Label>New PIN (5 digits)</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="Enter PIN"
                      value={softWalletNewPin}
                      onChange={(e) => { setSoftWalletNewPin(e.target.value.replace(/\D/g, "")); setSoftWalletError(""); }}
                      data-testid="input-card-wallet-pin"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="Confirm PIN"
                      value={softWalletConfirmPin}
                      onChange={(e) => { setSoftWalletConfirmPin(e.target.value.replace(/\D/g, "")); setSoftWalletError(""); }}
                      data-testid="input-card-wallet-confirm-pin"
                    />
                  </div>
                  {softWalletError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{softWalletError}</AlertDescription></Alert>}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSoftWalletStep(softWalletMode === "create" ? "confirm" : "choose")}
                      className="flex-1"
                      data-testid="button-card-back"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleSetupSoftWallet}
                      disabled={!softWalletNewPin || !softWalletConfirmPin || isSoftWalletLoading}
                      className="flex-1"
                      data-testid="button-card-wallet-create"
                    >
                      {isSoftWalletLoading ? "Creating..." : "Create Wallet"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showRecoverDialog} onOpenChange={setShowRecoverDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recover Your Wallet</DialogTitle>
            <DialogDescription>
              Enter your 12 or 24 word recovery phrase to restore your wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Only enter your recovery phrase on trusted devices. Never share it with anyone.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label htmlFor="seed-phrase">Recovery Phrase</Label>
              <textarea
                id="seed-phrase"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter your 12 or 24 word recovery phrase, separated by spaces"
                value={seedPhraseInput}
                onChange={(e) => {
                  setSeedPhraseInput(e.target.value);
                  setRecoverError("");
                }}
                data-testid="input-recovery-phrase"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="new-pin">New PIN (5 digits)</Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                maxLength={5}
                placeholder="Enter new PIN"
                value={newPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setNewPin(val);
                  setRecoverError("");
                }}
                data-testid="input-new-pin"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirm-pin">Confirm PIN</Label>
              <Input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={5}
                placeholder="Confirm new PIN"
                value={confirmPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setConfirmPin(val);
                  setRecoverError("");
                }}
                data-testid="input-confirm-pin"
              />
            </div>
            
            {recoverError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{recoverError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecoverDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRecover}
              disabled={!seedPhraseInput.trim() || !newPin || !confirmPin || isRecovering}
              data-testid="button-confirm-recover"
            >
              {isRecovering ? "Recovering..." : "Recover Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pico Wallet Setup Dialog - Multi-step Wizard */}
      <Dialog open={showPicoSetupDialog} onOpenChange={setShowPicoSetupDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {picoStep === "choose" && "Set Up New Wallet"}
              {picoStep === "display" && "Your Recovery Phrase"}
              {picoStep === "confirm" && "Confirm Backup"}
              {picoStep === "pin" && "Create Your PIN"}
            </DialogTitle>
            <DialogDescription>
              {picoStep === "choose" && "Create a new wallet or import an existing one"}
              {picoStep === "display" && "Write down these words in order and store them safely"}
              {picoStep === "confirm" && "Confirm that you have saved your recovery phrase"}
              {picoStep === "pin" && "Set a PIN to protect your wallet"}
            </DialogDescription>
          </DialogHeader>

          {picoStep === "choose" && (
            <div className="space-y-4">
              <Tabs value={picoMode} onValueChange={(v) => setPicoMode(v as "create" | "import")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="create" data-testid="card-tab-create-new">
                    <Plus className="mr-2 h-4 w-4" />Create New
                  </TabsTrigger>
                  <TabsTrigger value="import" data-testid="card-tab-import-existing">
                    <Download className="mr-2 h-4 w-4" />Import Existing
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="create" className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">Generate a new recovery phrase for your wallet. Choose the number of words:</p>
                  <div className="flex gap-2">
                    <Button variant={picoWordCount === 12 ? "default" : "outline"} onClick={() => setPicoWordCount(12)} className="flex-1" data-testid="card-button-12-words">12 Words</Button>
                    <Button variant={picoWordCount === 24 ? "default" : "outline"} onClick={() => setPicoWordCount(24)} className="flex-1" data-testid="card-button-24-words">24 Words (Recommended)</Button>
                  </div>
                  <Button className="w-full" onClick={handleGenerateSeed} data-testid="card-button-generate-seed">
                    <Shield className="mr-2 h-4 w-4" />Generate Recovery Phrase
                  </Button>
                </TabsContent>

                <TabsContent value="import" className="space-y-4 mt-4">
                  <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Only import a phrase you trust. Never share it with anyone.</AlertDescription></Alert>
                  <div className="space-y-2">
                    <Label>Recovery Phrase (12 or 24 words)</Label>
                    <textarea className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Enter your recovery phrase, separated by spaces" value={picoImportSeed} onChange={(e) => { setPicoImportSeed(e.target.value); setPicoSetupError(""); }} data-testid="card-input-import-seed" />
                  </div>
                  {picoSetupError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{picoSetupError}</AlertDescription></Alert>}
                  <Button className="w-full" onClick={() => { const words = picoImportSeed.trim().toLowerCase().split(/\s+/); if (words.length !== 12 && words.length !== 24) { setPicoSetupError("Recovery phrase must be 12 or 24 words."); return; } setPicoStep("pin"); }} disabled={!picoImportSeed.trim()} data-testid="card-button-continue-import">Continue to PIN Setup</Button>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {picoStep === "display" && (
            <div className="space-y-4">
              <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Write these words down on paper. Never store them digitally or share with anyone.</AlertDescription></Alert>
              <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-md">
                {picoGeneratedSeed.split(" ").map((word, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-5 text-right">{idx + 1}.</span>
                    <span className="font-mono" data-testid={`card-word-${idx + 1}`}>{word}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={handleCopySeed} data-testid="card-button-copy-seed">
                {picoCopied ? <><Check className="mr-2 h-4 w-4" />Copied!</> : <><Copy className="mr-2 h-4 w-4" />Copy to Clipboard</>}
              </Button>
              <div className="flex items-center space-x-2">
                <Checkbox id="card-seed-confirmed" checked={picoSeedConfirmed} onCheckedChange={(checked) => setPicoSeedConfirmed(checked === true)} data-testid="card-checkbox-seed-confirmed" />
                <label htmlFor="card-seed-confirmed" className="text-sm cursor-pointer">I have written down my recovery phrase and stored it safely</label>
              </div>
              <Button className="w-full" onClick={() => setPicoStep("confirm")} disabled={!picoSeedConfirmed} data-testid="card-button-continue-to-confirm">Continue</Button>
            </div>
          )}

          {picoStep === "confirm" && (
            <div className="space-y-4">
              <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Important:</strong> Your recovery phrase is the ONLY way to recover your wallet if you lose access. If you lose it, your funds will be lost forever.</AlertDescription></Alert>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPicoStep("display")} className="flex-1">Go Back</Button>
                <Button onClick={() => setPicoStep("pin")} className="flex-1" data-testid="card-button-continue-to-pin">I Understand, Continue</Button>
              </div>
            </div>
          )}

          {picoStep === "pin" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Create a PIN (4-6 digits) to protect your wallet.</p>
              <div className="space-y-2">
                <Label>New PIN (4-6 digits)</Label>
                <Input type="password" inputMode="numeric" maxLength={6} placeholder="Enter PIN" value={picoNewPin} onChange={(e) => { setPicoNewPin(e.target.value.replace(/\D/g, "")); setPicoSetupError(""); }} data-testid="card-input-pico-new-pin" />
              </div>
              <div className="space-y-2">
                <Label>Confirm PIN</Label>
                <Input type="password" inputMode="numeric" maxLength={6} placeholder="Confirm PIN" value={picoConfirmPin} onChange={(e) => { setPicoConfirmPin(e.target.value.replace(/\D/g, "")); setPicoSetupError(""); }} data-testid="card-input-pico-confirm-pin" />
              </div>
              {picoSetupError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{picoSetupError}</AlertDescription></Alert>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPicoStep(picoMode === "create" ? "confirm" : "choose")} className="flex-1">Back</Button>
                <Button onClick={handleSetupPicoWallet} disabled={!picoNewPin || !picoConfirmPin || isPicoSetupLoading} className="flex-1" data-testid="button-setup-pico-wallet">{isPicoSetupLoading ? "Setting up..." : "Create Wallet"}</Button>
              </div>
            </div>
          )}

          <DialogFooter><Button variant="ghost" onClick={() => setShowPicoSetupDialog(false)}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WalletModeSelector() {
  const { 
    isConnected, 
    isUnlocked, 
    hardwareState,
    disconnectDevice,
    setShowPinModal,
    setPinAction,
    connectRaspberryPi,
    connectSimulated,
    unlockWallet,
    deriveWallets,
    isLoading,
    hasSoftWalletSetup,
    walletMode,
    setWalletMode,
  } = useWallet();
  const { toast } = useToast();
  
  const [showModeSwitchDialog, setShowModeSwitchDialog] = useState(false);
  const [targetMode, setTargetMode] = useState<"hard_wallet" | "soft_wallet">("soft_wallet");
  const [showPicoSetupDialog, setShowPicoSetupDialog] = useState(false);
  
  const [seedPhrase, setSeedPhrase] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setupError, setSetupError] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  
  const handleModeSwitch = async (mode: "hard_wallet" | "soft_wallet") => {
    if (mode === walletMode) return;
    setTargetMode(mode);
    setShowModeSwitchDialog(true);
  };
  
  const confirmSwitch = async () => {
    setShowModeSwitchDialog(false);
    await disconnectDevice();
    
    if (targetMode === "hard_wallet") {
      const result = await connectRaspberryPi();
      if (result.success) {
        if (!result.hasWallet) {
          setShowPicoSetupDialog(true);
        } else {
          setPinAction("unlock");
          setShowPinModal(true);
        }
      } else {
        toast({ title: "Connection Failed", description: result.error || "Could not connect to hardware wallet", variant: "destructive" });
      }
    } else {
      // Switching to soft wallet mode
      setWalletMode("soft_wallet");
      
      if (hasSoftWalletSetup) {
        // Soft wallet already exists - show unlock modal
        setPinAction("unlock");
        setShowPinModal(true);
      } else {
        // No soft wallet set up - show setup dialog
        setSeedPhrase("");
        setNewPin("");
        setConfirmPin("");
        setSetupError("");
        setShowPicoSetupDialog(true);
      }
    }
  };
  
  const handleCreateSoftWallet = async () => {
    setSetupError("");
    const words = seedPhrase.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setSetupError("Recovery phrase must be 12 or 24 words.");
      return;
    }
    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      setSetupError("PIN must be 4-6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setSetupError("PINs do not match.");
      return;
    }
    
    setIsSettingUp(true);
    try {
      const { hardwareWallet } = await import("@/lib/hardware-wallet");
      await hardwareWallet.setPin(newPin);
      const success = await connectSimulated(words.join(" "));
      if (success) {
        const unlocked = await unlockWallet(newPin);
        if (unlocked) {
          await deriveWallets();
          setShowPicoSetupDialog(false);
          toast({ title: "Wallet Created", description: "Your soft wallet is ready." });
        }
      }
    } catch (error: any) {
      setSetupError(error.message || "Failed to create wallet.");
    } finally {
      setIsSettingUp(false);
    }
  };

  if (!isConnected || !isUnlocked) return null;

  return (
    <>
      <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/50">
        <Button
          size="sm"
          variant={walletMode === "hard_wallet" ? "default" : "ghost"}
          onClick={() => handleModeSwitch("hard_wallet")}
          className="gap-1.5"
          disabled={isLoading}
          data-testid="button-mode-hard-wallet"
        >
          <Cpu className="h-4 w-4" />
          <span className="hidden sm:inline">Hard Wallet</span>
        </Button>
        <Button
          size="sm"
          variant={walletMode === "soft_wallet" ? "default" : "ghost"}
          onClick={() => handleModeSwitch("soft_wallet")}
          className="gap-1.5"
          disabled={isLoading}
          data-testid="button-mode-soft-wallet"
        >
          <Laptop className="h-4 w-4" />
          <span className="hidden sm:inline">Soft Wallet</span>
        </Button>
      </div>
      
      <Dialog open={showModeSwitchDialog} onOpenChange={setShowModeSwitchDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Switch Wallet Mode</DialogTitle>
            <DialogDescription>
              Switching to {targetMode === "hard_wallet" ? "Hard Wallet" : "Soft Wallet"} will disconnect your current wallet. You'll need to set up or unlock the new wallet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModeSwitchDialog(false)}>Cancel</Button>
            <Button onClick={confirmSwitch} data-testid="button-confirm-switch">Switch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showPicoSetupDialog && targetMode === "soft_wallet"} onOpenChange={setShowPicoSetupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Up Soft Wallet</DialogTitle>
            <DialogDescription>Enter a seed phrase to create your soft wallet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert><Shield className="h-4 w-4" /><AlertDescription>For testing only. Enter a seed phrase to simulate a hardware wallet.</AlertDescription></Alert>
            <div className="space-y-2">
              <Label>Seed Phrase (12 or 24 words)</Label>
              <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Enter your seed phrase separated by spaces" value={seedPhrase} onChange={(e) => { setSeedPhrase(e.target.value); setSetupError(""); }} data-testid="input-mode-seed-phrase" />
            </div>
            <div className="space-y-2">
              <Label>New PIN (5 digits)</Label>
              <Input type="password" inputMode="numeric" maxLength={5} placeholder="Enter PIN" value={newPin} onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, "")); setSetupError(""); }} data-testid="input-mode-new-pin" />
            </div>
            <div className="space-y-2">
              <Label>Confirm PIN</Label>
              <Input type="password" inputMode="numeric" maxLength={5} placeholder="Confirm PIN" value={confirmPin} onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "")); setSetupError(""); }} data-testid="input-mode-confirm-pin" />
            </div>
            {setupError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{setupError}</AlertDescription></Alert>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowPicoSetupDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateSoftWallet} disabled={!seedPhrase.trim() || !newPin || !confirmPin || isSettingUp} data-testid="button-create-soft-wallet">
              {isSettingUp ? "Creating..." : "Create Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
