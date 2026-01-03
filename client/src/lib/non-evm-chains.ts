import * as bip39 from "bip39";
import bs58 from "bs58";
import { ethers } from "ethers";
import nacl from "tweetnacl";
import { blake2b } from "blakejs";

export const DERIVATION_PATHS = {
  bitcoin: "m/84'/0'/0'/0/0",
  ethereum: "m/44'/60'/0'/0/0",
  solana: "m/44'/501'/0'/0'",
  tron: "m/44'/195'/0'/0/0",
};

export const RPC_ENDPOINTS = {
  bitcoin: "https://blockstream.info/api",
  solana: "https://api.mainnet-beta.solana.com",
  tron: "https://api.trongrid.io",
};

export interface NonEvmTransactionParams {
  chainType: "bitcoin" | "solana" | "tron";
  from: string;
  to: string;
  amount: string;
  tokenAddress?: string;
  isNativeToken?: boolean;
}

export interface SignedTransaction {
  chainType: string;
  signedTx: string;
  txHash?: string;
}

function sha256Hash(data: Uint8Array): Uint8Array {
  return ethers.getBytes(ethers.sha256(data));
}

function ripemd160Hash(data: Uint8Array): Uint8Array {
  return ethers.getBytes(ethers.ripemd160(data));
}

function base58CheckEncode(payload: Uint8Array): string {
  const hash1 = sha256Hash(payload);
  const hash2 = sha256Hash(hash1);
  const checksum = hash2.slice(0, 4);
  const addressBytes = new Uint8Array(payload.length + 4);
  addressBytes.set(payload);
  addressBytes.set(checksum, payload.length);
  return bs58.encode(addressBytes);
}

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160Hash(sha256Hash(data));
}

export function deriveBitcoinAddress(seedPhrase: string): { address: string; privateKey: string; publicKey: string } {
  const hdNode = ethers.HDNodeWallet.fromPhrase(seedPhrase, undefined, DERIVATION_PATHS.bitcoin);
  const publicKeyBytes = ethers.getBytes(hdNode.publicKey);
  const pubKeyHash = hash160(publicKeyBytes);
  const witnessProgram = new Uint8Array([0x00, 0x14, ...pubKeyHash]);
  const scriptHash = hash160(witnessProgram);
  const payload = new Uint8Array(21);
  payload[0] = 0x05;
  payload.set(scriptHash, 1);
  const address = base58CheckEncode(payload);

  return {
    address,
    privateKey: hdNode.privateKey,
    publicKey: hdNode.publicKey,
  };
}

export function deriveBitcoinP2WPKHAddress(seedPhrase: string): { address: string; privateKey: string; publicKey: string } {
  const hdNode = ethers.HDNodeWallet.fromPhrase(seedPhrase, undefined, DERIVATION_PATHS.bitcoin);
  const publicKeyBytes = ethers.getBytes(hdNode.publicKey);
  const pubKeyHash = hash160(publicKeyBytes);
  const words = bech32ToWords(pubKeyHash);
  const address = bech32Encode("bc", [0, ...words]);

  return {
    address,
    privateKey: hdNode.privateKey,
    publicKey: hdNode.publicKey,
  };
}

function bech32ToWords(data: Uint8Array): number[] {
  const words: number[] = [];
  let accumulator = 0;
  let bits = 0;
  
  for (const byte of data) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >> bits) & 0x1f);
    }
  }
  
  if (bits > 0) {
    words.push((accumulator << (5 - bits)) & 0x1f);
  }
  
  return words;
}

function bech32Encode(hrp: string, data: number[]): string {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  
  function polymod(values: number[]): number {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) {
          chk ^= GEN[i];
        }
      }
    }
    return chk;
  }
  
  function hrpExpand(hrp: string): number[] {
    const ret: number[] = [];
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) >> 5);
    }
    ret.push(0);
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) & 31);
    }
    return ret;
  }
  
  function createChecksum(hrp: string, data: number[]): number[] {
    const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
    const mod = polymod(values) ^ 1;
    const ret: number[] = [];
    for (let p = 0; p < 6; p++) {
      ret.push((mod >> (5 * (5 - p))) & 31);
    }
    return ret;
  }
  
  const checksum = createChecksum(hrp, data);
  let result = hrp + "1";
  for (const d of [...data, ...checksum]) {
    result += CHARSET[d];
  }
  return result;
}

