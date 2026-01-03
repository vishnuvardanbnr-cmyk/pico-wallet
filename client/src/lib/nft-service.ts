export interface NFT {
  id: string;
  tokenId: string;
  contractAddress: string;
  name: string;
  description?: string;
  image?: string;
  chainId: string;
  collectionName?: string;
  tokenType: 'ERC721' | 'ERC1155';
}

export interface NFTCollection {
  address: string;
  name: string;
  symbol?: string;
  nfts: NFT[];
}

const ANKR_RPC_ENDPOINTS: Record<string, string> = {
  'ETH': 'https://rpc.ankr.com/multichain',
  'BNB': 'https://rpc.ankr.com/multichain',
  'MATIC': 'https://rpc.ankr.com/multichain',
  'ARB': 'https://rpc.ankr.com/multichain',
};

const CHAIN_TO_ANKR: Record<string, string> = {
  'ETH': 'eth',
  'BNB': 'bsc',
  'MATIC': 'polygon',
  'ARB': 'arbitrum',
};

export async function fetchNFTs(walletAddress: string, chainSymbol: string): Promise<NFT[]> {
  try {
    const ankrChain = CHAIN_TO_ANKR[chainSymbol];
    if (!ankrChain) {
      console.log(`[NFT] Chain ${chainSymbol} not supported for NFT fetching`);
      return [];
    }

    // Use backend proxy to avoid CORS and rate limiting issues
    const response = await fetch(`/api/nfts?address=${encodeURIComponent(walletAddress)}&chain=${encodeURIComponent(chainSymbol)}`);

    if (!response.ok) {
      console.error(`[NFT] Failed to fetch NFTs: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (data.error) {
      console.error('[NFT] API error:', data.error);
      return [];
    }

    const assets = data.assets || [];
    
    return assets.map((asset: any, index: number) => ({
      id: `${asset.contractAddress}-${asset.tokenId}-${index}`,
      tokenId: asset.tokenId,
      contractAddress: asset.contractAddress,
      name: asset.name || `NFT #${asset.tokenId}`,
      description: asset.description,
      image: sanitizeImageUrl(asset.imageUrl || asset.image),
      chainId: chainSymbol,
      collectionName: asset.collectionName || asset.name,
      tokenType: asset.contractType === 'ERC1155' ? 'ERC1155' : 'ERC721',
    }));
  } catch (error) {
    console.error('[NFT] Error fetching NFTs:', error);
    return [];
  }
}

function sanitizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  
  if (url.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${url.slice(7)}`;
  }
  
  if (url.startsWith('ar://')) {
    return `https://arweave.net/${url.slice(5)}`;
  }
  
  return url;
}

export function groupNFTsByCollection(nfts: NFT[]): NFTCollection[] {
  const collections = new Map<string, NFTCollection>();
  
  for (const nft of nfts) {
    const key = nft.contractAddress.toLowerCase();
    if (!collections.has(key)) {
      collections.set(key, {
        address: nft.contractAddress,
        name: nft.collectionName || 'Unknown Collection',
        nfts: [],
      });
    }
    collections.get(key)!.nfts.push(nft);
  }
  
  return Array.from(collections.values());
}

export async function fetchSingleNFT(
  contractAddress: string, 
  tokenId: string, 
  chainSymbol: string
): Promise<NFT | null> {
  try {
    const ankrChain = CHAIN_TO_ANKR[chainSymbol];
    if (!ankrChain) {
      console.log(`[NFT] Chain ${chainSymbol} not supported for NFT fetching`);
      return null;
    }

    // Use backend proxy to avoid CORS and rate limiting issues
    const response = await fetch(`/api/nft-metadata?contract=${encodeURIComponent(contractAddress)}&tokenId=${encodeURIComponent(tokenId)}&chain=${encodeURIComponent(chainSymbol)}`);

    if (!response.ok) {
      console.error(`[NFT] Failed to fetch NFT metadata: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.error) {
      console.error('[NFT] API error:', data.error);
      return null;
    }

    const result = data.result;
    if (!result) {
      return null;
    }

    const metadata = result.metadata;
    const attributes = result.attributes;
    
    if (!metadata && !attributes) {
      return null;
    }

    return {
      id: `${contractAddress}-${tokenId}-custom`,
      tokenId: tokenId,
      contractAddress: contractAddress,
      name: metadata?.name || attributes?.name || `NFT #${tokenId}`,
      description: metadata?.description || attributes?.description,
      image: sanitizeImageUrl(metadata?.image || attributes?.imageUrl),
      chainId: chainSymbol,
      collectionName: result.collectionName || metadata?.name,
      tokenType: result.contractType === 'ERC1155' ? 'ERC1155' : 'ERC721',
    };
  } catch (error) {
    console.error('[NFT] Error fetching single NFT:', error);
    return null;
  }
}
