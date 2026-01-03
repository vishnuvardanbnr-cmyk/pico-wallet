import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Shield, Lock, ArrowRight, Delete, X, AlertTriangle, RotateCcw } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { hardwareWallet } from "@/lib/hardware-wallet";
import { softWallet, PRIMARY_WALLET_GROUP } from "@/lib/soft-wallet";
import { piWallet } from "@/lib/pi-wallet";
import { clientStorage, type StoredTransaction } from "@/lib/client-storage";
import { 
  buildTransaction, 
  broadcastTransaction, 
  getChainSymbol, 
  isChainSupported,
  getTokenContract,
  getChainInfo,
  type TransactionParams 
} from "@/lib/transaction-service";
import { 
  broadcastNonEvmTransaction,
  type NonEvmTransactionParams 
} from "@/lib/non-evm-chains";
import { clearExplorerCache } from "@/lib/explorer-service";
import { pendingTxTracker } from "@/lib/pending-tx-tracker";

export function PinModal() {
  const { 
    showPinModal, 
    setShowPinModal, 
    pinAction, 
    setPinAction,
    hardwareState,
    walletMode,
    unlockWallet,
    unlockWalletGroup,
    lockWalletGroup,
    pendingWalletGroupId,
    setPendingWalletGroupId,
    pendingWalletAccess,
    setPendingWalletAccess,
    deriveWallets,
    pendingTransaction,
    setPendingTransaction,
    disconnectDevice,
    refreshBalances,
  } = useWallet();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [pinLength, setPinLength] = useState(walletMode === "soft_wallet" ? 5 : 6);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // Track if signing was successful - used to prevent locking wallet group on success
  const [signingSuccessful, setSigningSuccessful] = useState(false);

  const maxLength = pinLength;

  // Sync PIN length when wallet mode changes - soft wallet always uses 5 digits
  useEffect(() => {
    if (walletMode === "soft_wallet") {
      setPinLength(5);
    }
  }, [walletMode]);

  useEffect(() => {
    if (showPinModal) {
      setPin("");
      setConfirmPin("");
      setStep("enter");
      setError("");
      setIsLoading(false);
      // Reset PIN length based on wallet mode when modal opens
      if (walletMode === "soft_wallet") {
        setPinLength(5);
      }
    }
  }, [showPinModal, walletMode]);

  useEffect(() => {
    if (!showPinModal) {
      setPin("");
      setConfirmPin("");
      setError("");
      setIsLoading(false);
      // Lock wallet group ONLY if signing was NOT successful (i.e., user cancelled or error occurred)
      // After successful signing, keep the session alive until timeout for follow-up transactions
      if (pendingWalletGroupId && !signingSuccessful) {
        // lockWalletGroup also clears pendingWalletGroupId
        lockWalletGroup(pendingWalletGroupId);
      } else if (pendingWalletGroupId) {
        // On success, session stays alive but we still need to clear the pending context
        // (This is also done in the success handlers, but we ensure it here for safety)
        setPendingWalletGroupId(null);
      }
      // Reset signingSuccessful for next modal open
      setSigningSuccessful(false);
    }
  }, [showPinModal, pendingWalletGroupId, signingSuccessful, lockWalletGroup, setPendingWalletGroupId]);

  const handleNumberClick = useCallback((num: string) => {
    setError("");
    if (step === "enter" && pin.length < maxLength) {
      setPin((prev) => prev + num);
    } else if (step === "confirm" && confirmPin.length < maxLength) {
      setConfirmPin((prev) => prev + num);
    }
  }, [step, pin.length, confirmPin.length, maxLength]);

  const handleDelete = useCallback(() => {
    if (step === "enter") {
      setPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
    setError("");
  }, [step]);

  const handleClear = useCallback(() => {
    if (step === "enter") {
      setPin("");
    } else {
      setConfirmPin("");
    }
    setError("");
  }, [step]);

  const handleSubmit = useCallback(async () => {
    // Handle sign action for both wallet modes
    if (pinAction === "sign" && pendingTransaction) {
      if (pin.length < 4) {
        setError("PIN must be at least 4 digits");
        return;
      }

      setIsLoading(true);
      try {
        // For hard wallet, unlock first
        if (walletMode === "hard_wallet") {
          const success = await unlockWallet(pin);
          if (!success) {
            setError("Incorrect PIN. Please try again.");
            setPin("");
            setIsLoading(false);
            return;
          }
        }

        const chainSupport = isChainSupported(pendingTransaction.chainId);
        
        if (!chainSupport.supported) {
          toast({
            title: "Chain Not Supported",
            description: chainSupport.reason || "This chain is not yet supported for transactions",
            variant: "destructive",
          });
          setPendingTransaction(null);
          setShowPinModal(false);
          setPinAction(null);
          setIsLoading(false);
          return;
        }

        // Use fromAddress from pendingTransaction (already known from wallet selection)
        const walletAddress = pendingTransaction.fromAddress;
        if (!walletAddress) {
          toast({
            title: "Wallet Error",
            description: "Could not determine wallet address",
            variant: "destructive",
          });
          setPendingTransaction(null);
          setShowPinModal(false);
          setPinAction(null);
          setIsLoading(false);
          return;
        }

        // Determine wallet group for one-shot signing (only needed for soft wallet)
        const walletGroupId = pendingTransaction.walletGroupId || PRIMARY_WALLET_GROUP;
        const chainSymbol = getChainSymbol(pendingTransaction.chainId);
        const isNonEvmChain = chainSupport.type === "bitcoin" || chainSupport.type === "solana" || chainSupport.type === "tron";
        
        if (isNonEvmChain) {
          const nonEvmParams: NonEvmTransactionParams = {
            chainType: chainSupport.type as "bitcoin" | "solana" | "tron",
            from: walletAddress,
            to: pendingTransaction.toAddress,
            amount: pendingTransaction.amount,
            isNativeToken: pendingTransaction.isNativeToken ?? true,
          };

          let signedResult: { chainType: "bitcoin" | "solana" | "tron"; signedTx: string; txHash?: string } | null = null;
          
          if (walletMode === "soft_wallet") {
             signedResult = await softWallet.signNonEvmTransactionWithPin(nonEvmParams, walletGroupId, pin);
          } else {
             // Hard wallet
             const result = await hardwareWallet.signNonEvmTransaction(nonEvmParams);
             if (result) {
                 signedResult = {
                     chainType: nonEvmParams.chainType,
                     signedTx: result.signedTx,
                     txHash: result.txHash
                 };
             }
          }
          
          if (!signedResult) {
            toast({
              title: "Signing Failed",
              description: "Could not sign the transaction. Please check your PIN.",
              variant: "destructive",
            });
            setError("Invalid PIN or signing failed");
            setPin("");
            setIsLoading(false);
            return;
          }

          const broadcastResult = await broadcastNonEvmTransaction(signedResult.chainType, signedResult.signedTx);
          
          if (broadcastResult.success) {
            const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const storedTx: StoredTransaction = {
              id: txId,
              walletId: pendingTransaction.chainId,
              chainId: pendingTransaction.chainId,
              type: "send",
              status: "confirmed",
              amount: pendingTransaction.amount,
              tokenSymbol: pendingTransaction.tokenSymbol || chainSymbol,
              toAddress: pendingTransaction.toAddress,
              fromAddress: walletAddress,
              txHash: broadcastResult.txHash || signedResult.txHash,
              timestamp: new Date().toISOString(),
            };
            await clientStorage.saveTransaction(storedTx);
            
            toast({
              title: "Transaction Sent",
              description: `Transaction broadcast successfully. Hash: ${(broadcastResult.txHash || signedResult.txHash)?.slice(0, 10)}...`,
            });
            
            setSigningSuccessful(true);
            setPendingWalletGroupId(null);
            clearExplorerCache();
            refreshBalances();
            
            const tokenId = pendingTransaction.isNativeToken ? "native" : (pendingTransaction.tokenSymbol || "native");
            setLocation(`/wallet/${pendingTransaction.chainId}/token/${tokenId}`);
          } else {
            toast({
              title: "Broadcast Failed",
              description: broadcastResult.error || "Failed to broadcast transaction",
              variant: "destructive",
            });
            refreshBalances();
          }
        } else {
          // EVM chain - build and sign transaction
          let tokenContract: { address: string; decimals: number } | null = null;
          if (!pendingTransaction.isNativeToken && pendingTransaction.tokenSymbol) {
            const contractInfo = getTokenContract(pendingTransaction.tokenSymbol, pendingTransaction.chainId);
            if (contractInfo) {
              tokenContract = { address: contractInfo.address, decimals: contractInfo.decimals };
            } else if (pendingTransaction.tokenContractAddress) {
              tokenContract = { address: pendingTransaction.tokenContractAddress, decimals: 18 };
            }
          }

          const txParams: TransactionParams = {
            chainId: pendingTransaction.chainId,
            from: walletAddress,
            to: pendingTransaction.toAddress,
            amount: pendingTransaction.amount,
            tokenSymbol: pendingTransaction.tokenSymbol,
            tokenContractAddress: tokenContract?.address || pendingTransaction.tokenContractAddress,
            isNativeToken: pendingTransaction.isNativeToken ?? true,
            decimals: tokenContract?.decimals,
          };

          const txResult = await buildTransaction(txParams);
          
          if (!txResult) {
            toast({
              title: "Transaction Build Failed",
              description: "Could not build transaction. Please try again.",
              variant: "destructive",
            });
            setPendingTransaction(null);
            setShowPinModal(false);
            setPinAction(null);
            setIsLoading(false);
            return;
          }

          if (!txResult.tx) {
            toast({
              title: "Transaction Error",
              description: "Could not build transaction data. Please try again.",
              variant: "destructive",
            });
            setPendingTransaction(null);
            setShowPinModal(false);
            setPinAction(null);
            setIsLoading(false);
            return;
          }

          let signedTx: string | null = null;
          
          if (walletMode === "soft_wallet") {
              signedTx = await softWallet.signTransactionWithPin(txResult.tx, walletGroupId, pin);
          } else {
              signedTx = await hardwareWallet.signTransaction(txResult.tx);
          }
          
          if (!signedTx) {
            toast({
              title: "Signing Failed",
              description: "Could not sign the transaction. Please check your PIN.",
              variant: "destructive",
            });
            setError("Invalid PIN or signing failed");
            setPin("");
            setIsLoading(false);
            return;
          }

          const result = await broadcastTransaction(signedTx, txResult.chainType, txResult.evmChainId);
          
          if (result.success) {
            const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const storedTx: StoredTransaction = {
              id: txId,
              walletId: pendingTransaction.chainId,
              chainId: pendingTransaction.chainId,
              type: "send",
              status: "confirmed",
              amount: pendingTransaction.amount,
              tokenSymbol: pendingTransaction.tokenSymbol || chainSymbol,
              toAddress: pendingTransaction.toAddress,
              fromAddress: walletAddress,
              txHash: result.txHash,
              timestamp: new Date().toISOString(),
            };
            await clientStorage.saveTransaction(storedTx);
            
            const chainInfo = getChainInfo(pendingTransaction.chainId);
            pendingTxTracker.addTransaction({
              id: txId,
              txHash: result.txHash || '',
              chainId: pendingTransaction.chainId,
              evmChainId: chainInfo?.evmChainId,
              tokenSymbol: pendingTransaction.tokenSymbol || chainSymbol,
              amount: pendingTransaction.amount,
              toAddress: pendingTransaction.toAddress,
              fromAddress: walletAddress,
              timestamp: new Date().toISOString(),
            });
            
            toast({
              title: "Transaction Sent",
              description: `Transaction broadcast successfully. Hash: ${result.txHash?.slice(0, 10)}...`,
            });
            
            setSigningSuccessful(true);
            setPendingWalletGroupId(null);
            clearExplorerCache();
            refreshBalances();
            
            const tokenId = pendingTransaction.isNativeToken ? "native" : (pendingTransaction.tokenSymbol || "native");
            setLocation(`/wallet/${pendingTransaction.chainId}/token/${tokenId}`);
          } else {
            toast({
              title: "Broadcast Failed",
              description: result.error || "Failed to broadcast transaction",
              variant: "destructive",
            });
            refreshBalances();
          }
        }
        
        // Transaction completed, close modal
        setPendingTransaction(null);
        setShowPinModal(false);
        setPinAction(null);
      } catch (err: any) {
        setError(err.message || "Transaction failed. Please try again.");
        setPin("");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Handle access action (for accessing/viewing wallet details)
    if (pinAction === "access") {
      if (pin.length < 4) {
        setError("PIN must be at least 4 digits");
        return;
      }

      setIsLoading(true);
      try {
        const groupId = pendingWalletGroupId || PRIMARY_WALLET_GROUP;
        const success = await unlockWalletGroup(groupId, pin);
        
        if (success) {
          toast({
            title: "Wallet Unlocked",
            description: "You can now view your wallet.",
            duration: 2000,
          });
          
          // Store callback and groupId before cleanup
          const accessCallback = pendingWalletAccess?.callback;
          const groupToLock = groupId;
          
          // Clean up modal state first
          setPendingWalletAccess(null);
          setPendingWalletGroupId(null);
          setShowPinModal(false);
          setPinAction(null);
          
          // Execute callback after modal cleanup, then immediately lock the group
          // This ensures PIN is required every time a wallet is accessed
          if (accessCallback) {
            // Small delay to ensure modal is fully closed before navigation
            setTimeout(() => {
              accessCallback();
              // Lock the wallet group immediately after access so next access requires PIN
              lockWalletGroup(groupToLock);
            }, 50);
          } else {
            // No callback, still lock the group
            lockWalletGroup(groupToLock);
          }
        } else {
          setError("Incorrect PIN. Please try again.");
          setPin("");
        }
      } catch (err: any) {
        setError(err.message || "Verification failed. Please try again.");
        setPin("");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Handle unlock action (for viewing wallet)
    if (pinAction === "unlock") {
      if (pin.length < 4) {
        setError("PIN must be at least 4 digits");
        return;
      }

      setIsLoading(true);
      try {
        let success: boolean;
        
        if (pendingWalletGroupId) {
          success = await unlockWalletGroup(pendingWalletGroupId, pin);
        } else {
          success = await unlockWallet(pin);
        }
        
        if (success) {
          if (!pendingWalletGroupId) {
            await deriveWallets();
          }
          
          toast({
            title: "Wallet Unlocked",
            description: "You can now access your wallet.",
            duration: 2000,
          });
          
          setShowPinModal(false);
          setPinAction(null);
        } else {
          setError("Incorrect PIN. Please try again.");
          setPin("");
        }
      } catch (err: any) {
        setError(err.message || "Verification failed. Please try again.");
        setPin("");
      } finally {
        setIsLoading(false);
      }
    }
  }, [pinAction, pin, unlockWallet, unlockWalletGroup, pendingWalletGroupId, setPendingWalletGroupId, pendingWalletAccess, setPendingWalletAccess, deriveWallets, pendingTransaction, setPendingTransaction, setShowPinModal, setPinAction, toast, refreshBalances, walletMode, setLocation]);

  useEffect(() => {
    if (showPinModal && (pinAction === "unlock" || pinAction === "sign" || pinAction === "access") && pin.length === maxLength && !isLoading && pin !== "") {
      const timer = setTimeout(() => {
        if (pin.length === maxLength) {
          handleSubmit();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pin, maxLength, pinAction, handleSubmit, showPinModal, isLoading]);

  const getTitle = () => {
    if (pinAction === "sign") return "Sign Transaction";
    if (pinAction === "access") return "Access Wallet";
    return "Enter Your PIN";
  };

  const getDescription = () => {
    if (pinAction === "sign") return "Enter your PIN to authorize this transaction";
    if (pinAction === "access") return "Enter your PIN to view this wallet";
    return "Enter your PIN to unlock your wallet";
  };

  const handleResetDevice = async () => {
    setIsResetting(true);
    try {
      const success = await piWallet.factoryReset();
      if (success) {
        await disconnectDevice();
        setShowPinModal(false);
        setPinAction(null);
        toast({
          title: "Device Reset",
          description: "Your device has been reset. Reconnect to set up a new wallet.",
        });
      } else {
        toast({
          title: "Reset Not Supported",
          description: "Your device firmware doesn't support remote reset. Please reflash the firmware to reset.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Reset Failed",
        description: "Could not reset device. Please reflash the firmware manually.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const currentPin = step === "enter" ? pin : confirmPin;

  return (
    <Dialog open={showPinModal} onOpenChange={(open) => {
      if (!open && !isLoading) {
        setPin("");
        setConfirmPin("");
        setStep("enter");
        setError("");
        setShowPinModal(false);
        setPinAction(null);
        setPendingTransaction(null);
      }
    }}>
      <DialogContent className="sm:max-w-md" data-testid="pin-modal">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {pinAction === "sign" ? (
              <ArrowRight className="h-8 w-8 text-primary" />
            ) : (
              <Lock className="h-8 w-8 text-primary" />
            )}
          </div>
          <DialogTitle className="text-xl font-semibold">{getTitle()}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        {walletMode === "hard_wallet" && hardwareState.deviceName && (
          <div className="text-center text-sm text-muted-foreground">
            Device: {hardwareState.deviceName}
          </div>
        )}
        {walletMode === "soft_wallet" && (
          <div className="text-center text-sm text-muted-foreground">
            Soft Wallet
          </div>
        )}

        {walletMode === "hard_wallet" && (
          <div className="flex justify-center gap-2 py-2">
            {[4, 5, 6].map((len) => (
              <Button
                key={len}
                variant={pinLength === len ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setPinLength(len);
                  setPin("");
                }}
                data-testid={`button-pin-length-${len}`}
              >
                {len} digits
              </Button>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-3 py-6">
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all ${
                i < currentPin.length
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30 bg-muted/30"
              }`}
              data-testid={`pin-dot-${i}`}
            >
              {i < currentPin.length && (
                <div className="h-3 w-3 rounded-full bg-primary-foreground" />
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-center text-sm text-destructive" data-testid="pin-error">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 px-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <Button
              key={num}
              variant="outline"
              className="h-14 text-xl font-semibold"
              onClick={() => handleNumberClick(num.toString())}
              disabled={isLoading}
              data-testid={`button-pin-${num}`}
            >
              {num}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="h-14"
            onClick={handleClear}
            disabled={isLoading}
            data-testid="button-pin-clear"
          >
            <X className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            className="h-14 text-xl font-semibold"
            onClick={() => handleNumberClick("0")}
            disabled={isLoading}
            data-testid="button-pin-0"
          >
            0
          </Button>
          <Button
            variant="ghost"
            className="h-14"
            onClick={handleDelete}
            disabled={isLoading}
            data-testid="button-pin-delete"
          >
            <Delete className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span>Secured by hardware encryption</span>
        </div>

        {walletMode === "hard_wallet" && hardwareState.type === "raspberry_pi" && (
          <div className="mt-2 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Existing wallet detected on device
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              disabled={isLoading || isResetting}
              className="text-destructive"
              data-testid="button-reset-device"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Forgot PIN? Reset Device
            </Button>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent data-testid="reset-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reset Device?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will attempt to erase all wallet data from your device. Your funds will be lost forever unless you have backed up your recovery phrase. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting} data-testid="button-reset-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetDevice}
              disabled={isResetting}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-reset-confirm"
            >
              {isResetting ? "Resetting..." : "Yes, Reset Device"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
