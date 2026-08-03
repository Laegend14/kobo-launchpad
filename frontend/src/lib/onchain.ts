import { ethers } from 'ethers';
import { DEPLOYED_ADDRESSES } from './contracts';

export const TOKEN_FACTORY_ADDRESS = DEPLOYED_ADDRESSES.tokenFactory;
export const CNGN_ADDRESS = DEPLOYED_ADDRESSES.mockCNGN;
export const ARC_TESTNET_CHAIN_ID = "0x4cef52"; // 5042002 in hex (verified: 5042002 = 0x4CEF52)
export const ARC_RPC_URL = "https://rpc.blockdaemon.testnet.arc.io";
// Fallback RPCs if the primary is rate-limited or unavailable.
export const ARC_RPC_FALLBACKS = [
  "https://rpc.testnet.arc.io",
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io",
];

export const MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11";
export const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[])"
];

export const TOKEN_FACTORY_ABI = [
  "function launchToken(string name, string symbol, string metadataURI) external returns (address token, address curve)",
  "function getAllTokensCount() external view returns (uint256)",
  "function allTokens(uint256 index) external view returns (address)",
  "function tokenToCurve(address token) external view returns (address)",
  "function tokenMetadataURI(address token) external view returns (string)",
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
  "function creator() external view returns (address)",
  "event Trade(address indexed trader, bool isBuy, uint256 cngnAmount, uint256 tokenAmount, uint256 price, uint256 timestamp)"
];

export const MEMECOIN_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
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
              'https://rpc.blockdaemon.testnet.arc.io',
              'https://rpc.testnet.arc.io',
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

    // Sanitize metadataUri for EVM calldata — this URI is now stored ON-CHAIN in the
    // factory (tokenMetadataURI) and read back by every client, so it must be a
    // compact, universally-loadable value. Allow http(s) image URLs (the paste-a-URL
    // flow) up to 512 chars; reject data: URIs (huge base64 blobs would exceed EVM
    // calldata limits) and anything malformed; fall back to /jollof.png.
    let cleanMetadataUri = metadataUri || "/jollof.png";
    const looksLikeUrl = /^https?:\/\/[^\s]+$/i.test(cleanMetadataUri);
    if (cleanMetadataUri.startsWith('data:') || (!looksLikeUrl && cleanMetadataUri.length > 200) || cleanMetadataUri.length > 512) {
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
// CHAIN-STATE DISCOVERY + TRADE READERS (no backend, no DB)
// ─────────────────────────────────────────────────────────────────────────────
// The Arc chain is the SINGLE source of truth. Every client builds an identical
// view by enumerating the factory's on-chain registry via PACED, RETRIED eth_call
// state reads (getAllTokensCount → allTokens → tokenToCurve → metadataURI) — never
// per-browser from-block-0 log scans, which Arc rejects at ~55M blocks ("could not
// coalesce") and rate-limits (-32011). Token existence, image (metadataURI), price,
// raised and migrated all come from live state, so all accounts agree.
//
// Trade HISTORY is best-effort: each client tails recent Trade events from its own
// first observation forward with a small bounded block window + retry (never from
// block 0). Headline metrics stay exact because price/raised are read from state.

// Token/curve shape as returned by getAllTokensFromChain — mirrors AuthContext's
// TokenItem so the context can adopt these records directly.
export interface ChainTokenRecord {
  address: string;
  curve_address: string;
  name: string;
  symbol: string;
  metadata_uri: string;
  creator_wallet: string;
  migrated: boolean;
  raisedCngn: number;
  description?: string;
  fromBlock: number; // where this client first saw the token — trade tail starts here
}

// Trade record shape — mirrors metrics.TradeItem.
export interface ChainTradeRecord {
  id: string;
  token_address: string;
  trader_wallet: string;
  side: 'buy' | 'sell';
  cngn_amount: number;
  token_amount: number;
  price: number;
  timestamp: number; // ms
  tx_hash: string;
}

const CALL_PACE_MS = 120;          // sleep between consecutive state reads
const MAX_PARALLEL_READS = 3;      // never hammer the RPC
const TRADE_BATCH_BLOCKS = 5_000;  // max window per queryFilter on the tail
const TRADE_TAIL_LOOKBACK_BLOCKS = 5_000; // safe lookback window on testnet

// Retry/backoff: Arc returns -32011 (request limit) and -32005 (limit exceeded)
// when hammered; transient network errors also happen. Retry with exponential
// backoff so a burst of RPC pressure never wipes out a whole sync pass.
async function rpcRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const code = err?.code;
      const msg = String(err?.shortMessage || err?.reason || err?.message || '').toLowerCase();
      let retriable = code === -32011 || code === -32005 ||
        /request limit|rate limit|too many|throttl|server error|execution reverted|coalesc|network|socket|timeout|fetch|missing revert data/i.test(msg);
      // On Arc, a rate-limited eth_call often surfaces as CALL_EXCEPTION with data=null
      // ("missing revert data") rather than a clean -32011 — transient, not a real revert.
      if (code === 'CALL_EXCEPTION' && !err?.data) retriable = true;
      if (!retriable || i >= attempts - 1) throw err;
      const wait = Math.min(500 * 2 ** i, 5000);
      await new Promise(res => setTimeout(res, wait));
    }
  }
  throw lastErr;
}

