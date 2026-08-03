export const DEPLOYED_ADDRESSES = {
  mockCNGN: "0x6B578aEfc9d9663327a8a677FFe07f272849f300",
  uniswapFactory: "0x7d715a64F4360305bCe47Db5472C74eB0F674c83",
  migrationRouter: "0x319bAd3efBC728eB4B432734C43bE2535992546a",
  tokenFactory: "0x467816F896E03919300431e23CB9136a6e26a48B",
  sampleToken: {
    address: "0x05eC70a7e2245B733f5fbfDA93a5C0D18960a320",
    curveAddress: "0xe347afB5cd6682439815503CCF403dB05f3ACBcf",
    symbol: "JOFF"
  }
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
