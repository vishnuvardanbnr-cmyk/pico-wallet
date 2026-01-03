export const WEB3_PROVIDER_INJECT_SCRIPT = `
(function() {
  if (window.ethereum) return;

  const CHAIN_ID_HEX = {
    1: '0x1',
    56: '0x38',
    137: '0x89',
    43114: '0xa86a',
    42161: '0xa4b1',
  };

  let currentChainId = '0x1';
  let currentAccount = null;
  let requestId = 0;
  const pendingRequests = new Map();

  const provider = {
    isMetaMask: true,
    isTrust: true,
    isVaultKey: true,
    
    chainId: currentChainId,
    networkVersion: '1',
    selectedAddress: null,
    
    _events: {},
    _eventsCount: 0,

    on(event, callback) {
      if (!this._events[event]) {
        this._events[event] = [];
      }
      this._events[event].push(callback);
      this._eventsCount++;
      return this;
    },

    removeListener(event, callback) {
      if (this._events[event]) {
        const idx = this._events[event].indexOf(callback);
        if (idx > -1) {
          this._events[event].splice(idx, 1);
          this._eventsCount--;
        }
      }
      return this;
    },

    emit(event, ...args) {
      if (this._events[event]) {
        this._events[event].forEach(cb => {
          try { cb(...args); } catch(e) { console.error(e); }
        });
      }
    },

    async request({ method, params }) {
      const id = ++requestId;
      
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject, method });
        
        const message = {
          type: 'VAULTKEY_REQUEST',
          id,
          method,
          params: params || [],
        };
        
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.vaultkey) {
          window.webkit.messageHandlers.vaultkey.postMessage(message);
        } else if (window.vaultkey) {
          window.vaultkey.postMessage(JSON.stringify(message));
        } else {
          pendingRequests.delete(id);
          reject(new Error('VaultKey bridge not available'));
        }
        
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error('Request timeout'));
          }
        }, 60000);
      });
    },

    async enable() {
      const accounts = await this.request({ method: 'eth_requestAccounts' });
      return accounts;
    },

    send(methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === 'string') {
        return this.request({ method: methodOrPayload, params: paramsOrCallback });
      }
      
      if (typeof paramsOrCallback === 'function') {
        this.request(methodOrPayload)
          .then(result => paramsOrCallback(null, { result }))
          .catch(error => paramsOrCallback(error, null));
        return;
      }
      
      return this.request(methodOrPayload);
    },

    sendAsync(payload, callback) {
      this.request(payload)
        .then(result => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch(error => callback(error, null));
    },

    isConnected() {
      return currentAccount !== null;
    },
  };

  window._vaultkeyHandleResponse = function(response) {
    const { id, result, error } = response;
    const pending = pendingRequests.get(id);
    if (!pending) return;
    
    pendingRequests.delete(id);
    
    if (error) {
      pending.reject(new Error(error.message || 'Unknown error'));
    } else {
      if (pending.method === 'eth_requestAccounts' || pending.method === 'eth_accounts') {
        if (result && result.length > 0) {
          currentAccount = result[0];
          provider.selectedAddress = currentAccount;
          provider.emit('accountsChanged', result);
        }
      } else if (pending.method === 'eth_chainId' || pending.method === 'wallet_switchEthereumChain') {
        if (result) {
          currentChainId = result;
          provider.chainId = result;
          provider.networkVersion = parseInt(result, 16).toString();
          provider.emit('chainChanged', result);
        }
      }
      pending.resolve(result);
    }
  };

  window._vaultkeyUpdateChain = function(chainIdHex) {
    currentChainId = chainIdHex;
    provider.chainId = chainIdHex;
    provider.networkVersion = parseInt(chainIdHex, 16).toString();
    provider.emit('chainChanged', chainIdHex);
  };

  window._vaultkeyUpdateAccount = function(account) {
    currentAccount = account;
    provider.selectedAddress = account;
    provider.emit('accountsChanged', account ? [account] : []);
  };

  window._vaultkeyDisconnect = function() {
    currentAccount = null;
    provider.selectedAddress = null;
    provider.emit('accountsChanged', []);
    provider.emit('disconnect', { code: 4900, message: 'Disconnected' });
  };

  window.ethereum = provider;
  window.trustwallet = provider;
  window.web3 = { currentProvider: provider };

  window.dispatchEvent(new Event('ethereum#initialized'));
  
  console.log('[VaultKey] Web3 provider injected');
})();
`;

export function getProviderScript(chainId: number, account: string | null): string {
  const chainIdHex = `0x${chainId.toString(16)}`;
  return WEB3_PROVIDER_INJECT_SCRIPT.replace(
    "let currentChainId = '0x1';",
    `let currentChainId = '${chainIdHex}';`
  ).replace(
    "let currentAccount = null;",
    account ? `let currentAccount = '${account}';` : "let currentAccount = null;"
  ).replace(
    "networkVersion: '1',",
    `networkVersion: '${chainId}',`
  ).replace(
    "selectedAddress: null,",
    account ? `selectedAddress: '${account}',` : "selectedAddress: null,"
  );
}
