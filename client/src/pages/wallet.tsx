import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getWalletAddresses, formatAddress, copyToClipboard } from "@/lib/crypto-utils";
import { Copy, Check, ArrowLeft, Wallet } from "lucide-react";
import { Link } from "wouter";
import { SiBitcoin, SiEthereum, SiLitecoin, SiDogecoin } from "react-icons/si";

function getCryptoIcon(iconName: string, color: string) {
  const iconProps = { className: "w-6 h-6", style: { color } };
  
  switch (iconName) {
    case "bitcoin":
      return <SiBitcoin {...iconProps} />;
    case "ethereum":
      return <SiEthereum {...iconProps} />;
    case "litecoin":
      return <SiLitecoin {...iconProps} />;
    case "dogecoin":
      return <SiDogecoin {...iconProps} />;
    case "bitcoincash":
      return <SiBitcoin {...iconProps} />;
    case "xrp":
      return <Wallet {...iconProps} />;
    default:
      return <Wallet {...iconProps} />;
  }
}

export default function WalletPage() {
  const { toast } = useToast();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const addresses = getWalletAddresses();

  const handleCopy = async (address: string, chainName: string) => {
    const success = await copyToClipboard(address);
    if (success) {
      setCopiedAddress(address);
      toast({
        title: "Address Copied",
        description: `${chainName} address copied to clipboard`,
      });
      setTimeout(() => setCopiedAddress(null), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground" data-testid="text-page-title">
              Your Addresses
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Native addresses for all enabled coins
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {addresses.map((walletAddress) => (
            <Card 
              key={walletAddress.chainId} 
              className="overflow-visible"
              data-testid={`card-address-${walletAddress.chainId}`}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                <div className="flex items-center gap-3">
                  {getCryptoIcon(walletAddress.chain.icon, walletAddress.chain.color)}
                  <div>
                    <CardTitle className="text-base font-semibold">
                      {walletAddress.chain.name}
                    </CardTitle>
                    <Badge variant="secondary" className="mt-1">
                      {walletAddress.chain.symbol}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(walletAddress.address, walletAddress.chain.name)}
                  data-testid={`button-copy-${walletAddress.chainId}`}
                >
                  {copiedAddress === walletAddress.address ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                <div 
                  className="font-mono text-sm text-muted-foreground bg-muted/50 rounded-md p-3 break-all"
                  data-testid={`text-address-${walletAddress.chainId}`}
                >
                  {walletAddress.address}
                </div>
                <p 
                  className="text-xs text-muted-foreground mt-2 sm:hidden"
                  data-testid={`text-address-short-${walletAddress.chainId}`}
                >
                  {formatAddress(walletAddress.address, 12, 8)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {addresses.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No coins enabled</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
