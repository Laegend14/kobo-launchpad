import { ethers } from 'ethers';

export const TOKEN_FACTORY_ADDRESS = "0x4Ca9A69ff8dBF37819d21DB37260142416796D72";
export const CNGN_ADDRESS = "0x21c494f10E7a10C1792D0Ba68bC8b8cFC6E554C7";
export const ARC_TESTNET_CHAIN_ID = "0x4cef52"; // 5042002 in hex (verified: 5042002 = 0x4CEF52)
export const ARC_RPC_URL = "https://rpc.testnet.arc.io";

export const TOKEN_FACTORY_ABI = [
  "function launchToken(string name, string symbol, string metadataURI) external returns (address token, address curve)",
  "function getAllTokensCount() external view returns (uint256)",
  "function allTokens(uint256 index) external view returns (address)",
  "function tokenToCurve(address token) external view returns (address)",
  "function isLaunchedToken(address token) external view returns (bool)",
  "event TokenLaunched(address indexed token, address indexed curve, string name, string symbol, string metadataURI, address indexed creator, uint256 timestamp)"
];

export const CNGN_ABI = [
  "function faucetMint(address to, uint256 amount) external",
  "function faucetBurn(address from, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

export const BONDING_CURVE_ABI = [
  "function buy(uint256 cngnIn, uint256 minTokensOut) external",
  "function sell(uint256 tokensIn, uint256 minCngnOut) external",
  "function getCurrentPrice() external view returns (uint256)",
  "function quoteBuy(uint256 cngnIn) external view returns (uint256)",
  "function quoteSell(uint256 tokensIn) external view returns (uint256)",
  "function virtualCngnReserve() external view returns (uint256)",
  "function virtualTokenReserve() external view returns (uint256)",
  "function realCngnReserve() external view returns (uint256)",
  "function migrated() external view returns (bool)",
  "event Trade(address indexed trader, bool isBuy, uint256 cngnAmount, uint256 tokenAmount, uint256 price, uint256 timestamp)"
];

export const MEMECOIN_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

export interface OnChainLaunchResult {
  tokenAddress: string;
  curveAddress: string;
  txHash: string;
  creatorWallet: string;
}

/**
 * Ensures connected Web3 wallet is switched to Arc Testnet (Chain ID 5042002)
 */
export async function ensureArcTestnetNetwork(): Promise<boolean> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    return false;
  }

  const ethereum = (window as any).ethereum;

  try {
    const currentChainId = await ethereum.request({ method: 'eth_chainId' });
    if (currentChainId && (currentChainId.toLowerCase() === ARC_TESTNET_CHAIN_ID.toLowerCase() || currentChainId === '0x4cef52')) {
      return true;
    }

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_TESTNET_CHAIN_ID }],
      });
      return true;
    } catch (switchErr: any) {
      if (switchErr.code === 4902 || switchErr?.data?.originalError?.code === 4902) {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ARC_TESTNET_CHAIN_ID,
            chainName: 'Arc Testnet',
            nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
            rpcUrls: [
              'https://rpc.testnet.arc.io',
              'https://rpc.blockdaemon.testnet.arc.io',
              'https://rpc.drpc.testnet.arc.io',
              'https://rpc.quicknode.testnet.arc.io'
            ],
            blockExplorerUrls: ['https://testnet.arcscan.app']
          }]
        });
        return true;
      }
      return false;
    }
  } catch (err: any) {
    console.warn("Network switch notice:", err.message || err);
    return false;
  }
}

/**
 * Executes on-chain smart contract deployment on Arc Testnet via TokenFactory.sol with gas limit fallback
 */
