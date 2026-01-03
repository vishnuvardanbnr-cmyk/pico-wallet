export function getWeb3ProviderScript(address: string, chainId: number): string {
  return `
(function() {
  if (window.ethereum && window.ethereum.isVaultKey) return;
  
  const currentAddress = "${address}";
  const currentChainId = ${chainId};
  
  class VaultKeyProvider {
    constructor() {
      this.isVaultKey = true;
      this.isMetaMask = true;
      this.isConnected = () => true;
      this.chainId = "0x" + currentChainId.toString(16);
      this.networkVersion = currentChainId.toString();
      this.selectedAddress = currentAddress;
      this._events = {};
      this._requestId = 0;
    }
    
    on(event, callback) {
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push(callback);
      return this;
    }
    
    removeListener(event, callback) {
      if (this._events[event]) {
        this._events[event] = this._events[event].filter(cb => cb !== callback);
      }
      return this;
    }
    
    emit(event, ...args) {
      if (this._events[event]) {
        this._events[event].forEach(cb => cb(...args));
      }
    }
    
    async request({ method, params }) {
      const id = ++this._requestId;
      
      return new Promise((resolve, reject) => {
        const handleResponse = (event) => {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (data && data.type === 'VAULTKEY_RESPONSE' && data.id === id) {
              window.removeEventListener('message', handleResponse);
              if (data.error) {
                reject(new Error(data.error.message || 'Request failed'));
              } else {
                resolve(data.result);
              }
            }
          } catch (e) {}
        };
        
        window.addEventListener('message', handleResponse);
        
        window.parent.postMessage({
          type: 'VAULTKEY_REQUEST',
          id,
          method,
          params: params || []
        }, '*');
        
        setTimeout(() => {
          window.removeEventListener('message', handleResponse);
          
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              resolve([currentAddress]);
              break;
            case 'eth_chainId':
              resolve("0x" + currentChainId.toString(16));
              break;
            case 'net_version':
              resolve(currentChainId.toString());
              break;
            case 'wallet_switchEthereumChain':
              resolve(null);
              break;
            default:
              reject(new Error('Request timed out'));
          }
        }, 5000);
      });
    }
    
    async enable() {
      return this.request({ method: 'eth_requestAccounts' });
    }
    
    send(methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === 'string') {
        return this.request({ method: methodOrPayload, params: paramsOrCallback });
      }
      
      if (typeof paramsOrCallback === 'function') {
        this.request({ method: methodOrPayload.method, params: methodOrPayload.params })
          .then(result => paramsOrCallback(null, { result }))
          .catch(error => paramsOrCallback(error));
        return;
      }
      
      return this.request({ method: methodOrPayload.method, params: methodOrPayload.params });
    }
    
    sendAsync(payload, callback) {
      this.request({ method: payload.method, params: payload.params })
        .then(result => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch(error => callback(error));
    }
  }
  
  const provider = new VaultKeyProvider();
  
  Object.defineProperty(window, 'ethereum', {
    value: provider,
    writable: false,
    configurable: false
  });
  
  window.dispatchEvent(new Event('ethereum#initialized'));
  
  console.log('[VaultKey] Web3 provider injected');
})();
`;
}

export function createProviderMessageHandler(
  onRequest: (request: { id: number; method: string; params: any[] }) => Promise<{ result?: any; error?: { code: number; message: string } }>
) {
  return async function handleMessage(event: MessageEvent) {
    if (event.data?.type !== 'VAULTKEY_REQUEST') return;
    
    const { id, method, params } = event.data;
    
    try {
      const response = await onRequest({ id, method, params });
      
      const source = event.source as Window;
      if (source) {
        source.postMessage({
          type: 'VAULTKEY_RESPONSE',
          id,
          result: response.result,
          error: response.error
        }, '*');
      }
    } catch (error: any) {
      const source = event.source as Window;
      if (source) {
        source.postMessage({
          type: 'VAULTKEY_RESPONSE',
          id,
          error: { code: 4000, message: error.message || 'Unknown error' }
        }, '*');
      }
    }
  };
}