/** Paced enumeration of the full on-chain registry with live state for each token. */
export async function getAllTokensFromChain(): Promise<ChainTokenRecord[]> {
  const provider = getReadProvider();
  const factory = new ethers.Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, provider);

  // 1. Registry size (single call).
  let count = 0;
  try {
    count = Number(await rpcRetry(() => factory.getAllTokensCount()));
  } catch (err: any) {
    console.warn('[Chain] getAllTokensCount failed:', err?.message || err);
    return [];
  }
  if (count === 0) return [];

  // 2. Multicall3 Batch Fetch — retrieves ALL tokens and live state in 1 single RPC call!
  try {
    const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
    const factoryIface = new ethers.Interface(TOKEN_FACTORY_ABI);
    const tokenIface = new ethers.Interface(MEMECOIN_ABI);
    const curveIface = new ethers.Interface(BONDING_CURVE_ABI);

    // Step A: Get all token addresses
    const addrCalls: { target: string; allowFailure: boolean; callData: string }[] = [];
    for (let i = 0; i < count; i++) {
      addrCalls.push({
        target: TOKEN_FACTORY_ADDRESS,
        allowFailure: true,
        callData: factoryIface.encodeFunctionData('allTokens', [i])
      });
    }

    const addrResults: any[] = await rpcRetry(() => multicall.aggregate3.staticCall(addrCalls));
    const tokenAddrs: string[] = [];
    for (const res of addrResults) {
      if (res.success && res.returnData !== '0x') {
        try {
          const decoded = factoryIface.decodeFunctionResult('allTokens', res.returnData);
          if (decoded && decoded[0] && decoded[0] !== ethers.ZeroAddress) {
            tokenAddrs.push(String(decoded[0]).toLowerCase());
          }
        } catch {}
      }
    }

    if (tokenAddrs.length === 0) return [];

    // Step B: Batch read tokenToCurve, tokenMetadataURI, name, symbol
    const detailCalls: { target: string; allowFailure: boolean; callData: string }[] = [];
    for (const token of tokenAddrs) {
      detailCalls.push({ target: TOKEN_FACTORY_ADDRESS, allowFailure: true, callData: factoryIface.encodeFunctionData('tokenToCurve', [token]) });
      detailCalls.push({ target: TOKEN_FACTORY_ADDRESS, allowFailure: true, callData: factoryIface.encodeFunctionData('tokenMetadataURI', [token]) });
      detailCalls.push({ target: token, allowFailure: true, callData: tokenIface.encodeFunctionData('name') });
      detailCalls.push({ target: token, allowFailure: true, callData: tokenIface.encodeFunctionData('symbol') });
    }

    const detailResults: any[] = await rpcRetry(() => multicall.aggregate3.staticCall(detailCalls));

    // Decode curve addresses to build curve state calls
    const curveAddrs: string[] = [];
    let idx = 0;
    for (let i = 0; i < tokenAddrs.length; i++) {
      const curveRes = detailResults[idx];
      let curve = '';
      if (curveRes && curveRes.success && curveRes.returnData !== '0x') {
        try {
          curve = String(factoryIface.decodeFunctionResult('tokenToCurve', curveRes.returnData)[0]).toLowerCase();
        } catch {}
      }
      curveAddrs.push(curve);
      idx += 4;
    }

    // Step C: Batch read creator, realCngnReserve, migrated for all curves
    const curveCalls: { target: string; allowFailure: boolean; callData: string }[] = [];
    for (const curve of curveAddrs) {
      if (curve && curve !== ethers.ZeroAddress) {
        curveCalls.push({ target: curve, allowFailure: true, callData: curveIface.encodeFunctionData('creator') });
        curveCalls.push({ target: curve, allowFailure: true, callData: curveIface.encodeFunctionData('realCngnReserve') });
        curveCalls.push({ target: curve, allowFailure: true, callData: curveIface.encodeFunctionData('migrated') });
      } else {
        curveCalls.push({ target: TOKEN_FACTORY_ADDRESS, allowFailure: true, callData: '0x' });
        curveCalls.push({ target: TOKEN_FACTORY_ADDRESS, allowFailure: true, callData: '0x' });
        curveCalls.push({ target: TOKEN_FACTORY_ADDRESS, allowFailure: true, callData: '0x' });
      }
    }

    const curveResults: any[] = await rpcRetry(() => multicall.aggregate3.staticCall(curveCalls));

    const records: ChainTokenRecord[] = [];
    idx = 0;
    let curveIdx = 0;
    for (let i = 0; i < tokenAddrs.length; i++) {
      const token = tokenAddrs[i];
      const curve = curveAddrs[i];

      const metaRes = detailResults[idx + 1];
      const nameRes = detailResults[idx + 2];
      const symbolRes = detailResults[idx + 3];
      idx += 4;

      const creatorRes = curveResults[curveIdx++];
      const realCngnRes = curveResults[curveIdx++];
      const migratedRes = curveResults[curveIdx++];

      let meta = '/jollof.png';
      let name = '';
      let symbol = '';
      let creator = token;
      let realCngn = BigInt(0);
      let migrated = false;

      if (metaRes && metaRes.success && metaRes.returnData !== '0x') {
        try { meta = String(factoryIface.decodeFunctionResult('tokenMetadataURI', metaRes.returnData)[0]) || '/jollof.png'; } catch {}
      }
      if (nameRes && nameRes.success && nameRes.returnData !== '0x') {
        try { name = String(tokenIface.decodeFunctionResult('name', nameRes.returnData)[0]) || ''; } catch {}
      }
      if (symbolRes && symbolRes.success && symbolRes.returnData !== '0x') {
        try { symbol = String(tokenIface.decodeFunctionResult('symbol', symbolRes.returnData)[0]) || ''; } catch {}
      }
      if (creatorRes && creatorRes.success && creatorRes.returnData !== '0x') {
        try { creator = String(curveIface.decodeFunctionResult('creator', creatorRes.returnData)[0]).toLowerCase(); } catch {}
      }
      if (realCngnRes && realCngnRes.success && realCngnRes.returnData !== '0x') {
        try { realCngn = BigInt(curveIface.decodeFunctionResult('realCngnReserve', realCngnRes.returnData)[0] || 0); } catch {}
      }
      if (migratedRes && migratedRes.success && migratedRes.returnData !== '0x') {
        try { migrated = Boolean(curveIface.decodeFunctionResult('migrated', migratedRes.returnData)[0]); } catch {}
      }

      records.push({
        address: token,
        curve_address: curve,
        name,
        symbol,
        metadata_uri: meta,
        creator_wallet: creator !== ethers.ZeroAddress ? creator : token,
        migrated,
        raisedCngn: Number(ethers.formatUnits(realCngn, 18)),
        description: `${name} ($${symbol}) — launched on Kobo!`,
        fromBlock: 0,
      });
    }

    if (records.length > 0) return records;
  } catch (err: any) {
    console.warn('[Chain] Multicall3 batch read failed, falling back to individual calls:', err?.message || err);
  }

  // 3. Fallback: Paced enumeration if Multicall is unavailable.
  const pairs: { token: string; curve: string }[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const token = (await rpcRetry(() => factory.allTokens(i))).toLowerCase();
      const curve = (await rpcRetry(() => factory.tokenToCurve(token))).toLowerCase();
      pairs.push({ token, curve });
    } catch (err: any) {
      console.warn(`[Chain] Registry read allTokens(${i}) failed — skipping:`, err?.message || err);
    }
    await sleepMs(CALL_PACE_MS);
  }

  const records: ChainTokenRecord[] = [];
  for (let i = 0; i < pairs.length; i += MAX_PARALLEL_READS) {
    const batch = pairs.slice(i, i + MAX_PARALLEL_READS);
    const results = await Promise.all(batch.map(async ({ token, curve }) => {
      try {
        const tokenContract = new ethers.Contract(token, MEMECOIN_ABI, provider);
        const curveContract = new ethers.Contract(curve, BONDING_CURVE_ABI, provider);

        const [name, symbol, metadataUri, creator, realCngn, migrated] = await rpcRetry(() =>
          Promise.all([
            tokenContract.name().catch(() => ''),
            tokenContract.symbol().catch(() => ''),
            factory.tokenMetadataURI(token).catch(() => ''),
            curveContract.creator().catch(() => ethers.ZeroAddress),
            curveContract.realCngnReserve().catch(() => BigInt(0)),
            curveContract.migrated().catch(() => false),
          ])
        );

        const metadataUriStr = metadataUri && String(metadataUri).length > 0 ? String(metadataUri) : '/jollof.png';
        const creatorStr = creator && creator !== ethers.ZeroAddress ? String(creator).toLowerCase() : token;

        return {
          address: token,
          curve_address: curve,
          name: String(name || ''),
          symbol: String(symbol || ''),
          metadata_uri: metadataUriStr,
          creator_wallet: creatorStr,
          migrated: Boolean(migrated),
          raisedCngn: Number(ethers.formatUnits(realCngn || BigInt(0), 18)),
          description: `${String(name || '')} ($${String(symbol || '')}) — launched on Kobo!`,
          fromBlock: 0,
        } as ChainTokenRecord;
      } catch (err: any) {
        console.warn(`[Chain] State read failed for ${token}:`, err?.message || err);
        return null;
      }
    }));
    results.forEach(r => { if (r) records.push(r); });
    await sleepMs(CALL_PACE_MS);
  }

  return records;
}