export async function launchTokenOnChain(
  name: string,
  symbol: string,
  metadataUri: string
): Promise<OnChainLaunchResult> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error(
      "No Web3 wallet detected. Install MetaMask (or another Arc-compatible wallet) and connect it to launch a token on-chain."
    );
  }

  try {
    await ensureArcTestnetNetwork();

    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const creatorWallet = await signer.getAddress();

    const factoryContract = new ethers.Contract(
      TOKEN_FACTORY_ADDRESS,
      TOKEN_FACTORY_ABI,
      signer
    );

    console.log(`[On-Chain] Launching token on Arc Testnet via TokenFactory (${TOKEN_FACTORY_ADDRESS})...`);

    // Sanitize metadataUri for EVM calldata — if it's a huge base64 Data URL or >200 chars,
    // convert to a compact URI to stay within EVM 128KB transaction calldata limits.
    let cleanMetadataUri = metadataUri || "/jollof.png";
    if (cleanMetadataUri.startsWith('data:') || cleanMetadataUri.length > 200) {
      cleanMetadataUri = "/jollof.png";
    }

    // Use explicit gasLimit: 3500000 to bypass estimateGas revert issues on RPC providers
    const tx = await factoryContract.launchToken(name, symbol, cleanMetadataUri, {
      gasLimit: 3500000
    });
    console.log(`[On-Chain] Tx sent: ${tx.hash}. Waiting for block confirmation...`);

    const receipt = await tx.wait();
    console.log(`[On-Chain] Block confirmed in tx ${receipt.hash}`);

    let tokenAddress: string | undefined;
    let curveAddress: string | undefined;

    if (receipt && receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const parsed = factoryContract.interface.parseLog({
            topics: [...log.topics],
            data: log.data
          });
          if (parsed && parsed.name === 'TokenLaunched') {
            tokenAddress = parsed.args.token;
            curveAddress = parsed.args.curve;
            break;
          }
        } catch (e) {
          // Ignore unparsed logs
        }
      }
    }

    if (!tokenAddress || !curveAddress) {
      // The tx confirmed but we could not read the TokenLaunched event. Rather than
      // fabricate an address (which would create a phantom token no other user can
      // discover on-chain), surface the tx hash so the launch can be reconciled.
      throw new Error(
        `Launch transaction ${receipt.hash} confirmed but the TokenLaunched event could not be read. ` +
        `Do not retry — check the explorer for the deployed token before launching again.`
      );
    }

    return {
      tokenAddress,
      curveAddress,
      txHash: receipt.hash,
      creatorWallet
    };
  } catch (err: any) {
    const isUserRejection = err?.code === 4001 ||
      err?.code === 'ACTION_REJECTED' ||
      /rejected|denied|user rejected|cancelled/i.test(err?.message || '');

    if (isUserRejection) {
      throw new Error("Transaction signature was rejected or cancelled in your wallet.");
    }

    // Do NOT fabricate a fake token address on failure. A phantom address written to
    // local state would never be discoverable on-chain by other users (the root cause
    // of "my token doesn't show up for others"). Propagate the real error instead.
    console.error("[On-Chain Launch Error]:", err?.message || err);
    throw new Error(err?.shortMessage || err?.reason || err?.message || "On-chain token launch failed.");
  }
}

/**
 * Mints ERC20 cNGN stablecoin on-chain on Arc Testnet
 */
export async function mintCngnOnChain(toAddress: string, amountCngn: number): Promise<string> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error("No Web3 wallet detected. Connect a wallet to mint cNGN on-chain.");
  }

  try {
    await ensureArcTestnetNetwork();
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const cngnContract = new ethers.Contract(CNGN_ADDRESS, CNGN_ABI, signer);

    const amountWei = ethers.parseUnits(amountCngn.toString(), 18);
    const tx = await cngnContract.faucetMint(toAddress, amountWei, { gasLimit: 500000 });
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (err: any) {
    const isUserRejection = err?.code === 4001 ||
      err?.code === 'ACTION_REJECTED' ||
      /rejected|denied|user rejected|cancelled/i.test(err?.message || '');
    if (isUserRejection) {
      throw new Error("cNGN mint was rejected or cancelled in your wallet.");
    }
    console.error("[On-Chain cNGN Mint Error]:", err?.message || err);
    throw new Error(err?.shortMessage || err?.reason || err?.message || "On-chain cNGN mint failed.");
  }
}