export function deriveSolanaAddress(seedPhrase: string): { address: string; secretKey: Uint8Array; keypair: nacl.SignKeyPair } {
  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const derivedSeed = seed.slice(0, 32);
  const keypair = nacl.sign.keyPair.fromSeed(derivedSeed);
  const address = bs58.encode(keypair.publicKey);
  
  return {
    address,
    secretKey: keypair.secretKey,
    keypair,
  };
}

export function deriveTronAddress(seedPhrase: string): { address: string; privateKey: string } {
  const hdNode = ethers.HDNodeWallet.fromPhrase(seedPhrase, undefined, DERIVATION_PATHS.tron);
  const signingKey = new ethers.SigningKey(hdNode.privateKey);
  const publicKeyUncompressed = signingKey.publicKey;
  const publicKeyWithoutPrefix = ethers.getBytes(publicKeyUncompressed).slice(1);
  const addressHashHex = ethers.keccak256(publicKeyWithoutPrefix);
  const addressHash = ethers.getBytes(addressHashHex);
  const addressBytes = new Uint8Array(21);
  addressBytes[0] = 0x41;
  addressBytes.set(addressHash.slice(12), 1);
  const firstHash = ethers.sha256(addressBytes);
  const secondHash = ethers.sha256(ethers.getBytes(firstHash));
  const checksum = ethers.getBytes(secondHash).slice(0, 4);
  const addressWithChecksum = new Uint8Array(25);
  addressWithChecksum.set(addressBytes);
  addressWithChecksum.set(checksum, 21);
  const address = bs58.encode(addressWithChecksum);

  return {
    address,
    privateKey: hdNode.privateKey.slice(2),
  };
}

export function getNonEvmAddresses(seedPhrase: string): {
  bitcoin: string;
  solana: string;
  tron: string;
} {
  const btc = deriveBitcoinP2WPKHAddress(seedPhrase);
  const sol = deriveSolanaAddress(seedPhrase);
  const trx = deriveTronAddress(seedPhrase);

  return {
    bitcoin: btc.address,
    solana: sol.address,
    tron: trx.address,
  };
}

async function fetchBitcoinUtxos(address: string): Promise<{ txid: string; vout: number; value: number }[]> {
  try {
    const response = await fetch(`${RPC_ENDPOINTS.bitcoin}/address/${address}/utxo`);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

async function fetchBitcoinFeeRate(): Promise<number> {
  try {
    const response = await fetch(`${RPC_ENDPOINTS.bitcoin}/fee-estimates`);
    if (!response.ok) return 10;
    const fees = await response.json();
    return Math.ceil(fees["6"] || 10);
  } catch {
    return 10;
  }
}

interface DecodedAddress {
  type: "p2wpkh" | "p2wsh" | "p2tr" | "p2pkh" | "p2sh";
  program: Uint8Array;
  witnessVersion?: number;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) {
        chk ^= GEN[i];
      }
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (const c of hrp) {
    ret.push(c.charCodeAt(0) >> 5);
  }
  ret.push(0);
  for (const c of hrp) {
    ret.push(c.charCodeAt(0) & 31);
  }
  return ret;
}

function verifyBech32Checksum(hrp: string, data: number[]): "bech32" | "bech32m" | null {
  const BECH32_CONST = 1;
  const BECH32M_CONST = 0x2bc830a3;
  
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod(values);
  
  if (polymod === BECH32_CONST) return "bech32";
  if (polymod === BECH32M_CONST) return "bech32m";
  return null;
}

function decodeBech32Address(address: string): DecodedAddress | null {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const pos = address.lastIndexOf("1");
  if (pos < 1 || pos + 7 > address.length) return null;
  
  const hrp = address.slice(0, pos).toLowerCase();
  if (hrp !== "bc" && hrp !== "tb") return null;
  
  const data: number[] = [];
  for (let i = pos + 1; i < address.length; i++) {
    const idx = CHARSET.indexOf(address[i].toLowerCase());
    if (idx === -1) return null;
    data.push(idx);
  }
  
  const encoding = verifyBech32Checksum(hrp, data);
  if (!encoding) return null;
  
  const values = data.slice(0, -6);
  if (values.length === 0 || values[0] > 16) return null;
  
  const witnessVersion = values[0];
  
  if (witnessVersion === 0 && encoding !== "bech32") return null;
  if (witnessVersion >= 1 && encoding !== "bech32m") return null;
  
  const witness = values.slice(1);
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  
  for (const value of witness) {
    accumulator = (accumulator << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((accumulator >> bits) & 0xff);
    }
  }
  
  const program = new Uint8Array(result);
  
  if (witnessVersion === 0 && program.length === 20) {
    return { type: "p2wpkh", program, witnessVersion: 0 };
  } else if (witnessVersion === 0 && program.length === 32) {
    return { type: "p2wsh", program, witnessVersion: 0 };
  } else if (witnessVersion === 1 && program.length === 32) {
    return { type: "p2tr", program, witnessVersion: 1 };
  }
  
  return null;
}

function decodeBase58Address(address: string): DecodedAddress | null {
  try {
    const decoded = bs58.decode(address);
    if (decoded.length !== 25) return null;
    
    const payload = decoded.slice(0, 21);
    const checksum = decoded.slice(21);
    
    const hash1 = sha256Hash(payload);
    const hash2 = sha256Hash(hash1);
    const expectedChecksum = hash2.slice(0, 4);
    
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== expectedChecksum[i]) return null;
    }
    
    const version = payload[0];
    const hash = payload.slice(1);
    
    if (version === 0x00) {
      return { type: "p2pkh", program: hash };
    } else if (version === 0x05) {
      return { type: "p2sh", program: hash };
    }
    
    return null;
  } catch {
    return null;
  }
}

