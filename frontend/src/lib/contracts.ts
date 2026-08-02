export const DEPLOYED_ADDRESSES = {
  mockCNGN: "0x21c494f10E7a10C1792D0Ba68bC8b8cFC6E554C7",
  uniswapFactory: "0xc6F6eA8701Bb27aAf756b83B5948E540f3401CE2",
  migrationRouter: "0x474c3422E93830cdE64c85AE842150497e8216D8",
  tokenFactory: "0x4Ca9A69ff8dBF37819d21DB37260142416796D72",
  sampleToken: {
    address: "0x54Dc524dC245E7bCD39ca9d6F6Fd4A04A1130cE2",
    curveAddress: "0x864c5F6a8EC74eC2e744599F1b31EDbA02fF1532",
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
