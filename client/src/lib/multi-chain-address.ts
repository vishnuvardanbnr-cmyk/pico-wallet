import { ethers } from 'ethers';
import { Buffer } from 'buffer';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import { blake2b } from 'blakejs';

// Coin types for BIP44 derivation
const COIN_TYPES: Record<string, number> = {
  BTC: 0,
  LTC: 2,
  DOGE: 3,
  BCH: 145,
  ETH: 60,
  BNB: 60,
  MATIC: 60,
  AVAX: 60,
  ARB: 60,
  XRP: 144,
  TRX: 195,
  SOL: 501,
  ADA: 1815,
  ATOM: 118,
  OSMO: 118,
  DOT: 354,
};

// Generate BIP44 derivation path with account index
function getDerivationPath(chainSymbol: string, accountIndex: number = 0): string {
  const coinType = COIN_TYPES[chainSymbol] ?? 60;
  
  // Special handling for different chain types
  switch (chainSymbol) {
    case 'BTC':
    case 'LTC':
      // Native SegWit uses purpose 84'
      return `m/84'/${coinType}'/${accountIndex}'/0/0`;
    case 'SOL':
      // Solana uses all hardened path
      return `m/44'/${coinType}'/${accountIndex}'/0'`;
    case 'ADA':
      // Cardano uses CIP-1852 with all hardened for SLIP-0010
      return `m/1852'/${coinType}'/${accountIndex}'/0'/0'`;
    case 'DOT':
      // Polkadot uses all hardened path for SLIP-0010 ed25519
      return `m/44'/${coinType}'/${accountIndex}'/0'/0'`;
    default:
      // Standard BIP44 for EVM and most other chains
      return `m/44'/${coinType}'/${accountIndex}'/0/0`;
  }
}

// Legacy static paths for backward compatibility (account index 0)
const DERIVATION_PATHS: Record<string, string> = {
  BTC: "m/84'/0'/0'/0/0",      // Native SegWit (bc1...)
  LTC: "m/84'/2'/0'/0/0",      // Litecoin SegWit
  DOGE: "m/44'/3'/0'/0/0",     // Dogecoin
  BCH: "m/44'/145'/0'/0/0",    // Bitcoin Cash
  ETH: "m/44'/60'/0'/0/0",     // Ethereum (and EVM chains)
  BNB: "m/44'/60'/0'/0/0",     // BSC uses same as ETH
  MATIC: "m/44'/60'/0'/0/0",   // Polygon
  AVAX: "m/44'/60'/0'/0/0",    // Avalanche
  ARB: "m/44'/60'/0'/0/0",     // Arbitrum
  XRP: "m/44'/144'/0'/0/0",    // XRP
  TRX: "m/44'/195'/0'/0/0",    // TRON
  SOL: "m/44'/501'/0'/0'",     // Solana (ed25519)
  ADA: "m/1852'/1815'/0'/0'/0'", // Cardano (SLIP-0010 ed25519 - all hardened)
  ATOM: "m/44'/118'/0'/0/0",   // Cosmos (secp256k1)
  OSMO: "m/44'/118'/0'/0/0",   // Osmosis (same as Cosmos)
  DOT: "m/44'/354'/0'/0'/0'",  // Polkadot (SLIP-0010 ed25519 - all hardened)
};

// Base58 alphabets
const BITCOIN_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const XRP_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';

function base58Encode(bytes: Uint8Array, alphabet: string = BITCOIN_ALPHABET): string {
  if (bytes.length === 0) return '';
  let result = '';
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(58));
    result = alphabet[remainder] + result;
    num = num / BigInt(58);
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = alphabet[0] + result;
  }
  return result || alphabet[0];
}

export interface DerivedAddress {
  chainSymbol: string;
  address: string;
  path: string;
}

function deriveEVMAddress(mnemonic: string, chainSymbol: string, accountIndex: number = 0): string {
  try {
    const path = getDerivationPath(chainSymbol, accountIndex);
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path);
    return hdNode.address;
  } catch (error) {
    console.error('EVM derivation error:', error);
    return '';
  }
}

