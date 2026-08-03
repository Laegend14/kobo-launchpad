# KOBO Launchpad 🇳🇬

> **Naira-Native (cNGN) Web3 Memecoin Protocol & Bonding Curve AMM**

![KOBO Logo](./frontend/public/kobo-logo.png)

---

## 🌟 Overview

**KOBO Launchpad** is a decentralized, Naira-native memecoin protocol built for Web3. It allows users to launch memecoins priced and settled in **cNGN** (Nigeria's regulated Naira stablecoin) with 100% fair-launch bonding curves.

When a launched token raises **50,000 cNGN**, its smart contract automatically locks reserve liquidity and triggers automated migration to a **Uniswap V2 AMM pool**.

---

### ✨ Key Features

- **🇳🇬 Naira-Native Settlement**: Prices and trades settled 1:1 in cNGN (Nigerian Naira stablecoin).
- **📈 Constant-Product Bonding Curves**: Fair pricing formula (\(k = x \cdot y\)) preventing presales or insider allocations.
- **🛡️ Automated DEX Migration**: Automatic liquidity lock and migration to Uniswap V2 AMM pools upon reaching 50,000 cNGN raised.
- **🏦 Instant NGN Bank Ramp Simulator**: Seamless 1:1 NGN bank deposit and withdrawal simulation for quick onboarding.
- **📊 DexScreener/Birdeye Analytics**: Live Market Cap, FDV, 24h Volume, Buy/Sell Ratio, VWAP, Price Performance, Holder Distribution, and Security Audits.
- **🔐 Embedded Web3 Wallets**: Dynamic Auth SDK integration for social & email logins and non-custodial wallet creation.

---

## 📜 Deployed Smart Contracts (Arc Testnet - Chain ID `5042002`)

| Contract | Address | Explorer |
| :--- | :--- | :--- |
| **cNGN Stablecoin (Mock)** | `0xeC30Ac1f9707904994A3a0b1124087636491E465` | [View on ArcScan](https://testnet.arcscan.app/address/0xeC30Ac1f9707904994A3a0b1124087636491E465) |
| **Token Factory** | `0xFE7B8231664D557D49aC0E3A58EE03D3DD1797b6` | [View on ArcScan](https://testnet.arcscan.app/address/0xFE7B8231664D557D49aC0E3A58EE03D3DD1797b6) |
| **Migration Router** | `0x09C1F9fa12a4d5dD2E18817E77d23Ebf2Ab4A6c8` | [View on ArcScan](https://testnet.arcscan.app/address/0x09C1F9fa12a4d5dD2E18817E77d23Ebf2Ab4A6c8) |

---

## 🏗️ Repository Architecture

```text
kobo-launchpad/
├── contracts/       # Hardhat TypeScript Smart Contracts & Unit Tests
│   ├── src/         # BondingCurve.sol, TokenFactory.sol, MigrationRouter.sol
│   └── test/        # Bonding curve & DEX migration integration tests
└── frontend/        # Next.js 14 App Router, Tailwind CSS & Real-Time Metrics
    └── src/         # Components, Pages & Metrics Math Engine
```

---

## 🔄 State Synchronization — 100% On-Chain, Zero Infrastructure

KOBO has **no backend, no database, and no application server.** The Arc blockchain is the
single source of truth, and **every browser reads the same chain state directly** — that is
what makes a memecoin created on account A appear on account B within one sync interval.

- **Discovery = on-chain registry enumeration.** The client calls
  `getAllTokensCount()` → `allTokens(i)` → `tokenToCurve(token)` and reads each token's
  `name()`, `symbol()`, and `tokenMetadataURI()` plus each curve's live reserves — all via
  **paced (≤3 concurrent), retried `eth_call` state reads**. It never uses
  `queryFilter(0,"latest")` log scans, which fail at Arc's ~55M-block height and caused
  tokens to be invisible across accounts.
- **Metadata (image) = on-chain.** The image is a **pasted URL** stored in the factory's
  `tokenMetadataURI` at launch. No upload host, no file store, no DB — every client reads
  the same URL from the same chain.
- **Trades = live incremental logs.** Price / raised / migrated are always exact (read from
  live curve state). Trade *history* is best-effort: each client tails recent `Trade`
  events from a bounded block window with a per-curve cursor, de-duplicating by
  `tx_hash + side + amounts` — never scanned from block 0.
- **Liquidity metrics** (market cap, price, raised cNGN, bonding-curve progress) are derived
  identically from live on-chain curve state + the same trade history — **identical math on
  every account**.
- A **15s sync interval** is the convergence floor; `BroadcastChannel('kobo_sync')` gives
  same-device tabs an instant hint. Hints never write optimistic cross-account values.
- **The fiat NGN ramp is fully client-side** (localStorage balances + on-chain
  `faucetMint`), so it needs no backend either.

---

## ⚡ Quickstart & Local Setup

### 1. Clone Repository & Install Dependencies

```bash
git clone https://github.com/YOUR_USERNAME/kobo-launchpad.git
cd kobo-launchpad
```

### 2. Run Smart Contract Tests

```bash
cd contracts
npm install
npm test
```

### 3. Run the Frontend App

```bash
cd frontend
npm install
npm run dev
```
> Open `http://localhost:3000` in your browser. No backend or database required.

---

## 🚀 Live Deployment Guide

### Deploying to Vercel

1. Push this repository to **GitHub**.
2. Go to [Vercel Dashboard](https://vercel.com/new) and click **Import Repository**.
3. Set the **Root Directory** to `frontend`.
4. Click **Deploy**.

No environment variables are required — the app is fully on-chain. Gas tokens (USDC) for
testnet transactions come from Circle's official Arc faucet at **faucet.circle.com**.

---

## 📄 License

MIT License © 2026 KOBO Protocol Team
