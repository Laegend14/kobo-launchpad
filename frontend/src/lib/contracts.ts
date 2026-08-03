export const DEPLOYED_ADDRESSES = {
  mockCNGN: "0xeC30Ac1f9707904994A3a0b1124087636491E465",
  uniswapFactory: "0x48bFCb3aFD25BB755A67dF63ad4c1Ba28865fbBC",
  migrationRouter: "0x09C1F9fa12a4d5dD2E18817E77d23Ebf2Ab4A6c8",
  tokenFactory: "0xFE7B8231664D557D49aC0E3A58EE03D3DD1797b6"
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
