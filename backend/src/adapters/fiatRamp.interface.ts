export interface DepositInstructions {
  depositId: string;
  virtualAccountName: string;
  virtualAccountNumber: string;
  bankName: string;
  amountNaira: number;
  expiresInMinutes: number;
}

export interface WithdrawalReceipt {
  withdrawalId: string;
  userWallet: string;
  amountNaira: number;
  status: 'pending' | 'completed';
  bankReference: string;
  timestamp: string;
}

export interface FiatRampAdapter {
  requestDeposit(userWallet: string, amountNaira: number): Promise<DepositInstructions>;
  confirmDeposit(depositId: string): Promise<{ txHash: string }>;
  requestWithdrawal(userWallet: string, amountNaira: number): Promise<WithdrawalReceipt>;
  getBalance(walletAddress: string): Promise<number>;
}