function decodeAnyBitcoinAddress(address: string): DecodedAddress | null {
  if (address.toLowerCase().startsWith("bc1") || address.toLowerCase().startsWith("tb1")) {
    return decodeBech32Address(address);
  }
  return decodeBase58Address(address);
}

function createOutputScript(decoded: DecodedAddress): Uint8Array {
  switch (decoded.type) {
    case "p2wpkh":
      return new Uint8Array([0x00, 0x14, ...decoded.program]);
    case "p2wsh":
      return new Uint8Array([0x00, 0x20, ...decoded.program]);
    case "p2tr":
      return new Uint8Array([0x51, 0x20, ...decoded.program]);
    case "p2pkh":
      return new Uint8Array([0x76, 0xa9, 0x14, ...decoded.program, 0x88, 0xac]);
    case "p2sh":
      return new Uint8Array([0xa9, 0x14, ...decoded.program, 0x87]);
    default:
      return new Uint8Array([0x00, 0x14, ...decoded.program]);
  }
}

function writeVarInt(value: number): Uint8Array {
  if (value < 0xfd) {
    return new Uint8Array([value]);
  } else if (value <= 0xffff) {
    const buf = new Uint8Array(3);
    buf[0] = 0xfd;
    buf[1] = value & 0xff;
    buf[2] = (value >> 8) & 0xff;
    return buf;
  } else {
    const buf = new Uint8Array(5);
    buf[0] = 0xfe;
    buf[1] = value & 0xff;
    buf[2] = (value >> 8) & 0xff;
    buf[3] = (value >> 16) & 0xff;
    buf[4] = (value >> 24) & 0xff;
    return buf;
  }
}

function reverseBytes(hex: string): Uint8Array {
  const bytes = ethers.getBytes("0x" + hex);
  const reversed = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    reversed[i] = bytes[bytes.length - 1 - i];
  }
  return reversed;
}

function writeUint32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >> 8) & 0xff;
  buf[2] = (value >> 16) & 0xff;
  buf[3] = (value >> 24) & 0xff;
  return buf;
}

function writeUint64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
  }
  return buf;
}

function createP2WPKHScriptPubKey(pubKeyHash: Uint8Array): Uint8Array {
  return new Uint8Array([0x00, 0x14, ...pubKeyHash]);
}

function createP2PKHScript(pubKeyHash: Uint8Array): Uint8Array {
  return new Uint8Array([0x76, 0xa9, 0x14, ...pubKeyHash, 0x88, 0xac]);
}