function deriveBitcoinAddress(mnemonic: string, chainSymbol: string, accountIndex: number = 0): string {
  try {
    // For Bitcoin-like chains, derive from seed and create address format
    const path = getDerivationPath(chainSymbol, accountIndex);
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path);
    
    // Get the compressed public key
    const pubKeyHex = hdNode.publicKey;
    const pubKeyBytes = ethers.getBytes(pubKeyHex);
    
    // SHA256 then RIPEMD160 (Hash160)
    const sha256Hash = ethers.sha256(pubKeyBytes);
    const hash160 = ethers.ripemd160(sha256Hash);
    const hash160Bytes = ethers.getBytes(hash160);
    
    if (chainSymbol === 'BTC' || chainSymbol === 'LTC') {
      // Bech32 encoding for SegWit
      const hrp = chainSymbol === 'LTC' ? 'ltc' : 'bc';
      return bech32Encode(hrp, hash160Bytes);
    } else {
      // Legacy P2PKH for DOGE, BCH
      let version: number;
      if (chainSymbol === 'DOGE') {
        version = 0x1e;
      } else {
        version = 0x00;
      }
      
      const versionedPayload = new Uint8Array(21);
      versionedPayload[0] = version;
      versionedPayload.set(hash160Bytes, 1);
      
      const checksum1 = ethers.getBytes(ethers.sha256(versionedPayload));
      const checksum2 = ethers.getBytes(ethers.sha256(checksum1));
      const checksum = checksum2.slice(0, 4);
      
      const addressBytes = new Uint8Array(25);
      addressBytes.set(versionedPayload);
      addressBytes.set(checksum, 21);
      
      return base58Encode(addressBytes);
    }
  } catch (error) {
    console.error(`${chainSymbol} derivation error:`, error);
    return '';
  }
}

function bech32Encode(hrp: string, data: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  
  function polymod(values: number[]): number {
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        chk ^= ((b >> i) & 1) ? GENERATOR[i] : 0;
      }
    }
    return chk;
  }
  
  function hrpExpand(hrp: string): number[] {
    const ret: number[] = [];
    for (const c of hrp) ret.push(c.charCodeAt(0) >> 5);
    ret.push(0);
    for (const c of hrp) ret.push(c.charCodeAt(0) & 31);
    return ret;
  }
  
  function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
    let acc = 0;
    let bits = 0;
    const ret: number[] = [];
    const maxv = (1 << toBits) - 1;
    
    for (const value of data) {
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        ret.push((acc >> bits) & maxv);
      }
    }
    
    if (pad && bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
    return ret;
  }
  
  const values = [0, ...convertBits(data, 8, 5, true)]; // witness version 0 + data
  const checksum = polymod([...hrpExpand(hrp), ...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksumChars: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksumChars.push((checksum >> (5 * (5 - i))) & 31);
  }
  
  let encoded = hrp + '1';
  for (const v of values) encoded += CHARSET[v];
  for (const v of checksumChars) encoded += CHARSET[v];
  
  return encoded;
}


function deriveXRPAddress(mnemonic: string, accountIndex: number = 0): string {
  try {
    const path = getDerivationPath('XRP', accountIndex);
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path);
    
    const pubKeyBytes = ethers.getBytes(hdNode.publicKey);
    const sha256Hash = ethers.sha256(pubKeyBytes);
    const hash160 = ethers.ripemd160(sha256Hash);
    const hash160Bytes = ethers.getBytes(hash160);
    
    // Version byte 0x00 for XRP mainnet
    const versionedPayload = new Uint8Array(21);
    versionedPayload[0] = 0x00;
    versionedPayload.set(hash160Bytes, 1);
    
    // Double SHA256 for checksum
    const checksum1 = ethers.getBytes(ethers.sha256(versionedPayload));
    const checksum2 = ethers.getBytes(ethers.sha256(checksum1));
    const checksum = checksum2.slice(0, 4);
    
    const addressBytes = new Uint8Array(25);
    addressBytes.set(versionedPayload);
    addressBytes.set(checksum, 21);
    
    return base58Encode(addressBytes, XRP_ALPHABET);
  } catch (error) {
    console.error('XRP derivation error:', error);
    return '';
  }
}

function deriveTRONAddress(mnemonic: string, accountIndex: number = 0): string {
  try {
    const ethAddress = deriveEVMAddress(mnemonic, 'TRX', accountIndex);
    
    if (!ethAddress) return '';
    
    // Convert Ethereum address to TRON address
    const addressHex = '41' + ethAddress.slice(2);
    const addressBytes = ethers.getBytes('0x' + addressHex);
    
    // Double SHA256 for checksum
    const checksum1 = ethers.getBytes(ethers.sha256(addressBytes));
    const checksum2 = ethers.getBytes(ethers.sha256(checksum1));
    const checksum = checksum2.slice(0, 4);
    
    const fullAddress = new Uint8Array(25);
    fullAddress.set(addressBytes);
    fullAddress.set(checksum, 21);
    
    return base58Encode(fullAddress);
  } catch (error) {
    console.error('TRON derivation error:', error);
    return '';
  }
}

