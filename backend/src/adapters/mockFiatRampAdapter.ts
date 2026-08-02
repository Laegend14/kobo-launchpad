import { FiatRampAdapter, DepositInstructions, WithdrawalReceipt } from './fiatRamp.interface';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// The fiat ramp is a simulator — deposits/withdrawals are ephemeral by design and
// never a source of truth (real value lives on-chain in cNGN). These local in-memory
// arrays replace the old shared db store so the adapter is fully self-contained.
interface DepositRecord {
  id: string;
  user_wallet: string;
  amount_naira: number;
  status: 'pending' | 'completed' | 'failed';
  tx_hash?: string;
  created_at: string;
}

interface WithdrawalRecord {
  id: string;
  user_wallet: string;
  amount_naira: number;
  status: 'pending' | 'completed' | 'failed';
  bank_reference?: string;
  created_at: string;
}

export class MockFiatRampAdapter implements FiatRampAdapter {
  private userBalances: Record<string, number> = {};
  private deposits: DepositRecord[] = [];
  private withdrawals: WithdrawalRecord[] = [];

  async requestDeposit(userWallet: string, amountNaira: number): Promise<DepositInstructions> {
    const depositId = `dep_${Math.random().toString(36).substring(2, 11)}`;
    const randomAcct = Math.floor(1000000000 + Math.random() * 9000000000).toString();

    const record: DepositRecord = {
      id: depositId,
      user_wallet: userWallet,
      amount_naira: amountNaira,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    this.deposits.push(record);

    return {
      depositId,
      virtualAccountName: "Kobo Deposit Vault",
      virtualAccountNumber: randomAcct,
      bankName: "Wema Bank / cNGN Ramp",
      amountNaira,
      expiresInMinutes: 30
    };
  }

  async confirmDeposit(depositId: string): Promise<{ txHash: string }> {
    const deposit = this.deposits.find(d => d.id === depositId);
    if (!deposit) {
      throw new Error(`Deposit ${depositId} not found`);
    }

    const txHash = `0xmock${Math.random().toString(16).substring(2)}${Date.now().toString(16)}`;
    deposit.status = 'completed';
    deposit.tx_hash = txHash;

    const walletLower = deposit.user_wallet.toLowerCase();
    this.userBalances[walletLower] = (this.userBalances[walletLower] || 0) + Number(deposit.amount_naira);

    // If backend owner private key is configured, perform on-chain MockCNGN faucetMint
    if (process.env.MOCKCNGN_OWNER_PRIVATE_KEY && process.env.MOCKCNGN_ADDRESS && process.env.BASE_SEPOLIA_RPC_URL) {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
        const wallet = new ethers.Wallet(process.env.MOCKCNGN_OWNER_PRIVATE_KEY, provider);
        const abi = ["function faucetMint(address to, uint256 amount) external"];
        const contract = new ethers.Contract(process.env.MOCKCNGN_ADDRESS, abi, wallet);
        const tx = await contract.faucetMint(deposit.user_wallet, ethers.parseEther(deposit.amount_naira.toString()));
        const receipt = await tx.wait();
        deposit.tx_hash = receipt.hash;
        return { txHash: receipt.hash };
      } catch (err) {
        console.warn("On-chain faucetMint skipped or failed, using simulated mint:", err);
      }
    }

    return { txHash };
  }

  async requestWithdrawal(userWallet: string, amountNaira: number): Promise<WithdrawalReceipt> {
    const walletLower = userWallet.toLowerCase();
    const currentBal = this.userBalances[walletLower] || 100000;

    if (currentBal < amountNaira) {
      throw new Error("Insufficient cNGN balance for redemption");
    }

    this.userBalances[walletLower] = currentBal - amountNaira;
    const withdrawalId = `wth_${Math.random().toString(36).substring(2, 11)}`;
    const bankRef = `NIP/${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    const record: WithdrawalRecord = {
      id: withdrawalId,
      user_wallet: userWallet,
      amount_naira: amountNaira,
      status: 'completed',
      bank_reference: bankRef,
      created_at: new Date().toISOString()
    };
    this.withdrawals.push(record);

    return {
      withdrawalId,
      userWallet,
      amountNaira,
      status: 'completed',
      bankReference: bankRef,
      timestamp: new Date().toISOString()
    };
  }

  async getBalance(walletAddress: string): Promise<number> {
    const walletLower = walletAddress.toLowerCase();
    if (this.userBalances[walletLower] === undefined) {
      this.userBalances[walletLower] = 250000; // Default simulated testnet starter balance ₦250,000 cNGN
    }
    return this.userBalances[walletLower];
  }
}
