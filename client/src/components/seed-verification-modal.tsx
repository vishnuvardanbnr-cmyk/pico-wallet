import { useState, useCallback } from "react";
import { Shield, AlertTriangle, Loader2, Edit2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";

interface SeedVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SeedVerificationModal({ open, onOpenChange }: SeedVerificationModalProps) {
  const { 
    pendingAddChain, 
    verifySeedForAddChain, 
    confirmAddChain, 
    abortAddChain,
    getSeedWordCount,
  } = useWallet();
  const { toast } = useToast();
  
  const [seedPhrase, setSeedPhrase] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");

  const wordCount = getSeedWordCount();
  const expectedWords = wordCount || 12;

  const handleClose = useCallback(() => {
    setSeedPhrase("");
    setCustomLabel("");
    setError("");
    setAttempts(0);
    abortAddChain();
    onOpenChange(false);
  }, [abortAddChain, onOpenChange]);

  const handleVerify = async () => {
    if (!seedPhrase.trim()) {
      setError("Please enter your recovery phrase");
      return;
    }

    const inputWords = seedPhrase.trim().split(/\s+/);
    if (inputWords.length !== expectedWords) {
      setError(`Please enter all ${expectedWords} words of your recovery phrase`);
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const isValid = await verifySeedForAddChain(seedPhrase);
      
      if (isValid) {
        const success = await confirmAddChain(customLabel.trim() || undefined);
        if (success) {
          toast({
            title: "Network Added",
            description: `${pendingAddChain?.chainName || "Network"} wallet has been created.`,
          });
          setSeedPhrase("");
          setCustomLabel("");
          setAttempts(0);
          onOpenChange(false);
        } else {
          setError("Failed to create wallet. Please try again.");
        }
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        
        if (newAttempts >= 3) {
          setError("Too many failed attempts. Please close and try again later.");
        } else {
          setError(`Incorrect recovery phrase. ${3 - newAttempts} attempts remaining.`);
        }
      }
    } catch (err) {
      setError("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!pendingAddChain) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleClose();
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Security Verification
          </DialogTitle>
          <DialogDescription>
            To add {pendingAddChain.chainName} to your wallet, please verify ownership by entering your recovery phrase.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              This security check ensures only you can add new networks to your wallet. Your recovery phrase is never stored or transmitted.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seed-phrase">
              Recovery Phrase ({expectedWords} words)
            </Label>
            <Textarea
              id="seed-phrase"
              placeholder={`Enter your ${expectedWords}-word recovery phrase...`}
              value={seedPhrase}
              onChange={(e) => {
                setSeedPhrase(e.target.value);
                setError("");
              }}
              className="min-h-[100px] font-mono text-sm"
              disabled={isVerifying || attempts >= 3}
              data-testid="input-seed-verification"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wallet-label" className="flex items-center gap-1">
              <Edit2 className="h-3 w-3" />
              Wallet Name (Optional)
            </Label>
            <Input
              id="wallet-label"
              placeholder={pendingAddChain.chainName}
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              disabled={isVerifying || attempts >= 3}
              data-testid="input-wallet-label"
            />
            <p className="text-xs text-muted-foreground">
              Give this wallet a custom name to easily identify it
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isVerifying}>
            Cancel
          </Button>
          <Button 
            onClick={handleVerify} 
            disabled={isVerifying || attempts >= 3 || !seedPhrase.trim()}
            data-testid="button-verify-seed"
          >
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Add Network"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
