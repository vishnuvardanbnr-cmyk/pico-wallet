import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Copy, ExternalLink, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_CHAINS } from "@shared/schema";

export default function TransactionDetail() {
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const txHash = params.get("hash");
  const chainId = params.get("chain");
  const type = params.get("type") as "send" | "receive";
  const amount = params.get("amount");
  const tokenSymbol = params.get("token");
  const fromAddress = params.get("from");
  const toAddress = params.get("to");
  const timestamp = params.get("time");
  const status = params.get("status") as "confirmed" | "pending" | "failed";

  const chainIndex = chainId ? parseInt(chainId.replace("chain-", "")) : 0;
  const chain = DEFAULT_CHAINS[chainIndex];
  const blockExplorer = chain?.blockExplorer || "https://etherscan.io";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard` });
  };

  const formatAddress = (addr: string | null) => {
    if (!addr) return "Unknown";
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  const formatDate = (ts: string | null) => {
    if (!ts) return "Unknown";
    const date = new Date(ts);
    return date.toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getStatusIcon = () => {
    switch (status) {
      case "confirmed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "pending":
        return <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "confirmed":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "failed":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.history.back()}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Transaction Details</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center py-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            type === "receive" ? "bg-green-500/10" : "bg-red-500/10"
          }`}>
            {type === "receive" ? (
              <ArrowDownLeft className="w-8 h-8 text-green-500" />
            ) : (
              <ArrowUpRight className="w-8 h-8 text-red-500" />
            )}
          </div>
          
          <h2 className={`text-2xl font-bold ${
            type === "receive" ? "text-green-500" : "text-red-500"
          }`} data-testid="text-amount">
            {type === "receive" ? "+" : "-"}{amount} {tokenSymbol}
          </h2>
          
          <p className="text-muted-foreground capitalize mt-1" data-testid="text-type">
            {type === "receive" ? "Received" : "Sent"}
          </p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className={getStatusColor()}>
                <span className="flex items-center gap-1.5">
                  {getStatusIcon()}
                  <span className="capitalize">{status || "Unknown"}</span>
                </span>
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="text-sm" data-testid="text-date">{formatDate(timestamp)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Network</span>
              <span data-testid="text-network">{chain?.name || "Unknown"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <span className="text-muted-foreground text-sm">From</span>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-sm" data-testid="text-from">{formatAddress(fromAddress)}</span>
                {fromAddress && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(fromAddress, "Address")}
                    data-testid="button-copy-from"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <span className="text-muted-foreground text-sm">To</span>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-sm" data-testid="text-to">{formatAddress(toAddress)}</span>
                {toAddress && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(toAddress, "Address")}
                    data-testid="button-copy-to"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div>
              <span className="text-muted-foreground text-sm">Transaction Hash</span>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-sm truncate flex-1 mr-2" data-testid="text-hash">
                  {txHash ? `${txHash.slice(0, 16)}...${txHash.slice(-12)}` : "Unknown"}
                </span>
                <div className="flex gap-1">
                  {txHash && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(txHash, "Transaction hash")}
                        data-testid="button-copy-hash"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(`${blockExplorer}/tx/${txHash}`, "_blank")}
                        data-testid="button-explorer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.open(`${blockExplorer}/tx/${txHash}`, "_blank")}
          data-testid="button-view-explorer"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View on Block Explorer
        </Button>
      </div>
    </div>
  );
}