export async function buildBitcoinTransaction(
  params: NonEvmTransactionParams,
  seedPhrase: string
): Promise<{ signedTx: string; txHash: string } | null> {
  try {
    const { address, privateKey, publicKey } = deriveBitcoinP2WPKHAddress(seedPhrase);
    
    if (params.from !== address) {
      console.error("Address mismatch: expected", address, "got", params.from);
      return null;
    }

    const utxos = await fetchBitcoinUtxos(address);
    if (utxos.length === 0) {
      console.error("No UTXOs available");
      return null;
    }

    const feeRate = await fetchBitcoinFeeRate();
    const amountSatoshis = BigInt(Math.floor(parseFloat(params.amount) * 100000000));
    
    const estimatedSize = 110 + (utxos.length * 68);
    const fee = BigInt(feeRate * estimatedSize);
    
    let totalInput = BigInt(0);
    const selectedUtxos: { txid: string; vout: number; value: number }[] = [];
    
    for (const utxo of utxos) {
      selectedUtxos.push(utxo);
      totalInput += BigInt(utxo.value);
      if (totalInput >= amountSatoshis + fee) break;
    }
    
    if (totalInput < amountSatoshis + fee) {
      console.error("Insufficient funds");
      return null;
    }

    const change = totalInput - amountSatoshis - fee;
    const publicKeyBytes = ethers.getBytes(publicKey);
    const pubKeyHash = hash160(publicKeyBytes);
    
    const decodedRecipient = decodeAnyBitcoinAddress(params.to);
    if (!decodedRecipient) {
      console.error("Invalid recipient address");
      return null;
    }

    const version = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
    const marker = new Uint8Array([0x00]);
    const flag = new Uint8Array([0x01]);
    const inputCount = writeVarInt(selectedUtxos.length);
    
    const inputs: Uint8Array[] = [];
    for (const utxo of selectedUtxos) {
      const txidBytes = reverseBytes(utxo.txid);
      const voutBytes = writeUint32LE(utxo.vout);
      const scriptSig = new Uint8Array([0x00]);
      const sequence = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      
      const input = new Uint8Array(txidBytes.length + voutBytes.length + scriptSig.length + sequence.length);
      let offset = 0;
      input.set(txidBytes, offset); offset += txidBytes.length;
      input.set(voutBytes, offset); offset += voutBytes.length;
      input.set(scriptSig, offset); offset += scriptSig.length;
      input.set(sequence, offset);
      inputs.push(input);
    }
    
    const outputs: Uint8Array[] = [];
    const outputScriptPubKey = createOutputScript(decodedRecipient);
    const outputValue = writeUint64LE(amountSatoshis);
    const outputScriptLen = writeVarInt(outputScriptPubKey.length);
    
    const output1 = new Uint8Array(outputValue.length + outputScriptLen.length + outputScriptPubKey.length);
    let off = 0;
    output1.set(outputValue, off); off += outputValue.length;
    output1.set(outputScriptLen, off); off += outputScriptLen.length;
    output1.set(outputScriptPubKey, off);
    outputs.push(output1);
    
    let outputCount = 1;
    if (change > BigInt(546)) {
      outputCount = 2;
      const changeScriptPubKey = createP2WPKHScriptPubKey(pubKeyHash);
      const changeValue = writeUint64LE(change);
      const changeScriptLen = writeVarInt(changeScriptPubKey.length);
      
      const output2 = new Uint8Array(changeValue.length + changeScriptLen.length + changeScriptPubKey.length);
      let off2 = 0;
      output2.set(changeValue, off2); off2 += changeValue.length;
      output2.set(changeScriptLen, off2); off2 += changeScriptLen.length;
      output2.set(changeScriptPubKey, off2);
      outputs.push(output2);
    }
    
    const outputCountBytes = writeVarInt(outputCount);
    const locktime = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    
    const witnesses: Uint8Array[] = [];
    const signingKey = new ethers.SigningKey(privateKey);
    
    for (let i = 0; i < selectedUtxos.length; i++) {
      const utxo = selectedUtxos[i];
      
      const hashPrevouts = sha256Hash(sha256Hash((() => {
        const parts: Uint8Array[] = [];
        for (const u of selectedUtxos) {
          parts.push(reverseBytes(u.txid));
          parts.push(writeUint32LE(u.vout));
        }
        const total = parts.reduce((a, b) => a + b.length, 0);
        const result = new Uint8Array(total);
        let off = 0;
        for (const p of parts) {
          result.set(p, off);
          off += p.length;
        }
        return result;
      })()));
      
      const hashSequence = sha256Hash(sha256Hash((() => {
        const seqs = new Uint8Array(selectedUtxos.length * 4);
        for (let j = 0; j < selectedUtxos.length; j++) {
          seqs.set([0xff, 0xff, 0xff, 0xff], j * 4);
        }
        return seqs;
      })()));
      
      const hashOutputs = sha256Hash(sha256Hash((() => {
        const total = outputs.reduce((a, b) => a + b.length, 0);
        const result = new Uint8Array(total);
        let off = 0;
        for (const o of outputs) {
          result.set(o, off);
          off += o.length;
        }
        return result;
      })()));
      
      const outpoint = new Uint8Array(36);
      outpoint.set(reverseBytes(utxo.txid), 0);
      outpoint.set(writeUint32LE(utxo.vout), 32);
      
      const scriptCode = createP2PKHScript(pubKeyHash);
      const scriptCodeLen = writeVarInt(scriptCode.length);
      const value = writeUint64LE(BigInt(utxo.value));
      const sequence = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      const sighashType = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
      
      const preimageLen = 4 + hashPrevouts.length + hashSequence.length + 36 + 
                          scriptCodeLen.length + scriptCode.length + 8 + 4 + 
                          hashOutputs.length + 4 + 4;
      const preimage = new Uint8Array(preimageLen);
      let pOff = 0;
      preimage.set(version, pOff); pOff += 4;
      preimage.set(hashPrevouts, pOff); pOff += hashPrevouts.length;
      preimage.set(hashSequence, pOff); pOff += hashSequence.length;
      preimage.set(outpoint, pOff); pOff += 36;
      preimage.set(scriptCodeLen, pOff); pOff += scriptCodeLen.length;
      preimage.set(scriptCode, pOff); pOff += scriptCode.length;
      preimage.set(value, pOff); pOff += 8;
      preimage.set(sequence, pOff); pOff += 4;
      preimage.set(hashOutputs, pOff); pOff += hashOutputs.length;
      preimage.set(locktime, pOff); pOff += 4;
      preimage.set(sighashType, pOff);
      
      const sigHash = sha256Hash(sha256Hash(preimage));
      const sig = signingKey.sign(sigHash);
      
      const rBytes = ethers.getBytes(sig.r);
      const sBytes = ethers.getBytes(sig.s);
      
      const rPadded = rBytes[0] >= 0x80 ? new Uint8Array([0x00, ...rBytes]) : rBytes;
      const sPadded = sBytes[0] >= 0x80 ? new Uint8Array([0x00, ...sBytes]) : sBytes;
      
      const derSig = new Uint8Array([
        0x30,
        rPadded.length + sPadded.length + 4,
        0x02,
        rPadded.length,
        ...rPadded,
        0x02,
        sPadded.length,
        ...sPadded,
        0x01
      ]);
      
      const witness = new Uint8Array([
        0x02,
        derSig.length,
        ...derSig,
        publicKeyBytes.length,
        ...publicKeyBytes
      ]);
      
      witnesses.push(witness);
    }
    
    let totalLen = version.length + marker.length + flag.length + inputCount.length;
    for (const inp of inputs) totalLen += inp.length;
    totalLen += outputCountBytes.length;
    for (const out of outputs) totalLen += out.length;
    for (const wit of witnesses) totalLen += wit.length;
    totalLen += locktime.length;
    
    const signedTxBytes = new Uint8Array(totalLen);
    let txOff = 0;
    signedTxBytes.set(version, txOff); txOff += version.length;
    signedTxBytes.set(marker, txOff); txOff += marker.length;
    signedTxBytes.set(flag, txOff); txOff += flag.length;
    signedTxBytes.set(inputCount, txOff); txOff += inputCount.length;
    for (const inp of inputs) {
      signedTxBytes.set(inp, txOff);
      txOff += inp.length;
    }
    signedTxBytes.set(outputCountBytes, txOff); txOff += outputCountBytes.length;
    for (const out of outputs) {
      signedTxBytes.set(out, txOff);
      txOff += out.length;
    }
    for (const wit of witnesses) {
      signedTxBytes.set(wit, txOff);
      txOff += wit.length;
    }
    signedTxBytes.set(locktime, txOff);
    
    const signedTx = ethers.hexlify(signedTxBytes).slice(2);
    
    let txForHash = version.length + inputCount.length;
    for (const inp of inputs) txForHash += inp.length;
    txForHash += outputCountBytes.length;
    for (const out of outputs) txForHash += out.length;
    txForHash += locktime.length;
    
    const txNoWitness = new Uint8Array(txForHash);
    let nhOff = 0;
    txNoWitness.set(version, nhOff); nhOff += version.length;
    txNoWitness.set(inputCount, nhOff); nhOff += inputCount.length;
    for (const inp of inputs) {
      txNoWitness.set(inp, nhOff);
      nhOff += inp.length;
    }
    txNoWitness.set(outputCountBytes, nhOff); nhOff += outputCountBytes.length;
    for (const out of outputs) {
      txNoWitness.set(out, nhOff);
      nhOff += out.length;
    }
    txNoWitness.set(locktime, nhOff);
    
    const txHashBytes = sha256Hash(sha256Hash(txNoWitness));
    const txHashReversed = new Uint8Array(txHashBytes.length);
    for (let i = 0; i < txHashBytes.length; i++) {
      txHashReversed[i] = txHashBytes[txHashBytes.length - 1 - i];
    }
    const txHash = ethers.hexlify(txHashReversed).slice(2);

    return { signedTx, txHash };
  } catch (error) {
    console.error("Error building Bitcoin transaction:", error);
    return null;
  }
}

