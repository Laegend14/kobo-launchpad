// Arc Testnet (chain id 5042002) deployment. These are the addresses the app reads
// through the Arc RPC — they MUST stay on the same chain as CHAIN_RPC_URL in
// onchain.ts, or the factory registry reads resolve to empty and no token is ever
// discovered. Recovered from the pre-Base-Sepolia Arc deployment (2026-08-03).
export const DEPLOYED_ADDRESSES = {
  mockCNGN: "0x10985673765c103549778f2FBFca2506c158bf45",
  uniswapFactory: "0x7688265fecAA1B23D39C2e3840B310a66f5E06eb",
  migrationRouter: "0x79b238A637cab75512751f249415DdBe9fA64037",
  tokenFactory: "0x28FAAE476b6A6DBEEb01D2ff3be0728da6b520eC"
};

export const MOCK_CNGN_ABI = [
  "function faucetMint(address to, uint256 amount) external",
  "function faucetBurn(address from, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
];

export const TOKEN_FACTORY_ABI = [
  "function launchToken(string name, string symbol, string metadataURI) external returns (address token, address curve)",
  "function getAllTokensCount() external view returns (uint256)",
  "function allTokens(uint256 index) external view returns (address)",
  "function tokenToCurve(address token) external view returns (address)",
  "function tokenMetadataURI(address token) external view returns (string)"
];

export const BONDING_CURVE_ABI = [
  "function getCurrentPrice() external view returns (uint256)",
  "function quoteBuy(uint256 cngnIn) external view returns (uint256 tokensOut)",
  "function quoteSell(uint256 tokensIn) external view returns (uint256 cngnOut)",
  "function buy(uint256 cngnIn, uint256 minTokensOut) external",
  "function sell(uint256 tokensIn, uint256 minCngnOut) external",
  "function realCngnReserve() external view returns (uint256)",
  "function migrated() external view returns (bool)",
  "function uniswapPair() external view returns (address)"
];
