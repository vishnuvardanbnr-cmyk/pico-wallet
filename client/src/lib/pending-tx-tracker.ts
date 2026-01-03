import { ethers } from "ethers";

export interface PendingTransaction {
  id: string;
  txHash: string;
  chainId: string;
  evmChainId?: number;
  tokenSymbol: string;
  amount: string;
  toAddress: string;
  fromAddress: string;
  timestamp: string;
  status: "pending" | "confirming" | "confirmed" | "failed";
  currentConfirmations: number;
  requiredConfirmations: number;
}

const RPC_ENDPOINTS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon-rpc.com",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  42161: "https://arb1.arbitrum.io/rpc",
};

const REQUIRED_CONFIRMATIONS: Record<number, number> = {
  1: 12,
  56: 15,
  137: 128,
  43114: 12,
  42161: 12,
};

type Listener = (transactions: PendingTransaction[]) => void;

class PendingTransactionTracker {
  private transactions: Map<string, PendingTransaction> = new Map();
  private listeners: Set<Listener> = new Set();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  addTransaction(tx: Omit<PendingTransaction, "status" | "currentConfirmations" | "requiredConfirmations">): void {
    const pendingTx: PendingTransaction = {
      ...tx,
      status: "pending",
      currentConfirmations: 0,
      requiredConfirmations: tx.evmChainId ? (REQUIRED_CONFIRMATIONS[tx.evmChainId] || 12) : 12,
    };

    this.transactions.set(tx.id, pendingTx);
    this.notifyListeners();
    this.startPolling(tx.id);
  }

  private async startPolling(txId: string): Promise<void> {
    const tx = this.transactions.get(txId);
    if (!tx || !tx.evmChainId) return;

    const rpcUrl = RPC_ENDPOINTS[tx.evmChainId];
    if (!rpcUrl) {
      this.updateTransaction(txId, { status: "confirmed" });
      return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    let failedAttempts = 0;
    const maxAttempts = 60;

    const poll = async () => {
      try {
        const receipt = await provider.getTransactionReceipt(tx.txHash);
        
        if (receipt) {
          if (receipt.status === 0) {
            this.updateTransaction(txId, { status: "failed" });
            this.stopPolling(txId);
            setTimeout(() => {
              this.removeTransaction(txId);
            }, 10000);
            return;
          }
          
          const currentBlock = await provider.getBlockNumber();
          const confirmations = currentBlock - receipt.blockNumber + 1;
          
          const updatedTx = this.transactions.get(txId);
          if (!updatedTx) return;

          if (confirmations >= updatedTx.requiredConfirmations) {
            this.updateTransaction(txId, {
              status: "confirmed",
              currentConfirmations: confirmations,
            });
            this.stopPolling(txId);
            
            setTimeout(() => {
              this.removeTransaction(txId);
            }, 5000);
            return;
          } else {
            this.updateTransaction(txId, {
              status: "confirming",
              currentConfirmations: confirmations,
            });
          }
        } else {
          failedAttempts++;
          if (failedAttempts >= maxAttempts) {
            this.updateTransaction(txId, { status: "failed" });
            this.stopPolling(txId);
            return;
          }
        }
      } catch (error) {
        console.error("Error polling transaction:", error);
        failedAttempts++;
        if (failedAttempts >= maxAttempts) {
          this.updateTransaction(txId, { status: "failed" });
          this.stopPolling(txId);
        }
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    this.pollingIntervals.set(txId, interval);
  }

  private stopPolling(txId: string): void {
    const interval = this.pollingIntervals.get(txId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(txId);
    }
  }

  private updateTransaction(txId: string, updates: Partial<PendingTransaction>): void {
    const tx = this.transactions.get(txId);
    if (tx) {
      this.transactions.set(txId, { ...tx, ...updates });
      this.notifyListeners();
    }
  }

  removeTransaction(txId: string): void {
    this.stopPolling(txId);
    this.transactions.delete(txId);
    this.notifyListeners();
  }

  getTransactions(): PendingTransaction[] {
    return Array.from(this.transactions.values());
  }

  getTransactionsForChain(chainId: string): PendingTransaction[] {
    return this.getTransactions().filter(tx => tx.chainId === chainId);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getTransactions());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const txs = this.getTransactions();
    this.listeners.forEach(listener => listener(txs));
  }

  clear(): void {
    this.pollingIntervals.forEach((_, txId) => this.stopPolling(txId));
    this.transactions.clear();
    this.notifyListeners();
  }
}

export const pendingTxTracker = new PendingTransactionTracker();