export async function buildSolanaTransaction(
  params: NonEvmTransactionParams,
  seedPhrase: string
): Promise<{ signedTx: string; txHash: string } | null> {
  try {
    const { address, secretKey } = deriveSolanaAddress(seedPhrase);
    
    if (params.from !== address) {
      console.error("Address mismatch");
      return null;
    }

    const lamports = Math.floor(parseFloat(params.amount) * 1000000000);
    const fromPubkey = bs58.decode(params.from);
    const toPubkey = bs58.decode(params.to);

    const blockhashResponse = await fetch(RPC_ENDPOINTS.solana, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLatestBlockhash",
        params: [{ commitment: "finalized" }],
      }),
    });
    const blockhashData = await blockhashResponse.json();
    const blockhash = blockhashData.result.value.blockhash;

    const SYSTEM_PROGRAM_ID = new Uint8Array(32);
    const numSignatures = 1;
    const header = new Uint8Array([numSignatures, 0, 1]);
    const accountKeys = new Uint8Array(32 * 3);
    accountKeys.set(fromPubkey, 0);
    accountKeys.set(toPubkey, 32);
    accountKeys.set(SYSTEM_PROGRAM_ID, 64);
    const recentBlockhashBytes = bs58.decode(blockhash);
    const instructionData = new Uint8Array(12);
    instructionData[0] = 2;
    const lamportsBigInt = BigInt(lamports);
    for (let i = 0; i < 8; i++) {
      instructionData[4 + i] = Number((lamportsBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }
    const instruction = new Uint8Array(5 + instructionData.length);
    instruction[0] = 2;
    instruction[1] = 2;
    instruction[2] = 0;
    instruction[3] = 1;
    instruction[4] = 12;
    instruction.set(instructionData, 5);

    const messageLength = header.length + 1 + accountKeys.length + recentBlockhashBytes.length + 1 + instruction.length;
    const message = new Uint8Array(messageLength);
    let offset = 0;
    message.set(header, offset); offset += header.length;
    message[offset] = 3; offset += 1;
    message.set(accountKeys, offset); offset += accountKeys.length;
    message.set(recentBlockhashBytes, offset); offset += recentBlockhashBytes.length;
    message[offset] = 1; offset += 1;
    message.set(instruction, offset);

    const signedMessage = nacl.sign.detached(message, secretKey);
    const signedTxBytes = new Uint8Array(1 + signedMessage.length + message.length);
    signedTxBytes[0] = 1;
    signedTxBytes.set(signedMessage, 1);
    signedTxBytes.set(message, 1 + signedMessage.length);

    const signedTx = bs58.encode(signedTxBytes);
    const txHash = bs58.encode(signedMessage);

    return { signedTx, txHash };
  } catch (error) {
    console.error("Error building Solana transaction:", error);
    return null;
  }
}

