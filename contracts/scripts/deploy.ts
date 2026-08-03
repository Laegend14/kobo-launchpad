import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("==================================================");
  console.log("Deploying Kobo Launchpad Smart Contracts");
  console.log("Deployer Wallet Address:", deployer ? deployer.address : "Default Hardhat Account");
  console.log("==================================================");

  // 1. Deploy MockCNGN
  console.log("\n1. Deploying MockCNGN...");
  const MockCNGN = await ethers.getContractFactory("MockCNGN");
  const mockCNGN = await MockCNGN.deploy();
  await mockCNGN.waitForDeployment();
  const cngnAddress = await mockCNGN.getAddress();
  console.log("✔ MockCNGN deployed at:", cngnAddress);

  // 2. Deploy MockUniswapV2Factory
  console.log("\n2. Deploying MockUniswapV2Factory...");
  const MockUniswapV2Factory = await ethers.getContractFactory("MockUniswapV2Factory");
  const factory = await MockUniswapV2Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✔ MockUniswapV2Factory deployed at:", factoryAddress);

  // 3. Deploy MigrationRouter
  console.log("\n3. Deploying MigrationRouter...");
  const MigrationRouter = await ethers.getContractFactory("MigrationRouter");
  const router = await MigrationRouter.deploy(cngnAddress, factoryAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("✔ MigrationRouter deployed at:", routerAddress);

  // 4. Deploy TokenFactory
  console.log("\n4. Deploying TokenFactory...");
  const TokenFactory = await ethers.getContractFactory("TokenFactory");
  const tokenFactory = await TokenFactory.deploy(cngnAddress, routerAddress);
  await tokenFactory.waitForDeployment();
  const factoryContractAddress = await tokenFactory.getAddress();
  console.log("✔ TokenFactory deployed at:", factoryContractAddress);

  // 5. Deployment complete - No initial memecoins created
  console.log("\n5. Contract deployment complete. Zero initial memecoins deployed.");

  const deploymentData = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    cngnAddress,
    factoryAddress,
    routerAddress,
    tokenFactoryAddress: factoryContractAddress,
    deployedAt: new Date().toISOString()
  };

  const outputPath = path.join(__dirname, "../deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));

  // Update frontend contracts.ts configuration
  const frontendConfigPath = path.join(__dirname, "../../frontend/src/lib/contracts.ts");
  const frontendContent = `export const DEPLOYED_ADDRESSES = {
  mockCNGN: "${cngnAddress}",
  uniswapFactory: "${factoryAddress}",
  migrationRouter: "${routerAddress}",
  tokenFactory: "${factoryContractAddress}"
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
`;
  fs.writeFileSync(frontendConfigPath, frontendContent);

  console.log("\nSaved deployment artifact to:", outputPath);
  console.log("Updated frontend contract configuration at:", frontendConfigPath);
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
