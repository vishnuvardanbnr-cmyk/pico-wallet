import { Core } from "@walletconnect/core";
import { Web3Wallet, type Web3WalletTypes, type IWeb3Wallet } from "@walletconnect/web3wallet";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import type { SessionTypes, SignClientTypes } from "@walletconnect/types";
import { ethers } from "ethers";
import { hardwareWallet } from "./hardware-wallet";

const PROJECT_ID = "59ef03ea6a2c984a562c685b4bb055c8";

export interface DAppSession {
  topic: string;
  name: string;
  url: string;
  icon?: string;
  chains: string[];
  accounts: string[];
  expiry: number;
}

export interface PendingRequest {
  id: number;
  topic: string;
  method: string;
  params: any;
  chainId: string;
  dappName: string;
  dappIcon?: string;
}

export interface SessionProposal {
  id: number;
  proposer: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  requiredChains: string[];
  optionalChains: string[];
  requiredMethods: string[];
  optionalMethods: string[];
  rawProposal: Web3WalletTypes.SessionProposal;
}

type SessionRequestHandler = (request: PendingRequest) => void;
type SessionProposalHandler = (proposal: SessionProposal) => void;
type SessionUpdateHandler = () => void;

class WalletConnectService {
  private web3wallet: IWeb3Wallet | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private sessionRequestHandlers: SessionRequestHandler[] = [];
  private sessionProposalHandlers: SessionProposalHandler[] = [];
  private sessionUpdateHandlers: SessionUpdateHandler[] = [];

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    try {
      const core = new Core({
        projectId: PROJECT_ID,
      });

      this.web3wallet = await Web3Wallet.init({
        core,
        metadata: {
          name: "Vault Key",
          description: "Secure Hardware Wallet",
          url: "https://vaultkey.app",
          icons: ["https://vaultkey.app/icon.png"],
        },
      });

      this.setupEventListeners();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize WalletConnect:", error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.web3wallet) return;

    this.web3wallet.on("session_proposal", this.handleSessionProposal.bind(this));
    this.web3wallet.on("session_request", this.handleSessionRequest.bind(this));
    this.web3wallet.on("session_delete", () => {
      this.notifySessionUpdate();
    });
  }

  private async handleSessionProposal(proposal: Web3WalletTypes.SessionProposal): Promise<void> {
    const { requiredNamespaces, optionalNamespaces } = proposal.params;
    
    const extractChains = (namespaces: Record<string, any> | undefined): string[] => {
      if (!namespaces) return [];
      return Object.values(namespaces).flatMap((ns: any) => ns.chains || []);
    };
    
    const extractMethods = (namespaces: Record<string, any> | undefined): string[] => {
      if (!namespaces) return [];
      return Object.values(namespaces).flatMap((ns: any) => ns.methods || []);
    };

    const sessionProposal: SessionProposal = {
      id: proposal.id,
      proposer: {
        name: proposal.params.proposer.metadata.name,
        description: proposal.params.proposer.metadata.description,
        url: proposal.params.proposer.metadata.url,
        icons: proposal.params.proposer.metadata.icons,
      },
      requiredChains: extractChains(requiredNamespaces),
      optionalChains: extractChains(optionalNamespaces),
      requiredMethods: extractMethods(requiredNamespaces),
      optionalMethods: extractMethods(optionalNamespaces),
      rawProposal: proposal,
    };

    this.sessionProposalHandlers.forEach(handler => handler(sessionProposal));
  }

  private async handleSessionRequest(event: Web3WalletTypes.SessionRequest): Promise<void> {
    const { topic, params, id } = event;
    const { request, chainId } = params;
    
    const session = this.web3wallet?.engine.signClient.session.get(topic);
    const dappName = session?.peer.metadata.name || "Unknown DApp";
    const dappIcon = session?.peer.metadata.icons?.[0];

    const pendingRequest: PendingRequest = {
      id,
      topic,
      method: request.method,
      params: request.params,
      chainId,
      dappName,
      dappIcon,
    };

    this.sessionRequestHandlers.forEach(handler => handler(pendingRequest));
  }

  private notifySessionUpdate(): void {
    this.sessionUpdateHandlers.forEach(handler => handler());
  }

  onSessionRequest(handler: SessionRequestHandler): () => void {
    this.sessionRequestHandlers.push(handler);
    return () => {
      const index = this.sessionRequestHandlers.indexOf(handler);
      if (index > -1) this.sessionRequestHandlers.splice(index, 1);
    };
  }

  onSessionProposal(handler: SessionProposalHandler): () => void {
    this.sessionProposalHandlers.push(handler);
    return () => {
      const index = this.sessionProposalHandlers.indexOf(handler);
      if (index > -1) this.sessionProposalHandlers.splice(index, 1);
    };
  }

  onSessionUpdate(handler: SessionUpdateHandler): () => void {
    this.sessionUpdateHandlers.push(handler);
    return () => {
      const index = this.sessionUpdateHandlers.indexOf(handler);
      if (index > -1) this.sessionUpdateHandlers.splice(index, 1);
    };
  }