export async function buildTronTransaction(
  params: NonEvmTransactionParams,
  seedPhrase: string
): Promise<{ signedTx: string; txHash: string } | null> {
  try {
    const { address, privateKey } = deriveTronAddress(seedPhrase);
    
    if (params.from !== address) {
      console.error("Address mismatch");
      return null;
    }

    const amountSun = Math.floor(parseFloat(params.amount) * 1000000);

    const txResponse = await fetch(`${RPC_ENDPOINTS.tron}/wallet/createtransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_address: address,
        to_address: params.to,
        amount: amountSun,
      }),
    });

    if (!txResponse.ok) {
      throw new Error("Failed to create TRON transaction");
    }

    const unsignedTx = await txResponse.json();
    const txID = unsignedTx.txID;

    const signingKey = new ethers.SigningKey("0x" + privateKey);
    const txBytes = ethers.getBytes("0x" + txID);
    const signature = signingKey.sign(txBytes);
    const signatureHex = signature.r.slice(2) + signature.s.slice(2) + (signature.v === 27 ? "00" : "01");

    const signedTx = {
      ...unsignedTx,
      signature: [signatureHex],
    };

    return {
      signedTx: JSON.stringify(signedTx),
      txHash: txID,
    };
  } catch (error) {
    console.error("Error building TRON transaction:", error);
    return null;
  }
}

export async function broadcastBitcoinTransaction(signedTxHex: string): Promise<string | null> {
  try {
    const response = await fetch(`${RPC_ENDPOINTS.bitcoin}/tx`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: signedTxHex,
    });
    if (!response.ok) {
      const error = await response.text();
      console.error("Bitcoin broadcast error:", error);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error("Error broadcasting Bitcoin transaction:", error);
    return null;
  }
}

export async function broadcastSolanaTransaction(signedTxBase58: string): Promise<string | null> {
  try {
    const response = await fetch(RPC_ENDPOINTS.solana, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [signedTxBase58, { encoding: "base58" }],
      }),
    });
    const result = await response.json();
    if (result.error) {
      console.error("Solana broadcast error:", result.error);
      return null;
    }
    return result.result;
  } catch (error) {
    console.error("Error broadcasting Solana transaction:", error);
    return null;
  }
}

export async function broadcastTronTransaction(signedTxJson: string): Promise<string | null> {
  try {
    const signedTx = JSON.parse(signedTxJson);
    const response = await fetch(`${RPC_ENDPOINTS.tron}/wallet/broadcasttransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedTx),
    });
    const result = await response.json();
    if (!result.result) {
      console.error("TRON broadcast error:", result);
      return null;
    }
    return result.txid || signedTx.txID;
  } catch (error) {
    console.error("Error broadcasting TRON transaction:", error);
    return null;
  }
}

