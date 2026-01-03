# Pico Hardware Wallet

## Overview

A multi-chain cryptocurrency hardware wallet application that supports both hardware wallet connections (Ledger, Raspberry Pi Pico) and software wallet functionality. The app enables users to manage crypto assets across multiple blockchains including Ethereum, Bitcoin, Solana, and various EVM-compatible chains. Key features include secure PIN-based authentication, BIP44 key derivation, transaction signing, WalletConnect integration for DApp connectivity, and real-time balance tracking via blockchain APIs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: React Context (WalletContext, ThemeContext) combined with TanStack Query for server state
- **UI Components**: Radix UI primitives wrapped with shadcn/ui styling conventions
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Animations**: Framer Motion for subtle UI transitions

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **API Pattern**: RESTful endpoints with WebSocket support for real-time bridge functionality
- **Build**: esbuild for server bundling, Vite for client
- **Structure**: Shared code between client/server in `/shared` directory for type safety

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM for schema management and queries
- **Client Storage**: IndexedDB (via custom clientStorage abstraction) for wallet data, transactions, and preferences
- **Encryption**: PBKDF2 key derivation with AES-GCM encryption for seed phrase storage on client

### Hardware Wallet Integration
- **Ledger**: WebHID API via @ledgerhq/hw-transport-webhid
- **Raspberry Pi Pico**: Web Serial API for USB communication with custom firmware
- **Mobile USB**: Capacitor plugin for Android USB serial support
- **Simulated Mode**: In-memory wallet for development/testing

### Blockchain Integration
- **EVM Chains**: ethers.js v6 for transaction building, signing, and RPC calls
- **Non-EVM Chains**: Custom implementations for Bitcoin, Solana, Tron using native crypto libraries
- **Key Derivation**: BIP39/BIP44 standard paths with support for ed25519 (Solana, Polkadot) and secp256k1 (Bitcoin, Ethereum)
- **Price Data**: DefiLlama and CoinGecko APIs with local caching

### Security Model
- PIN-based device unlock with configurable length (4-6 digits)
- Session timeout with automatic lock (5 minutes default)
- Seed phrases encrypted at rest, decrypted only during active session
- Hardware signing ensures private keys never leave the device

## External Dependencies

### Blockchain Services
- **RPC Endpoints**: LlamaRPC (Ethereum), Binance (BSC), official nodes for other chains
- **Price APIs**: DefiLlama, CoinGecko for asset pricing
- **Block Explorers**: Etherscan-compatible APIs for transaction history

### Third-Party Libraries
- **Crypto**: @noble/ed25519, @noble/hashes, tweetnacl for cryptographic operations
- **Wallet Integration**: @walletconnect/web3wallet for DApp connections
- **Hardware**: @ledgerhq packages for Ledger device communication

### Mobile Platform
- **Capacitor**: Cross-platform native functionality (Android USB serial, clipboard)
- **Target**: Android app with USB OTG support for Pico connection

### Development Tools
- **Replit Plugins**: Runtime error overlay, dev banner, cartographer for development experience
- **TypeScript**: Strict mode with path aliases (@/, @shared/)