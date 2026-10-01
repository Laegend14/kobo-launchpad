# 🇳🇬 KOBO LAUNCHPAD
> **The Premier Fair-Launch Memecoin Protocol on Base Powered by cNGN (Naira)**

KOBO is a decentralized, fair-launch memecoin launchpad on Base (Ethereum Layer 2) where all bonding curves, trading pairs, and valuations are natively denominated in **cNGN (Compliant Nigerian Naira)**.

---

## 💡 Why KOBO Was Built

While memecoins have become the dominant cultural onboarding funnel for Web3 globally, the entire ecosystem remains heavily gatekept behind foreign currencies (USD, SOL, ETH).

In Nigeria—the highest crypto-adoption nation in Africa and one of the largest peer-to-peer crypto markets globally—retail traders and everyday creators face steep systemic obstacles:
- **FX Friction**: Navigating P2P platforms to purchase USDT just to trade a viral meme.
- **Dollar Card Restrictions**: Stringent banking limits and card bans on international transactions.
- **Complex Wallet Onboarding**: Seed phrase friction that repels non-crypto natives.
- **Predatory Presales & Rug Pulls**: Unvetted Telegram launches and dev dumps.

**KOBO was built to bridge viral African internet culture with decentralized finance.** It gives anyone the ability to launch or trade viral memecoins in seconds using their domestic currency (Naira) with instant bank/card onramps, zero seed-phrase hurdles, and mathematical rug-pull protection.

---

## 🎯 Problems KOBO Aims to Solve

### 1. Eliminating Foreign Exchange (FX) Barriers
Most retail users think and earn in Naira. Forcing them to convert NGN &rarr; USDT &rarr; SOL or ETH incurs heavy slippage and multiple conversion fees. KOBO makes **cNGN** the base liquidity pair for all tokens on the bonding curve.

### 2. Zero Presales & Mathematical Rug Protection
Traditional token launches suffer from developer rug pulls where creators dump presale allocations or drain initial liquidity pools.
- **Fair Launch**: 100% of tokens are sold on a transparent constant-product virtual bonding curve ($x \cdot y = k$).
- **No Team Allocations**: Creators buy through the curve like every other participant.
- **Automated AMM Migration**: When the bonding curve hits 100% of its target (**10,000,000 cNGN**), liquidity is automatically locked and migrated to the **Kobo AMM DEX Router**.

### 3. High Gas Fees
By deploying on **Base L2**, transaction gas fees are fractions of a cent (< ₦10), making micro-trades and high-frequency swaps accessible to anyone.

### 4. Frictionless Onboarding for Web2 Natives
Through **Dynamic Auth** and **Paystack**, users can log in using their Google or X (Twitter) accounts, create an embedded smart wallet automatically, and fund their bag via local bank transfer or debit card.

---

## 🧭 Core Thesis

> **Culture drives adoption, and domestic currency unlocks mass participation.**

Memecoins are fundamentally social assets fueled by community sentiment, internet humor, and shared cultural moments. By aligning the trading currency with the domestic unit of account (Naira / Kobo), embedding native fiat rails (Paystack), and celebrating African pop culture, KOBO creates the fastest, safest, and most viral gateway into the on-chain economy.

---

## ⚡ Live Base Sepolia Smart Contracts