export async function signNonEvmTransaction(
  params: NonEvmTransactionParams,
  seedPhrase: string
): Promise<SignedTransaction | null> {
  let result: { signedTx: string; txHash: string } | null = null;

  switch (params.chainType) {
    case "bitcoin":
      result = await buildBitcoinTransaction(params, seedPhrase);
      break;
    case "solana":
      result = await buildSolanaTransaction(params, seedPhrase);
      break;
    case "tron":
      result = await buildTronTransaction(params, seedPhrase);
      break;
    default:
      console.error("Unsupported chain type:", params.chainType);
      return null;
  }

  if (!result) {
    return null;
  }

  return {
    chainType: params.chainType,
    signedTx: result.signedTx,
    txHash: result.txHash,
  };
}

export interface BroadcastResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export async function broadcastNonEvmTransaction(
  chainType: string,
  signedTx: string
): Promise<BroadcastResult> {
  try {
    let txHash: string | null = null;
    
    switch (chainType) {
      case "bitcoin":
        txHash = await broadcastBitcoinTransaction(signedTx);
        break;
      case "solana":
        txHash = await broadcastSolanaTransaction(signedTx);
        break;
      case "tron":
        txHash = await broadcastTronTransaction(signedTx);
        break;
      default:
        return { success: false, error: `Unsupported chain type: ${chainType}` };
    }
    
    if (txHash) {
      return { success: true, txHash };
    } else {
      return { success: false, error: "Failed to broadcast transaction" };
    }
  } catch (error) {
    console.error("Broadcast error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown broadcast error" };
  }
}
