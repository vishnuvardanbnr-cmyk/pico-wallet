import { useState, useMemo, useEffect } from "react";
import { Mnemonic, HDNodeWallet } from "ethers";
import { QRCodeSVG } from "qrcode.react";
import { 
  Shield, 
  Lock, 
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
  Clock,
  Smartphone,
  Trash2,
  CheckCircle,
  Sun,
  Moon,
  Palette,
  Link2,
  QrCode,
  X,
  Check,
  Unlink,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
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
import { useWallet } from "@/lib/wallet-context";
import { useTheme } from "@/lib/theme-context";
import { useToast } from "@/hooks/use-toast";
import { HardwareStatusCard } from "@/components/hardware-status";
import { hardwareWallet } from "@/lib/hardware-wallet";
import { softWallet } from "@/lib/soft-wallet";
import { clientStorage } from "@/lib/client-storage";
import { walletConnectService, type SessionProposal, type DAppSession } from "@/lib/walletconnect-service";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Settings() {
  const { isUnlocked, hardwareState, walletMode, setShowPinModal, setPinAction, lockWallet, disconnectDevice, wallets } = useWallet();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // WalletConnect state
  const [showWcDialog, setShowWcDialog] = useState(false);
  const [wcUri, setWcUri] = useState("");
  const [wcConnecting, setWcConnecting] = useState(false);
  const [wcSessions, setWcSessions] = useState<DAppSession[]>([]);
  const [pendingProposal, setPendingProposal] = useState<SessionProposal | null>(null);
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string>("");
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  // Get EVM wallets for WalletConnect
  const evmWallets = useMemo(() => {
    return wallets.filter(w => 
      ["ethereum", "bsc", "polygon", "arbitrum", "avalanche"].includes(w.chainId)
    );
  }, [wallets]);

  // Initialize WalletConnect and load sessions
  useEffect(() => {
    const initWC = async () => {
      try {
        await walletConnectService.init();
        setWcSessions(walletConnectService.getSessions());
      } catch (err) {
        console.error("WalletConnect init error:", err);
      }
    };
    initWC();

    // Listen for session proposals
    const unsubProposal = walletConnectService.onSessionProposal((proposal) => {
      setPendingProposal(proposal);
      setShowWcDialog(false);
      setShowWalletSelector(true);
    });

    // Listen for session updates
    const unsubUpdate = walletConnectService.onSessionUpdate(() => {
      setWcSessions(walletConnectService.getSessions());
    });

    return () => {
      unsubProposal();
      unsubUpdate();
    };
  }, []);
  
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [seedPhraseConfirmed, setSeedPhraseConfirmed] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetPinError, setResetPinError] = useState("");
  const currentTimeoutMs = hardwareWallet.getSessionTimeoutMs();
  const [autoLockTime, setAutoLockTime] = useState(() => {
    if (currentTimeoutMs >= 30 * 60 * 1000) return "30";
    if (currentTimeoutMs >= 15 * 60 * 1000) return "15";
    if (currentTimeoutMs >= 5 * 60 * 1000) return "5";
    if (currentTimeoutMs >= 1 * 60 * 1000) return "1";
    return "5";
  });

  const handleAutoLockChange = (value: string) => {
    setAutoLockTime(value);
    if (value === "never") {
      hardwareWallet.setSessionTimeoutMs(24 * 60 * 60 * 1000); // 24 hours
    } else {
      hardwareWallet.setSessionTimeoutMs(parseInt(value) * 60 * 1000);
    }
    toast({
      title: "Auto-Lock Updated",
      description: value === "never" ? "Auto-lock disabled" : `Wallet will lock after ${value} minute${value === "1" ? "" : "s"} of inactivity`,
    });
  };
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifyWordIndexes, setVerifyWordIndexes] = useState<number[]>([]);
  const [verifyInputs, setVerifyInputs] = useState<string[]>(["", "", ""]);
  const [verifyError, setVerifyError] = useState("");
  const [backupVerified, setBackupVerified] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKeyConfirmed, setPrivateKeyConfirmed] = useState(false);
  const [showPinVerifyDialog, setShowPinVerifyDialog] = useState(false);
  const [pinVerifyFor, setPinVerifyFor] = useState<"seed" | "privateKey" | null>(null);
  const [verifyPin, setVerifyPin] = useState("");
  const [pinVerifyError, setPinVerifyError] = useState("");
  const [isPinVerifying, setIsPinVerifying] = useState(false);

  // Get seed phrase from soft wallet
  const seedPhrase: string = walletMode === "soft_wallet" ? (softWallet.getSeedPhrase() || "") : "";
  const seedWords: string[] = useMemo(() => seedPhrase ? seedPhrase.split(" ") : [], [seedPhrase]);
  
  // Get private key from seed phrase (for EVM chains)
  const privateKey: string = useMemo(() => {
    if (walletMode === "soft_wallet" && showPrivateKey && seedPhrase) {
      try {
        const mnemonic = Mnemonic.fromPhrase(seedPhrase);
        const hdNode = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
        return hdNode.privateKey;
      } catch {
        return "";
      }
    }
    return "";
  }, [walletMode, showPrivateKey, seedPhrase]);

  const handleChangePin = () => {
    toast({
      title: "Change PIN",
      description: "This feature will be available in the next update.",
    });
  };

  const handleShowSeedPhrase = () => {
    if (!seedPhraseConfirmed) {
      setSeedPhraseConfirmed(true);
      return;
    }
    // Show PIN verification dialog
    setPinVerifyFor("seed");
    setVerifyPin("");
    setPinVerifyError("");
    setShowPinVerifyDialog(true);
  };

  const handleShowPrivateKey = () => {
    if (!privateKeyConfirmed) {
      setPrivateKeyConfirmed(true);
      return;
    }
    // Show PIN verification dialog
    setPinVerifyFor("privateKey");
    setVerifyPin("");
    setPinVerifyError("");
    setShowPinVerifyDialog(true);
  };

  const handlePinVerify = async () => {
    if (!verifyPin || verifyPin.length < 4) {
      setPinVerifyError("Please enter your PIN");
      return;
    }

    setIsPinVerifying(true);
    try {
      let unlocked = false;
      if (walletMode === "soft_wallet") {
        unlocked = await softWallet.unlock(verifyPin);
      } else {
        unlocked = await hardwareWallet.unlock(verifyPin);
      }

      if (!unlocked) {
        setPinVerifyError("Incorrect PIN. Please try again.");
        setIsPinVerifying(false);
        return;
      }

      // PIN verified - show the sensitive data
      if (pinVerifyFor === "seed") {
        setShowSeedPhrase(true);
      } else if (pinVerifyFor === "privateKey") {
        setShowPrivateKey(true);
      }

      setShowPinVerifyDialog(false);
      setVerifyPin("");
      setPinVerifyFor(null);
    } catch (err: any) {
      setPinVerifyError(err.message || "Failed to verify PIN");
    } finally {
      setIsPinVerifying(false);
    }
  };

  // WalletConnect handlers
  const handleWcConnect = async () => {
    if (!wcUri.trim()) {
      toast({
        title: "Error",
        description: "Please enter a WalletConnect URI",
        variant: "destructive",
      });
      return;
    }

    setWcConnecting(true);
    try {
      await walletConnectService.pair(wcUri.trim());
      setWcUri("");
      toast({
        title: "Connecting",
        description: "Waiting for DApp to respond...",
        duration: 2000,
      });
    } catch (err: any) {
      toast({
        title: "Connection Failed",
        description: err.message || "Failed to connect",
        variant: "destructive",
      });
    } finally {
      setWcConnecting(false);
    }
  };

  const handleApproveSession = async () => {
    if (!pendingProposal || !selectedWalletAddress) {
      toast({
        title: "Error",
        description: "Please select a wallet",
        variant: "destructive",
      });
      return;
    }

    try {
      await walletConnectService.approveSession(
        pendingProposal.rawProposal,
        [selectedWalletAddress]
      );
      setWcSessions(walletConnectService.getSessions());
      setPendingProposal(null);
      setShowWalletSelector(false);
      setSelectedWalletAddress("");
      toast({
        title: "Connected",
        description: `Connected to ${pendingProposal.proposer.name}`,
        duration: 2000,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to approve session",
        variant: "destructive",
      });
    }
  };

  const handleRejectSession = async () => {
    if (pendingProposal) {
      try {
        await walletConnectService.rejectSession(pendingProposal.id);
      } catch (err) {
        console.error("Reject session error:", err);
      }
    }
    setPendingProposal(null);
    setShowWalletSelector(false);
    setSelectedWalletAddress("");
  };

  const handleDisconnectSession = async (topic: string) => {
    try {
      await walletConnectService.disconnectSession(topic);
      setWcSessions(walletConnectService.getSessions());
      toast({
        title: "Disconnected",
        description: "Session disconnected",
        duration: 2000,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to disconnect",
        variant: "destructive",
      });
    }
  };

  const handleResetWallet = async () => {
    if (!resetPin || resetPin.length < 4) {
      setResetPinError("Please enter your PIN to confirm deletion");
      return;
    }
    
    try {
      let unlocked = false;
      
      if (walletMode === "soft_wallet") {
        unlocked = await softWallet.unlock(resetPin);
      } else {
        unlocked = await hardwareWallet.unlock(resetPin);
      }
      
      if (!unlocked) {
        setResetPinError("Incorrect PIN. Please try again.");
        return;
      }
    } catch (err: any) {
      setResetPinError(err.message || "Failed to verify PIN");
      return;
    }
    
    if (walletMode === "soft_wallet") {
      await clientStorage.clearSoftWallet();
      await clientStorage.clearEncryptedSeed();
      await clientStorage.clearAllWalletSeeds();
      softWallet.lock();
    } else {
      await clientStorage.clearHardWallet();
      await disconnectDevice();
    }
    
    setShowResetDialog(false);
    setResetPin("");
    setResetPinError("");
    toast({
      title: "Wallet Deleted",
      description: "Your wallet has been deleted. Please set up a new wallet.",
    });
    
    window.location.reload();
  };

  const startVerifyBackup = () => {
    const indexes: number[] = [];
    while (indexes.length < 3) {
      const idx = Math.floor(Math.random() * seedWords.length);
      if (!indexes.includes(idx)) {
        indexes.push(idx);
      }
    }
    indexes.sort((a, b) => a - b);
    setVerifyWordIndexes(indexes);
    setVerifyInputs(["", "", ""]);
    setVerifyError("");
    setShowVerifyDialog(true);
  };

  const handleVerifySubmit = () => {
    const isCorrect = verifyWordIndexes.every((wordIndex, i) => 
      verifyInputs[i].trim().toLowerCase() === seedWords[wordIndex].toLowerCase()
    );
    
    if (isCorrect) {
      setBackupVerified(true);
      setShowVerifyDialog(false);
      toast({
        title: "Backup Verified",
        description: "Your recovery phrase backup has been confirmed.",
      });
    } else {
      setVerifyError("One or more words are incorrect. Please try again.");
    }
  };

  if (!isUnlocked) {
    return (
      <div className="p-4 md:p-6 pb-8">
        <h1 className="mb-6 text-2xl md:text-3xl font-bold">Settings</h1>
        <HardwareStatusCard />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-8">
      <div className="mb-5 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
      </div>

      <div className="space-y-4 md:space-y-5 max-w-2xl mx-auto">
        {/* Wallet Info Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <div className="p-2 rounded-lg bg-primary/10">
                <Smartphone className="h-4 w-4 text-primary" />
              </div>
              Wallet Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">{hardwareState.deviceName || "VaultKey Wallet"}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Type</span>
              <Badge variant="secondary" className="text-xs">
                {walletMode === "soft_wallet" ? "Soft Wallet" : "Hard Wallet"}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
                {hardwareState.status === "unlocked" ? "Unlocked" : "Connected"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Appearance Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <div className="p-2 rounded-lg bg-primary/10">
                <Palette className="h-4 w-4 text-primary" />
              </div>
              Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-full bg-muted">
                  {theme === "dark" ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Dark Mode</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {theme === "dark" ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                data-testid="switch-dark-mode"
              />
            </div>
          </CardContent>
        </Card>


        {/* Security section - Hidden for soft wallet */}
        {walletMode !== "soft_wallet" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Lock className="h-4 w-4 text-primary" />
                </div>
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Change PIN</p>
                  <p className="text-xs text-muted-foreground">Update security PIN</p>
                </div>
                <Button size="sm" variant="outline" onClick={handleChangePin} data-testid="button-change-pin">
                  <Key className="mr-2 h-4 w-4" />
                  Change
                </Button>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Auto-Lock</p>
                  <p className="text-xs text-muted-foreground">Lock after inactivity</p>
                </div>
                <Select value={autoLockTime} onValueChange={handleAutoLockChange}>
                  <SelectTrigger className="w-[120px]" data-testid="select-auto-lock">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 min</SelectItem>
                    <SelectItem value="5">5 mins</SelectItem>
                    <SelectItem value="15">15 mins</SelectItem>
                    <SelectItem value="30">30 mins</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Lock Now</p>
                  <p className="text-xs text-muted-foreground">Require PIN again</p>
                </div>
                <Button size="sm" variant="outline" onClick={lockWallet} data-testid="button-lock-now">
                  <Lock className="mr-2 h-4 w-4" />
                  Lock
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Danger Zone - Hidden for soft wallet */}
        {walletMode !== "soft_wallet" && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </div>
                <span className="text-destructive">Danger Zone</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Delete Wallet</p>
                  <p className="text-xs text-muted-foreground">
                    Remove all data. Requires PIN.
                  </p>
                </div>
                <Button 
                  size="sm"
                  variant="destructive" 
                  onClick={() => setShowResetDialog(true)}
                  data-testid="button-delete-wallet"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showResetDialog} onOpenChange={(open) => {
        setShowResetDialog(open);
        if (!open) {
          setResetPin("");
          setResetPinError("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Wallet?</DialogTitle>
            <DialogDescription>
              This will remove all wallet data from this device. You will need your recovery phrase to restore your wallet.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This action cannot be undone. Make sure you have saved your recovery phrase before proceeding.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="reset-pin">Enter your PIN to confirm</Label>
            <Input
              id="reset-pin"
              type="password"
              placeholder="Enter PIN"
              value={resetPin}
              onChange={(e) => {
                setResetPin(e.target.value);
                setResetPinError("");
              }}
              maxLength={6}
              data-testid="input-reset-pin"
            />
            {resetPinError && (
              <p className="text-sm text-destructive">{resetPinError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleResetWallet} 
              disabled={!resetPin}
              data-testid="button-confirm-reset"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Your Backup</DialogTitle>
            <DialogDescription>
              Enter the following words from your recovery phrase to confirm you have backed it up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {verifyWordIndexes.map((wordIndex, i) => (
              <div key={wordIndex} className="space-y-2">
                <Label htmlFor={`verify-word-${i}`}>Word #{wordIndex + 1}</Label>
                <Input
                  id={`verify-word-${i}`}
                  placeholder={`Enter word #${wordIndex + 1}`}
                  value={verifyInputs[i]}
                  onChange={(e) => {
                    const newInputs = [...verifyInputs];
                    newInputs[i] = e.target.value;
                    setVerifyInputs(newInputs);
                    setVerifyError("");
                  }}
                  data-testid={`input-verify-word-${i}`}
                />
              </div>
            ))}
            {verifyError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{verifyError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleVerifySubmit}
              disabled={verifyInputs.some(input => !input.trim())}
              data-testid="button-confirm-verify"
            >
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIN Verification Dialog */}
      <Dialog open={showPinVerifyDialog} onOpenChange={(open) => {
        setShowPinVerifyDialog(open);
        if (!open) {
          setVerifyPin("");
          setPinVerifyError("");
          setPinVerifyFor(null);
        }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Enter PIN
            </DialogTitle>
            <DialogDescription>
              {pinVerifyFor === "seed" 
                ? "Enter your PIN to view recovery phrase" 
                : "Enter your PIN to view private key"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter your PIN"
              value={verifyPin}
              onChange={(e) => {
                setVerifyPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                setPinVerifyError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handlePinVerify()}
              className="text-center text-xl tracking-widest"
              maxLength={6}
              data-testid="input-verify-pin"
            />
            {pinVerifyError && (
              <p className="text-sm text-destructive text-center">{pinVerifyError}</p>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowPinVerifyDialog(false)}
              disabled={isPinVerifying}
            >
              Cancel
            </Button>
            <Button 
              onClick={handlePinVerify}
              disabled={!verifyPin || verifyPin.length < 4 || isPinVerifying}
              data-testid="button-verify-pin"
            >
              {isPinVerifying ? "Verifying..." : "Verify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WalletConnect URI Dialog */}
      <Dialog open={showWcDialog} onOpenChange={(open) => {
        setShowWcDialog(open);
        if (!open) {
          setWcUri("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              WalletConnect
            </DialogTitle>
            <DialogDescription>
              Paste the WalletConnect URI from your DApp to connect
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wc-uri">Connection URI</Label>
              <Input
                id="wc-uri"
                placeholder="wc:..."
                value={wcUri}
                onChange={(e) => setWcUri(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleWcConnect()}
                data-testid="input-wc-uri"
              />
              <p className="text-xs text-muted-foreground">
                Copy the WalletConnect URI from the DApp and paste it here
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowWcDialog(false)}
              disabled={wcConnecting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleWcConnect}
              disabled={!wcUri.trim() || wcConnecting}
              data-testid="button-wc-connect"
            >
              {wcConnecting ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet Selector Dialog for Session Proposal */}
      <Dialog open={showWalletSelector} onOpenChange={(open) => {
        if (!open) handleRejectSession();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Connection Request
            </DialogTitle>
            <DialogDescription>
              {pendingProposal?.proposer.name} wants to connect to your wallet
            </DialogDescription>
          </DialogHeader>
          
          {pendingProposal && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {pendingProposal.proposer.icons[0] && (
                  <img 
                    src={pendingProposal.proposer.icons[0]} 
                    alt={pendingProposal.proposer.name}
                    className="h-12 w-12 rounded-full"
                  />
                )}
                <div>
                  <p className="font-medium">{pendingProposal.proposer.name}</p>
                  <p className="text-sm text-muted-foreground">{pendingProposal.proposer.url}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select Wallet</Label>
                {evmWallets.length > 0 ? (
                  <RadioGroup
                    value={selectedWalletAddress}
                    onValueChange={setSelectedWalletAddress}
                  >
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2 pr-4">
                        {evmWallets.map((wallet) => (
                          <div
                            key={wallet.address}
                            className="flex items-center space-x-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                            onClick={() => setSelectedWalletAddress(wallet.address)}
                          >
                            <RadioGroupItem 
                              value={wallet.address} 
                              id={wallet.address}
                            />
                            <Label 
                              htmlFor={wallet.address} 
                              className="flex-1 cursor-pointer"
                            >
                              <p className="font-medium">{wallet.label || wallet.chainId}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                              </p>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </RadioGroup>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No EVM wallets available. Please set up your wallet first.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleRejectSession}
            >
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button 
              onClick={handleApproveSession}
              disabled={!selectedWalletAddress}
              data-testid="button-approve-session"
            >
              <Check className="mr-2 h-4 w-4" />
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
