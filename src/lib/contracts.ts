export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_RPC = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

export const CNGN_ADDRESS = process.env.NEXT_PUBLIC_CNGN_ADDRESS || '0x0000000000000000000000000000000000000000';
export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000';

export const MOCK_CNGN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function faucet(address to)",
  "function mint(address to, uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event FaucetClaimed(address indexed recipient, uint256 amount)"
];

export const KOBO_BONDING_CURVE_ABI = [
  "function allTokensLength() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function tokens(address) view returns (address tokenAddress, string name, string symbol, string imageUri, string description, address creator, uint256 realCngn, uint256 realTokens, uint256 virtualCngn, uint256 virtualTokens, bool graduated, uint256 createdAt, uint256 totalTrades)",
  "function createToken(string name, string symbol, string imageUri, string description) returns (address)",
  "function buy(address tokenAddr, uint256 cngnIn, uint256 minTokensOut) returns (uint256)",
  "function sell(address tokenAddr, uint256 tokensIn, uint256 minCngnOut) returns (uint256)",
  "function getAmountOutTokens(address tokenAddr, uint256 cngnIn) view returns (uint256)",
  "function getAmountOutCngn(address tokenAddr, uint256 tokensIn) view returns (uint256)",
  "event TokenCreated(address indexed tokenAddress, string name, string symbol, string imageUri, string description, address indexed creator, uint256 timestamp)",
  "event Trade(address indexed tokenAddress, address indexed trader, bool isBuy, uint256 cngnAmount, uint256 tokenAmount, uint256 currentPriceKobo, uint256 timestamp)",
  "event TokenGraduated(address indexed tokenAddress, uint256 finalCngnLiquidity, uint256 dexTokens, uint256 timestamp)"
];

export const KOBO_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function imageUri() view returns (string)",
  "function description() view returns (string)",
  "function creator() view returns (address)",
  "function bondingCurve() view returns (address)"
];