async function hmacSha512(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return new Uint8Array(sig);
}

async function deriveSolanaAddress(mnemonic: string, accountIndex: number = 0): Promise<string> {
  try {
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const seed = mnemonicObj.computeSeed();
    const seedBytes = ethers.getBytes(seed);
    
    // SLIP-0010 ed25519 key derivation
    // Master key derivation
    const masterKey = await hmacSha512(
      new TextEncoder().encode('ed25519 seed'),
      seedBytes
    );
    
    let key = masterKey.slice(0, 32);
    let chainCode = masterKey.slice(32, 64);
    
    // Derive path: m/44'/501'/accountIndex'/0'
    const indices = [
      0x8000002C, // 44' (purpose)
      0x800001F5, // 501' (Solana coin type)
      0x80000000 + accountIndex, // accountIndex' (account)
      0x80000000, // 0' (change - hardened for Solana)
    ];
    
    for (const index of indices) {
      const data = new Uint8Array(37);
      data[0] = 0x00;
      data.set(key, 1);
      data[33] = (index >> 24) & 0xff;
      data[34] = (index >> 16) & 0xff;
      data[35] = (index >> 8) & 0xff;
      data[36] = index & 0xff;
      
      const derived = await hmacSha512(chainCode, data);
      key = derived.slice(0, 32);
      chainCode = derived.slice(32, 64);
    }
    
    // Generate keypair from derived seed
    const keypair = nacl.sign.keyPair.fromSeed(key);
    
    return bs58.encode(keypair.publicKey);
  } catch (error) {
    console.error('Solana derivation error:', error);
    return '';
  }
}

function bech32EncodeCardano(hrp: string, data: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  
  function polymod(values: number[]): number {
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        chk ^= ((b >> i) & 1) ? GENERATOR[i] : 0;
      }
    }
    return chk;
  }
  
  function hrpExpand(hrp: string): number[] {
    const ret: number[] = [];
    for (const c of hrp) ret.push(c.charCodeAt(0) >> 5);
    ret.push(0);
    for (const c of hrp) ret.push(c.charCodeAt(0) & 31);
    return ret;
  }
  
  function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
    let acc = 0;
    let bits = 0;
    const ret: number[] = [];
    const maxv = (1 << toBits) - 1;
    
    for (const value of data) {
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        ret.push((acc >> bits) & maxv);
      }
    }
    
    if (pad && bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
    return ret;
  }
  
  const values = convertBits(data, 8, 5, true);
  const checksum = polymod([...hrpExpand(hrp), ...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksumChars: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksumChars.push((checksum >> (5 * (5 - i))) & 31);
  }
  
  let encoded = hrp + '1';
  for (const v of values) encoded += CHARSET[v];
  for (const v of checksumChars) encoded += CHARSET[v];
  
  return encoded;
}

// BLAKE2b-224 hash using blakejs library
function blake2b224(data: Uint8Array): Uint8Array {
  return blake2b(data, undefined, 28);
}

// SS58 encoding for Polkadot addresses
function ss58Encode(publicKey: Uint8Array, prefix: number = 0): string {
  // SS58 uses Base58 with a specific checksum using Blake2b-512
  const SS58_PREFIX = new TextEncoder().encode('SS58PRE');
  
  // Build the data to hash: SS58PRE || prefix || publicKey
  let prefixBytes: Uint8Array;
  if (prefix < 64) {
    prefixBytes = new Uint8Array([prefix]);
  } else if (prefix < 16384) {
    // Two-byte encoding for prefix >= 64
    prefixBytes = new Uint8Array([
      ((prefix & 0xFC) >> 2) | 0x40,
      (prefix >> 8) | ((prefix & 0x03) << 6)
    ]);
  } else {
    throw new Error('SS58 prefix too large');
  }
  
  // Concatenate for checksum calculation
  const checksumInput = new Uint8Array(SS58_PREFIX.length + prefixBytes.length + publicKey.length);
  checksumInput.set(SS58_PREFIX, 0);
  checksumInput.set(prefixBytes, SS58_PREFIX.length);
  checksumInput.set(publicKey, SS58_PREFIX.length + prefixBytes.length);
  
  // Blake2b-512 hash, take first 2 bytes as checksum
  const hash = blake2b(checksumInput, undefined, 64);
  const checksum = hash.slice(0, 2);
  
  // Build final address bytes: prefix || publicKey || checksum
  const addressBytes = new Uint8Array(prefixBytes.length + publicKey.length + 2);
  addressBytes.set(prefixBytes, 0);
  addressBytes.set(publicKey, prefixBytes.length);
  addressBytes.set(checksum, prefixBytes.length + publicKey.length);
  
  return base58Encode(addressBytes);
}

