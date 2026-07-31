export const DEPLOYED_ADDRESSES = {
  mockCNGN: "0xe634A98791a83951E3452B2c8B1072e98C03A93F",
  uniswapFactory: "0x5F7ddCc6b96FDbad152022be372AE4d35cF145ae",
  migrationRouter: "0x844949d930b1A9a34e9B9D2a5E1F883a27399634",
  tokenFactory: "0xA1E20bed244Ddd60486195e917EE8D741Fe28618",
  sampleToken: {
    address: "0x9EB4d17b401AC28024ee557D5D1947cF0Ddcd301",
    curveAddress: "0xe18BB79fC5C0C9759B3A3e6C273c80D010a3F503",
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
  "function tokenToCurve(address token) external view returns (address)"
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
