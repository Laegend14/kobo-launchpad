# 🇳🇬 KOBO LAUNCHPAD (Base Sepolia)
> **The Premier Memecoin Launchpad where cNGN (Naira) is the Base Currency.**

Built for the Nigerian and African Web3 community. Launch native meme coins on Base with zero rugs, a fair bonding curve, and instant Naira deposits via Paystack.

---

## ⚡ Live Base Sepolia Deployments

| Contract | Address | Explorer Link |
| :--- | :--- | :--- |
| **MockCNGN (Compliant Naira)** | `0xcFF8Fa5dA1bA6c5085F1fdcDc7C27164C0B565Ec` | [View on Basescan](https://sepolia.basescan.org/address/0xcFF8Fa5dA1bA6c5085F1fdcDc7C27164C0B565Ec) |
| **KoboBondingCurve (Factory & AMM)** | `0xE662b31B2e01302064cDc47906AB96177B0585E6` | [View on Basescan](https://sepolia.basescan.org/address/0xE662b31B2e01302064cDc47906AB96177B0585E6) |
| **Treasury & Relayer Wallet** | `0x959C2c33419b009ce02113BFAee45d4ae72981f8` | [View on Basescan](https://sepolia.basescan.org/address/0x959C2c33419b009ce02113BFAee45d4ae72981f8) |

---

## 💎 Tokenomics & Bonding Curve Architecture

* **Total Supply per Meme Coin**: `1,000,000,000` (1 Billion tokens).
* **Curve Supply for Trading**: `800,000,000` (80% fair launch, zero dev dump).
* **Reserved DEX Liquidity**: `200,000,000` (20% automatically migrated to DEX upon graduation).
* **Graduation Liquidity Target**: **10,000,000 cNGN** (~$6,500 USD).
* **Graduation Market Cap (FDV)**: **25,000,000 cNGN** (~$16,250 USD).
* **Creator Incentive**: 
  * Earns **0.35% royalty** on every buy and sell on the curve.
  * Earns a lump-sum **500,000 cNGN "Odogwu Bonus"** when the token hits 100% and graduates.
* **Platform Treasury Fee**: **1.00%** on trades (covers gas sponsorships, relayer operational costs, and buybacks).

---

## 🎨 Cultural Integration Matrix

| Culture | Visual Motif | Placement & Meaning |
| :--- | :--- | :--- |
| **Tiv (Benue)** | **A'nger** textile stripes (Iconic black & white woven pattern) | Modern monochrome top ribbon, card borders, and dividers. |
| **Igbo (South East)** | **Isiagu** (Crowned Lion) & Royal Beads | Crown badge for the #1 trending token (**"Odogwu Tier"**). |
| **Yoruba (South West)** | **Aso-Oke & Àdìrẹ** deep indigo/bronze; **Gangan** (Talking Drum) | Volume surge indicators, Owambe celebration styles, and ambient glows. |
| **Hausa (North)** | **Arewa Knot** (*Daban Arewa*) | Cryptographic security emblems (**"Arewa Knot Lock / Zero Rug"**). |
| **Street Naija** | Authentic Pidgin microcopy | *"Pack Am"*, *"Cash Out"*, *"Cook New Coin"*, *"Oga At The Top"*, *"Level Don High"*, *"E Don Japa"*. |

---

## 💳 Payment Gateway (Paystack) & Wallet (Dynamic)

1. **Paystack Onramp**:
   * Users click **"Fund Bag"**, choose their Naira amount (e.g. ₦5,000, ₦20,000, ₦100,000).
   * Paystack Inline modal launches with test card or bank transfer checkout.
   * On payment success, backend relayer signs a transfer and dispatches **cNGN (1:1)** straight to the user's Dynamic wallet on Base Sepolia.
2. **Instant Testnet Faucet**:
   * Users can also click **"Claim ₦500k Faucet"** to immediately get 500,000 cNGN to test trading without spending any money.
3. **Dynamic Auth**:
   * Frictionless social login (Google, X / Twitter) or native Web3 (MetaMask, Rabby, Rainbow).
   * Generates an embedded smart wallet for non-crypto natives.

---

## 🚀 Running the Project

```bash
# 1. Start development server
npm run dev

# 2. Compile smart contracts
npm run compile

# 3. Deploy to Base Sepolia
npm run deploy:contracts
```