async function derivePolkadotAddress(mnemonic: string, accountIndex: number = 0): Promise<string> {
  try {
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const seed = mnemonicObj.computeSeed();
    const seedBytes = ethers.getBytes(seed);
    
    // SLIP-0010 ed25519 key derivation (same pattern as Solana/Cardano)
    const masterKey = await hmacSha512(
      new TextEncoder().encode('ed25519 seed'),
      seedBytes
    );
    
    let key = masterKey.slice(0, 32);
    let chainCode = masterKey.slice(32, 64);
    
    // Path: m/44'/354'/accountIndex'/0'/0' (all hardened for SLIP-0010 ed25519)
    const indices = [
      0x8000002C, // 44' (purpose)
      0x80000162, // 354' (Polkadot coin type)
      0x80000000 + accountIndex, // accountIndex' (account)
      0x80000000, // 0' (change - hardened)
      0x80000000, // 0' (address index - hardened)
    ];
    
    for (const index of indices) {
      const data = new Uint8Array(37);
      data[0] = 0x00;
      data.set(key, 1);
      data[33] = (index >> 24) & 0xff;
      data[34] = (index >> 16) & 0xff;
      data[35] = (index >> 8) & 0xff;
      data[36] = index & 0xff;
      
      const derived = await hmacSha512(chainCode, data);
      key = derived.slice(0, 32);
      chainCode = derived.slice(32, 64);
    }
    
    // Generate keypair from derived seed
    const keypair = nacl.sign.keyPair.fromSeed(key);
    
    // SS58 encode with prefix 0 for Polkadot mainnet
    return ss58Encode(keypair.publicKey, 0);
  } catch (error) {
    console.error('Polkadot derivation error:', error);
    return '';
  }
}

async function deriveCardanoAddress(mnemonic: string, accountIndex: number = 0): Promise<string> {
  try {
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const seed = mnemonicObj.computeSeed();
    const seedBytes = ethers.getBytes(seed);
    
    // SLIP-0010 ed25519 key derivation (only supports hardened paths)
    // Using path: m/1852'/1815'/accountIndex'/0'/0' (all hardened for SLIP-0010 compatibility)
    const masterKey = await hmacSha512(
      new TextEncoder().encode('ed25519 seed'),
      seedBytes
    );
    
    let key = masterKey.slice(0, 32);
    let chainCode = masterKey.slice(32, 64);
    
    // Path: m/1852'/1815'/accountIndex'/0'/0' (all hardened for SLIP-0010 ed25519)
    const indices = [
      0x8000073C, // 1852' (purpose - CIP-1852)
      0x80000717, // 1815' (Cardano coin type)
      0x80000000 + accountIndex, // accountIndex' (account)
      0x80000000, // 0' (role/chain - hardened)
      0x80000000, // 0' (address index - hardened)
    ];
    
    for (const index of indices) {
      // SLIP-0010 hardened derivation: 0x00 || private key || index
      const data = new Uint8Array(37);
      data[0] = 0x00;
      data.set(key, 1);
      data[33] = (index >> 24) & 0xff;
      data[34] = (index >> 16) & 0xff;
      data[35] = (index >> 8) & 0xff;
      data[36] = index & 0xff;
      
      const derived = await hmacSha512(chainCode, data);
      key = derived.slice(0, 32);
      chainCode = derived.slice(32, 64);
    }
    
    // Generate payment public key from derived private key
    const keypair = nacl.sign.keyPair.fromSeed(key);
    const paymentPubKey = keypair.publicKey;
    
    // Hash payment public key with Blake2b-224
    const paymentKeyHash = blake2b224(paymentPubKey);
    
    // Create Enterprise address (type 6 for mainnet enterprise)
    // Header byte: 0x61 = Enterprise address, mainnet (network id 1)
    const addressBytes = new Uint8Array(29);
    addressBytes[0] = 0x61; // Enterprise address header for mainnet
    addressBytes.set(paymentKeyHash, 1);
    
    return bech32EncodeCardano('addr', addressBytes);
  } catch (error) {
    console.error('Cardano derivation error:', error);
    return '';
  }
}

