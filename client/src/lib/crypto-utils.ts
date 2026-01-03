import { SUPPORTED_CHAINS, type WalletAddress, type Chain } from "@shared/schema";

// Generate a deterministic demo address for each chain
// In a real hardware wallet, these would come from the device
function generateDemoAddress(chainId: string): string {
  const addresses: Record<string, string> = {
    btc: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    eth: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    ltc: "ltc1qhfj5yq8czgxu9pmfv5v7qz5fxfze5j5qx5zxxv",
    bch: "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
    doge: "D7Y55FbDpxWxmKhz5j6rNQHXgvWGcwFPGk",
    xrp: "rN7n3476E3y6Jxm5TYjBqCzVLtqDf5Nmea",
  };
  
  return addresses[chainId] || "Address not available";
}

// Get all enabled chains
export function getEnabledChains(): Chain[] {
  return SUPPORTED_CHAINS.filter(chain => chain.enabled);
}

// Get wallet addresses for all enabled chains
export function getWalletAddresses(): WalletAddress[] {
  const enabledChains = getEnabledChains();
  
  return enabledChains.map(chain => ({
    chainId: chain.id,
    address: generateDemoAddress(chain.id),
    chain: chain,
  }));
}

// Format address for display (truncate middle)
export function formatAddress(address: string, startChars = 8, endChars = 6): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

// Copy address to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