/**
 * Best-effort incremental Trade history for one curve. `fromBlock` is the block the
 * caller last saw (0 = first observation → bounded lookback). Never scans from block
 * 0; caps each window and retries so Arc rate-limits can't kill the tail.
 */
export async function getRecentTradesFromChain(
  curveAddress: string,
  fromBlock: number,
  latestBlock?: number
): Promise<ChainTradeRecord[]> {
  const provider = getReadProvider();
  const curveContract = new ethers.Contract(curveAddress, BONDING_CURVE_ABI, provider);

  let latest = latestBlock ?? 0;
  if (!latest) {
    try { latest = await rpcRetry(() => provider.getBlockNumber()); }
    catch { return []; }
  }

  const from = fromBlock > 0
    ? fromBlock + 1
    : Math.max(0, latest - TRADE_TAIL_LOOKBACK_BLOCKS);
  if (from >= latest) return [];

  const out: ChainTradeRecord[] = [];
  let cursor = from;
  while (cursor <= latest) {
    const to = Math.min(cursor + TRADE_BATCH_BLOCKS - 1, latest);
    try {
      const logs = await rpcRetry(() => curveContract.queryFilter(curveContract.filters.Trade(), cursor, to));
      for (const log of logs) {
        try {
          const parsed = curveContract.interface.parseLog({ topics: [...log.topics], data: log.data });
          if (!parsed || parsed.name !== 'Trade') continue;
          const isBuy = Boolean(parsed.args.isBuy);
          out.push({
            id: log.transactionHash,
            token_address: '', // filled by caller
            trader_wallet: String(parsed.args.trader).toLowerCase(),
            side: isBuy ? 'buy' : 'sell',
            cngn_amount: Number(ethers.formatUnits(parsed.args.cngnAmount, 18)),
            token_amount: Number(ethers.formatUnits(parsed.args.tokenAmount, 18)),
            price: Number(ethers.formatUnits(parsed.args.price, 18)),
            timestamp: Number(parsed.args.timestamp) * 1000,
            tx_hash: log.transactionHash,
          });
        } catch { /* skip unparseable log */ }
      }
    } catch (err: any) {
      console.warn(`[Chain] Trade tail ${cursor}..${to} failed for ${curveAddress}:`, err?.message || err);
    }
    await sleepMs(CALL_PACE_MS);
    cursor = to + 1;
  }
  return out;
}

// ── Provider: primary RPC + fallback rotation, auto-reconnect on failure ──────
let _readProvider: ethers.JsonRpcProvider | null = null;
let _rpcIdx = 0;
let _rpcFails = 0;

function getReadProvider(): ethers.JsonRpcProvider {
  if (_readProvider) return _readProvider;
  const url = _rpcIdx === 0 ? ARC_RPC_URL : ARC_RPC_FALLBACKS[_rpcIdx - 1];
  _readProvider = new ethers.JsonRpcProvider(url);
  _readProvider.on('error', () => {
    _rpcFails++;
    if (_rpcFails >= 3 && ARC_RPC_FALLBACKS.length > 0) {
      console.warn('[Chain] Primary RPC failing repeatedly — rotating to fallback RPC.');
      _readProvider?.destroy();
      _readProvider = null;
      _rpcIdx = (_rpcIdx + 1) % (ARC_RPC_FALLBACKS.length + 1); // +1 = primary
      _rpcFails = 0;
    }
  });
  return _readProvider;
}

const sleepMs = (ms: number) => new Promise(res => setTimeout(res, ms));

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