function deriveCosmosAddress(mnemonic: string, chainSymbol: string, accountIndex: number = 0): string {
  try {
    // Cosmos uses secp256k1 with bech32 encoding
    const path = getDerivationPath(chainSymbol, accountIndex);
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path);
    
    // Get compressed public key (33 bytes)
    const pubKeyHex = hdNode.publicKey;
    const pubKeyBytes = ethers.getBytes(pubKeyHex);
    
    // SHA256 then RIPEMD160 (same as Bitcoin Hash160)
    const sha256Hash = ethers.sha256(pubKeyBytes);
    const hash160 = ethers.ripemd160(sha256Hash);
    const hash160Bytes = ethers.getBytes(hash160);
    
    // Bech32 encode with chain-specific prefix
    const prefix = chainSymbol === 'OSMO' ? 'osmo' : 'cosmos';
    return bech32EncodeCosmos(prefix, hash160Bytes);
  } catch (error) {
    console.error(`${chainSymbol} derivation error:`, error);
    return '';
  }
}

function bech32EncodeCosmos(hrp: string, data: Uint8Array): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  
  function polymod(values: number[]): number {
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        chk ^= ((b >> i) & 1) ? GENERATOR[i] : 0;
      }
    }
    return chk;
  }
  
  function hrpExpand(hrp: string): number[] {
    const ret: number[] = [];
    for (const c of hrp) ret.push(c.charCodeAt(0) >> 5);
    ret.push(0);
    for (const c of hrp) ret.push(c.charCodeAt(0) & 31);
    return ret;
  }
  
  function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
    let acc = 0;
    let bits = 0;
    const ret: number[] = [];
    const maxv = (1 << toBits) - 1;
    
    for (const value of data) {
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        ret.push((acc >> bits) & maxv);
      }
    }
    
    if (pad && bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
    return ret;
  }
  
  const values = convertBits(data, 8, 5, true);
  const checksum = polymod([...hrpExpand(hrp), ...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksumChars: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksumChars.push((checksum >> (5 * (5 - i))) & 31);
  }
  
  let encoded = hrp + '1';
  for (const v of values) encoded += CHARSET[v];
  for (const v of checksumChars) encoded += CHARSET[v];
  
  return encoded;
}

export async function deriveAddressForChain(mnemonic: string, chainSymbol: string, accountIndex: number = 0): Promise<DerivedAddress | null> {
  try {
    // Validate mnemonic using ethers
    try {
      ethers.Mnemonic.fromPhrase(mnemonic);
    } catch {
      console.error('Invalid mnemonic');
      return null;
    }
    
    const path = getDerivationPath(chainSymbol, accountIndex);
    let address = '';
    
    switch (chainSymbol) {
      case 'BTC':
      case 'LTC':
      case 'DOGE':
      case 'BCH':
        address = deriveBitcoinAddress(mnemonic, chainSymbol, accountIndex);
        break;
        
      case 'ETH':
      case 'BNB':
      case 'MATIC':
      case 'AVAX':
      case 'ARB':
        address = deriveEVMAddress(mnemonic, chainSymbol, accountIndex);
        break;
        
      case 'XRP':
        address = deriveXRPAddress(mnemonic, accountIndex);
        break;
        
      case 'TRX':
        address = deriveTRONAddress(mnemonic, accountIndex);
        break;
        
      case 'SOL':
        address = await deriveSolanaAddress(mnemonic, accountIndex);
        break;
        
      case 'ADA':
        address = await deriveCardanoAddress(mnemonic, accountIndex);
        break;
        
      case 'DOT':
        address = await derivePolkadotAddress(mnemonic, accountIndex);
        break;
        
      case 'ATOM':
      case 'OSMO':
        address = deriveCosmosAddress(mnemonic, chainSymbol, accountIndex);
        break;
        
      default:
        // Default to EVM derivation
        address = deriveEVMAddress(mnemonic, chainSymbol, accountIndex);
    }
    
    return {
      chainSymbol,
      address,
      path,
    };
  } catch (error) {
    console.error(`Error deriving address for ${chainSymbol}:`, error);
    return null;
  }
}

export async function deriveAllAddresses(mnemonic: string, chainSymbols: string[], accountIndex: number = 0): Promise<DerivedAddress[]> {
  const results: DerivedAddress[] = [];
  
  for (const symbol of chainSymbols) {
    const derived = await deriveAddressForChain(mnemonic, symbol, accountIndex);
    if (derived && derived.address) {
      results.push(derived);
    }
  }
  
  return results;
}