| Contract | Address | Basescan Explorer |
| :--- | :--- | :--- |
| **MockCNGN (Compliant Naira)** | `0xDdc8B9e1Afdcc3136212c8642d253285c2Bc237c` | [View Contract](https://sepolia.basescan.org/address/0xDdc8B9e1Afdcc3136212c8642d253285c2Bc237c) |
| **KoboBondingCurve (Factory & Engine)** | `0x50300237A5c8AFb7d7D56F8c08FBaa22EB92E203` | [View Contract](https://sepolia.basescan.org/address/0x50300237A5c8AFb7d7D56F8c08FBaa22EB92E203) |
| **KoboAmmFactory (DEX Factory)** | `0x01aEA417df786883364721Af2A8238bf02d1AD2F` | [View Contract](https://sepolia.basescan.org/address/0x01aEA417df786883364721Af2A8238bf02d1AD2F) |
| **KoboAmmRouter (DEX Swaps & Pools)** | `0xA862739c8755fa83FE1B75021Af6f7D438EC6c80` | [View Contract](https://sepolia.basescan.org/address/0xA862739c8755fa83FE1B75021Af6f7D438EC6c80) |

---

## 💎 Bonding Curve Mechanics & Tokenomics

- **Total Token Supply**: `1,000,000,000` (1 Billion tokens per meme coin).
- **Curve Supply Available for Sale**: `800,000,000` (80% fair-launch trading).
- **Reserved DEX Liquidity**: `200,000,000` (20% automatically paired with cNGN upon graduation).
- **Graduation Target**: `10,000,000 cNGN` (~$6,500 USD).
- **Creator Rewards**:
  - Earns **0.35% royalty** on every buy and sell on the curve.
  - Receives a **500,000 cNGN "Odogwu Bonus"** when the token hits 100% and graduates.
- **Protocol Fee**: **1.00%** on trades for relayer operational gas and infrastructure support.

---

## 🛠️ Architecture Stack

- **Frontend**: Vanilla JavaScript (ES6+), High-Performance Canvas Graphics, Responsive Glassmorphism UI.
- **Backend**: Node.js HTTP Server (`server.js`), Vercel Serverless Functions (`api/index.js`).
- **Database (Dual-Mode Persistence)**:
  - **Cloud Firestore**: Real-time scalable document database for tokens, trades, and fiat ledgers.
  - **Local SQLite (`node:sqlite`)**: Offline fallback engine for zero-dependency local development.
- **Smart Contracts**: Solidity `^0.8.20`, Ethers.js v6.
- **Authentication**: Dynamic Labs Embedded Web3 & Social Login.
- **Fiat Gateway**: Paystack Inline API (Naira Debit Card & Bank Transfer).

---

## 🚀 How to Run the Project

### 1. Prerequisites
- **Node.js**: Version `>= 22.5.0` (required for native `node:sqlite`).
- **Git** installed on your system.

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/kobo-launchpad.git
cd kobo-launchpad
npm install
```

### 3. Environment Configuration
Create a `.env.local` file in the root directory (refer to `.env.example`):
```env
# Blockchain
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Deployed Smart Contracts
NEXT_PUBLIC_CNGN_ADDRESS=0xDdc8B9e1Afdcc3136212c8642d253285c2Bc237c
NEXT_PUBLIC_FACTORY_ADDRESS=0x50300237A5c8AFb7d7D56F8c08FBaa22EB92E203
NEXT_PUBLIC_AMM_FACTORY_ADDRESS=0x01aEA417df786883364721Af2A8238bf02d1AD2F
NEXT_PUBLIC_AMM_ROUTER_ADDRESS=0xA862739c8755fa83FE1B75021Af6f7D438EC6c80

# Dynamic Auth
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=56723438-864e-4a04-a970-e168c8cee6b5

# Paystack Gateway
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...

# Firebase Cloud Firestore
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 4. Running Locally
Start the development server:
```bash
npm run dev
```
Open your browser and navigate to:
```
http://localhost:3000
```

### 5. Smart Contract Compilation & Deployment
To compile the Solidity smart contracts:
```bash
npm run compile
```

To redeploy clean smart contracts to Base Sepolia (with 0 starter tokens):
```bash
npm run deploy:contracts
```

### 6. Deploying to Vercel
1. Push your repository to GitHub (ensure `.env.local` is ignored).
2. Import the project into the [Vercel Dashboard](https://vercel.com).
3. Under **Project Settings &rarr; Environment Variables**, paste all values from `.env.local`.
4. Click **Deploy**. Vercel will build using [`vercel.json`](./vercel.json) and serve static assets via Edge CDN with serverless API routes.