/**
 * Executes an on-chain buy on the bonding curve contract
 */
export async function buyTokenOnChain(
  curveAddress: string,
  cngnAmount: number
): Promise<{ txHash: string; tokensOut: number }> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error("No Web3 wallet detected. Connect a wallet to trade on-chain.");
  }

  try {
    await ensureArcTestnetNetwork();
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();

    const cngnContract = new ethers.Contract(CNGN_ADDRESS, CNGN_ABI, signer);
    const curveContract = new ethers.Contract(curveAddress, BONDING_CURVE_ABI, signer);

    const amountWei = ethers.parseUnits(cngnAmount.toString(), 18);

    // 1. Approve cNGN to curve contract
    console.log(`[On-Chain] Approving ${cngnAmount} cNGN for BondingCurve (${curveAddress})...`);
    const approveTx = await cngnContract.approve(curveAddress, amountWei, { gasLimit: 300000 });
    await approveTx.wait();

    // 2. Quote tokens expected
    let minTokensOut = BigInt(0);
    try {
      minTokensOut = await curveContract.quoteBuy(amountWei);
      minTokensOut = (minTokensOut * BigInt(95)) / BigInt(100);
    } catch (e) {
      minTokensOut = BigInt(0);
    }

    // 3. Execute buy transaction on curve
    console.log(`[On-Chain] Executing buy on BondingCurve (${curveAddress})...`);
    const buyTx = await curveContract.buy(amountWei, minTokensOut, { gasLimit: 1000000 });
    const receipt = await buyTx.wait();

    return {
      txHash: receipt.hash,
      tokensOut: Number(ethers.formatUnits(minTokensOut, 18))
    };
  } catch (err: any) {
    const isUserRejection = err?.code === 4001 ||
      err?.code === 'ACTION_REJECTED' ||
      /rejected|denied|user rejected|cancelled/i.test(err?.message || '');

    if (isUserRejection) {
      throw new Error("Transaction signature was rejected or cancelled in your wallet.");
    }

    // Do NOT return a fake tx hash on failure. A phantom "successful" buy would show
    // in the UI but never exist on-chain for other users. Propagate the real error.
    console.error("[On-Chain Buy Error]:", err?.message || err);
    throw new Error(err?.shortMessage || err?.reason || err?.message || "On-chain buy failed.");
  }
}

/**
 * Executes an on-chain sell on the bonding curve contract
 */
export async function sellTokenOnChain(
  tokenAddress: string,
  curveAddress: string,
  tokenAmount: number
): Promise<{ txHash: string; cngnOut: number }> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error("No Web3 wallet detected. Connect a wallet to trade on-chain.");
  }

  try {
    await ensureArcTestnetNetwork();
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();

    const tokenContract = new ethers.Contract(tokenAddress, MEMECOIN_ABI, signer);
    const curveContract = new ethers.Contract(curveAddress, BONDING_CURVE_ABI, signer);

    const amountWei = ethers.parseUnits(tokenAmount.toString(), 18);

    // 1. Approve memecoin to curve contract
    const approveTx = await tokenContract.approve(curveAddress, amountWei, { gasLimit: 300000 });
    await approveTx.wait();

    // 2. Quote cNGN expected
    let minCngnOut = BigInt(0);
    try {
      minCngnOut = await curveContract.quoteSell(amountWei);
      minCngnOut = (minCngnOut * BigInt(95)) / BigInt(100);
    } catch (e) {
      minCngnOut = BigInt(0);
    }

    // 3. Execute sell transaction on curve
    const sellTx = await curveContract.sell(amountWei, minCngnOut, { gasLimit: 1000000 });
    const receipt = await sellTx.wait();

    return {
      txHash: receipt.hash,
      cngnOut: Number(ethers.formatUnits(minCngnOut, 18))
    };
  } catch (err: any) {
    const isUserRejection = err?.code === 4001 ||
      err?.code === 'ACTION_REJECTED' ||
      /rejected|denied|user rejected|cancelled/i.test(err?.message || '');

    if (isUserRejection) {
      throw new Error("Transaction signature was rejected or cancelled in your wallet.");
    }

    // Do NOT return a fake tx hash on failure. Propagate the real error so the UI
    // does not record a sell that never settled on-chain.
    console.error("[On-Chain Sell Error]:", err?.message || err);
    throw new Error(err?.shortMessage || err?.reason || err?.message || "On-chain sell failed.");
  }
}