  async pair(uri: string): Promise<void> {
    if (!this.web3wallet) {
      await this.init();
    }
    await this.web3wallet!.core.pairing.pair({ uri });
  }

  async approveSession(
    proposal: Web3WalletTypes.SessionProposal,
    accounts: string[],
    chainIds: number[] = [1, 56, 137, 43114, 42161]
  ): Promise<SessionTypes.Struct> {
    if (!this.web3wallet) throw new Error("WalletConnect not initialized");

    const chains = chainIds.map(id => `eip155:${id}`);
    const formattedAccounts: string[] = [];
    for (const account of accounts) {
      for (const chainId of chainIds) {
        formattedAccounts.push(`eip155:${chainId}:${account}`);
      }
    }

    const namespaces = buildApprovedNamespaces({
      proposal: proposal.params,
      supportedNamespaces: {
        eip155: {
          chains,
          methods: [
            "eth_sendTransaction",
            "eth_signTransaction", 
            "eth_sign",
            "personal_sign",
            "eth_signTypedData",
            "eth_signTypedData_v4",
          ],
          events: ["chainChanged", "accountsChanged"],
          accounts: formattedAccounts,
        },
      },
    });

    const session = await this.web3wallet.approveSession({
      id: proposal.id,
      namespaces,
    });

    this.notifySessionUpdate();
    return session;
  }

  async rejectSession(proposalId: number): Promise<void> {
    if (!this.web3wallet) throw new Error("WalletConnect not initialized");

    await this.web3wallet.rejectSession({
      id: proposalId,
      reason: getSdkError("USER_REJECTED"),
    });
  }

  async approveRequest(topic: string, id: number, result: any): Promise<void> {
    if (!this.web3wallet) throw new Error("WalletConnect not initialized");

    await this.web3wallet.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: "2.0",
        result,
      },
    });
  }

  async rejectRequest(topic: string, id: number): Promise<void> {
    if (!this.web3wallet) throw new Error("WalletConnect not initialized");

    await this.web3wallet.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: "2.0",
        error: getSdkError("USER_REJECTED"),
      },
    });
  }

  async disconnectSession(topic: string): Promise<void> {
    if (!this.web3wallet) throw new Error("WalletConnect not initialized");

    await this.web3wallet.disconnectSession({
      topic,
      reason: getSdkError("USER_DISCONNECTED"),
    });

    this.notifySessionUpdate();
  }

  getSessions(): DAppSession[] {
    if (!this.web3wallet) return [];

    const sessions = this.web3wallet.getActiveSessions();
    return Object.values(sessions).map((session) => ({
      topic: session.topic,
      name: session.peer.metadata.name,
      url: session.peer.metadata.url,
      icon: session.peer.metadata.icons?.[0],
      chains: Object.keys(session.namespaces).flatMap(
        (ns) => session.namespaces[ns].chains || []
      ),
      accounts: Object.keys(session.namespaces).flatMap(
        (ns) => session.namespaces[ns].accounts || []
      ),
      expiry: session.expiry,
    }));
  }

  isWalletUnlocked(): boolean {
    return hardwareWallet.getState().status === "unlocked";
  }

  async handleSignRequest(request: PendingRequest): Promise<string | null> {
    if (!this.isWalletUnlocked()) {
      throw new Error("Wallet is locked. Please unlock first.");
    }

    const { method, params } = request;

    switch (method) {
      case "personal_sign": {
        const [message] = params;
        const decodedMessage = message.startsWith("0x")
          ? Buffer.from(message.slice(2), "hex").toString("utf8")
          : message;
        return await hardwareWallet.signMessage(decodedMessage);
      }

      case "eth_sign": {
        const [, message] = params;
        return await hardwareWallet.signMessage(message);
      }

      case "eth_signTypedData":
      case "eth_signTypedData_v4": {
        const [, typedData] = params;
        const data = typeof typedData === "string" ? JSON.parse(typedData) : typedData;
        const messageHash = this.hashTypedData(data);
        return await hardwareWallet.signMessage(messageHash);
      }

      case "eth_sendTransaction":
      case "eth_signTransaction": {
        const [txParams] = params;
        const chainId = parseInt(request.chainId.split(":")[1]) || 1;
        return await hardwareWallet.signTransaction({
          to: txParams.to,
          value: txParams.value || "0x0",
          data: txParams.data || "0x",
          nonce: txParams.nonce ? parseInt(txParams.nonce, 16) : undefined,
          gasLimit: txParams.gas || txParams.gasLimit,
          gasPrice: txParams.gasPrice,
          maxFeePerGas: txParams.maxFeePerGas,
          maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
          chainId,
        });
      }

      default:
        console.warn("Unsupported method:", method);
        return null;
    }
  }

  private hashTypedData(typedData: any): string {
    const { domain, types, primaryType, message } = typedData;
    const filtered = { ...types };
    delete filtered.EIP712Domain;
    return ethers.TypedDataEncoder.hash(domain, filtered, message);
  }

  getWeb3Wallet(): IWeb3Wallet | null {
    return this.web3wallet;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const walletConnectService = new WalletConnectService();