/**
 * Reads live on-chain bonding curve reserves from Arc Testnet RPC provider
 */
export async function getOnChainReserves(curveAddress: string): Promise<{
  virtualCngnReserve: number;
  virtualTokenReserve: number;
  realCngnReserve: number;
  migrated: boolean;
} | null> {
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const curveContract = new ethers.Contract(curveAddress, BONDING_CURVE_ABI, provider);

    const [vCngn, vToken, rCngn, isMigrated] = await Promise.all([
      curveContract.virtualCngnReserve(),
      curveContract.virtualTokenReserve(),
      curveContract.realCngnReserve(),
      curveContract.migrated()
    ]);

    return {
      virtualCngnReserve: Number(ethers.formatUnits(vCngn, 18)),
      virtualTokenReserve: Number(ethers.formatUnits(vToken, 18)),
      realCngnReserve: Number(ethers.formatUnits(rCngn, 18)),
      migrated: Boolean(isMigrated)
    };
  } catch (err) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKCHAIN AS SOURCE OF TRUTH — Token Indexer & Trade History
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainTokenData {
  address: string;
  curve_address: string;
  name: string;
  symbol: string;
  metadata_uri: string;
  creator_wallet: string;
  raisedCngn: number;
  migrated: boolean;
  blockNumber: number;
  timestamp: number;
}

export interface ChainTradeData {
  token_address: string;       // we attach this when iterating per token
  trader_wallet: string;
  side: 'buy' | 'sell';
  cngn_amount: number;
  token_amount: number;
  price: number;
  timestamp: number;
  tx_hash: string;
  block_number: number;
}

/**
 * Primary on-chain token discovery.
 * Queries TokenLaunched events from TokenFactory to get all deployed tokens
 * with their metadata, then fetches live reserves from each BondingCurve.
 *
 * This is the blockchain-as-source-of-truth approach — no backend DB required.
 */
export async function getAllTokensFromChain(): Promise<ChainTokenData[]> {
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const factory = new ethers.Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, provider);

    // Query all TokenLaunched events from genesis block
    let events: ethers.EventLog[] = [];
    try {
      const rawEvents = await factory.queryFilter(factory.filters.TokenLaunched(), 0, 'latest');
      events = rawEvents.filter((e): e is ethers.EventLog => 'args' in e);
    } catch (evtErr) {
      // Fallback: paginate in chunks of 10,000 blocks if the RPC node rejects large queries
      console.warn('[On-Chain Indexer] Full range query failed, trying paginated approach:', evtErr);
      try {
        const latestBlock = await provider.getBlockNumber();
        const chunkSize = 10000;
        for (let fromBlock = 0; fromBlock <= latestBlock; fromBlock += chunkSize) {
          const toBlock = Math.min(fromBlock + chunkSize - 1, latestBlock);
          const chunk = await factory.queryFilter(factory.filters.TokenLaunched(), fromBlock, toBlock);
          const typedChunk = chunk.filter((e): e is ethers.EventLog => 'args' in e);
          events.push(...typedChunk);
        }
      } catch (paginateErr) {
        console.warn('[On-Chain Indexer] Paginated query also failed:', paginateErr);
        return [];
      }
    }

    if (events.length === 0) return [];

    // Build list of token data from events (name, symbol, metadataURI, creator are only in events)
    const tokenDataList: ChainTokenData[] = events.map(evt => ({
      address: evt.args.token as string,
      curve_address: evt.args.curve as string,
      name: evt.args.name as string,
      symbol: evt.args.symbol as string,
      metadata_uri: (evt.args.metadataURI as string) || '/jollof.png',
      creator_wallet: evt.args.creator as string,
      raisedCngn: 0,
      migrated: false,
      blockNumber: evt.blockNumber,
      timestamp: Number(evt.args.timestamp) * 1000 || Date.now()
    }));

    // Fetch live reserves for all tokens in parallel (with concurrency limit to avoid rate limits)
    const CONCURRENCY = 5;
    for (let i = 0; i < tokenDataList.length; i += CONCURRENCY) {
      const batch = tokenDataList.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (tokenData, batchIdx) => {
          try {
            const reserves = await getOnChainReserves(tokenData.curve_address);
            if (reserves) {
              tokenDataList[i + batchIdx].raisedCngn = reserves.realCngnReserve;
              tokenDataList[i + batchIdx].migrated = reserves.migrated;
            }
          } catch (e) {
            // Non-blocking: leave defaults
          }
        })
      );
    }

    // Most recent tokens first
    return tokenDataList.sort((a, b) => b.blockNumber - a.blockNumber);
  } catch (err) {
    console.warn('[On-Chain Indexer] getAllTokensFromChain failed:', err);
    return [];
  }
}

/**
 * Fetches on-chain trade history for a specific token from its BondingCurve Trade events.
 * Returns perfectly accurate trade history — no backend/DB required.
 */
export async function getTradingHistoryFromChain(
  tokenAddress: string,
  curveAddress: string
): Promise<ChainTradeData[]> {
  try {
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const curveContract = new ethers.Contract(curveAddress, BONDING_CURVE_ABI, provider);

    let events: ethers.EventLog[] = [];
    try {
      const rawEvents = await curveContract.queryFilter(curveContract.filters.Trade(), 0, 'latest');
      events = rawEvents.filter((e): e is ethers.EventLog => 'args' in e);
    } catch (evtErr) {
      // Paginate on failure
      try {
        const latestBlock = await provider.getBlockNumber();
        const chunkSize = 10000;
        for (let fromBlock = 0; fromBlock <= latestBlock; fromBlock += chunkSize) {
          const toBlock = Math.min(fromBlock + chunkSize - 1, latestBlock);
          const chunk = await curveContract.queryFilter(curveContract.filters.Trade(), fromBlock, toBlock);
          events.push(...chunk.filter((e): e is ethers.EventLog => 'args' in e));
        }
      } catch (paginateErr) {
        return [];
      }
    }

    const trades: ChainTradeData[] = await Promise.all(
      events.map(async (evt) => {
        // Get tx receipt for the tx_hash
        const isBuy = Boolean(evt.args.isBuy);
        return {
          token_address: tokenAddress.toLowerCase(),
          trader_wallet: evt.args.trader as string,
          side: isBuy ? 'buy' : 'sell',
          cngn_amount: Number(ethers.formatUnits(evt.args.cngnAmount, 18)),
          token_amount: Number(ethers.formatUnits(evt.args.tokenAmount, 18)),
          price: Number(ethers.formatUnits(evt.args.price, 18)),
          timestamp: Number(evt.args.timestamp) * 1000,
          tx_hash: evt.transactionHash,
          block_number: evt.blockNumber
        };
      })
    );

    // Most recent trades first
    return trades.sort((a, b) => b.block_number - a.block_number);
  } catch (err) {
    console.warn('[On-Chain Trade History] getTradingHistoryFromChain failed:', err);
    return [];
  }
}

/**
 * Refreshes live reserve state for a single token's BondingCurve.
 * Call this after every buy/sell to update price and raisedCngn in real time.
 */
export async function refreshTokenReserves(curveAddress: string): Promise<{
  raisedCngn: number;
  migrated: boolean;
} | null> {
  const reserves = await getOnChainReserves(curveAddress);
  if (!reserves) return null;
  return {
    raisedCngn: reserves.realCngnReserve,
    migrated: reserves.migrated
  };
}

