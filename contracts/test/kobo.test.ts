import { expect } from "chai";
import { ethers } from "hardhat";

describe("Kobo Naira-Native Memecoin Launchpad", function () {
  let mockCNGN: any;
  let uniswapFactory: any;
  let migrationRouter: any;
  let tokenFactory: any;
  let deployer: any;
  let alice: any;
  let bob: any;

  const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();

    // 1. Deploy MockCNGN
    const MockCNGN = await ethers.getContractFactory("MockCNGN");
    mockCNGN = await MockCNGN.deploy();

    // 2. Deploy MockUniswapV2Factory
    const MockUniswapV2Factory = await ethers.getContractFactory("MockUniswapV2Factory");
    uniswapFactory = await MockUniswapV2Factory.deploy();

    // 3. Deploy MigrationRouter
    const MigrationRouter = await ethers.getContractFactory("MigrationRouter");
    migrationRouter = await MigrationRouter.deploy(await mockCNGN.getAddress(), await uniswapFactory.getAddress());

    // 4. Deploy TokenFactory
    const TokenFactory = await ethers.getContractFactory("TokenFactory");
    tokenFactory = await TokenFactory.deploy(await mockCNGN.getAddress(), await migrationRouter.getAddress());

    // Mint 100,000 cNGN to Alice and Bob
    await mockCNGN.faucetMint(alice.address, ethers.parseEther("100000"));
    await mockCNGN.faucetMint(bob.address, ethers.parseEther("100000"));
  });

  it("Should launch a memecoin with 100% supply allocated to BondingCurve", async function () {
    const tx = await tokenFactory.connect(alice).launchToken("Jollof Token", "JOFF", "ipfs://QmJollof");
    await tx.wait();

    const tokenCount = await tokenFactory.getAllTokensCount();
    expect(tokenCount).to.equal(1);

    const tokenAddress = await tokenFactory.allTokens(0);
    const curveAddress = await tokenFactory.tokenToCurve(tokenAddress);

    const token = await ethers.getContractAt("MemecoinTemplate", tokenAddress);
    const curveBalance = await token.balanceOf(curveAddress);
    expect(curveBalance).to.equal(ethers.parseEther("1000000000")); // 1 Billion tokens
  });

  it("Should allow buying and selling on the bonding curve with price monotonicity", async function () {
    await tokenFactory.connect(alice).launchToken("AfroDoge", "AFRO", "ipfs://QmAfro");
    const tokenAddress = await tokenFactory.allTokens(0);
    const curveAddress = await tokenFactory.tokenToCurve(tokenAddress);

    const curve = await ethers.getContractAt("BondingCurve", curveAddress);
    const token = await ethers.getContractAt("MemecoinTemplate", tokenAddress);

    const initialPrice = await curve.getCurrentPrice();

    // Bob (non-creator) buys 1,000 cNGN worth of AFRO
    const cngnAmount = ethers.parseEther("1000");
    await mockCNGN.connect(bob).approve(curveAddress, cngnAmount);

    const quoteOut = await curve.quoteBuy(cngnAmount);
    expect(quoteOut).to.be.gt(0);

    await curve.connect(bob).buy(cngnAmount, quoteOut);

    const bobTokenBalance = await token.balanceOf(bob.address);
    expect(bobTokenBalance).to.equal(quoteOut);

    const postBuyPrice = await curve.getCurrentPrice();
    expect(postBuyPrice).to.be.gt(initialPrice);

    // Bob sells half his tokens back
    const sellAmount = bobTokenBalance / 2n;
    await token.connect(bob).approve(curveAddress, sellAmount);
    const cngnQuote = await curve.quoteSell(sellAmount);

    await curve.connect(bob).sell(sellAmount, cngnQuote);

    const postSellPrice = await curve.getCurrentPrice();
    expect(postSellPrice).to.be.lt(postBuyPrice);
  });

  it("Should trigger automatic migration to Uniswap V2 when 50,000 cNGN threshold is reached", async function () {
    await tokenFactory.connect(alice).launchToken("Danfo Coin", "DANFO", "ipfs://QmDanfo");
    const tokenAddress = await tokenFactory.allTokens(0);
    const curveAddress = await tokenFactory.tokenToCurve(tokenAddress);

    const curve = await ethers.getContractAt("BondingCurve", curveAddress);

    // Buy enough so that the net (post-fee) cNGN reserve crosses the 50,000 threshold.
    // 1% creator fee is withheld on buy, so a 51,000 cNGN buy yields 50,490 real reserve.
    const buyAmount = ethers.parseEther("51000");
    await mockCNGN.connect(bob).approve(curveAddress, buyAmount);

    await curve.connect(bob).buy(buyAmount, 0);

    expect(await curve.migrated()).to.be.true;
    const pairAddress = await curve.uniswapPair();
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);

    // LP tokens are minted to the BondingCurve (the caller of migrate), not burned.
    // The curve can then lock them at the dead address or hold them as the owner decides.
    const pair = await ethers.getContractAt("MockUniswapV2Pair", pairAddress);
    const curveLP = await pair.balanceOf(curveAddress);
    expect(curveLP).to.be.gt(0);
    const burnedLP = await pair.balanceOf(BURN_ADDRESS);
    expect(burnedLP).to.equal(0);

    // Subsequent buys on bonding curve must revert post-migration
    await mockCNGN.connect(bob).approve(curveAddress, ethers.parseEther("100"));
    await expect(curve.connect(bob).buy(ethers.parseEther("100"), 0)).to.be.revertedWith("Token already migrated to AMM");
  });

  it("Should collect 1% creator fees on trades and allow creator to claim fees", async function () {
    await tokenFactory.connect(alice).launchToken("Suya Coin", "SUYA", "ipfs://QmSuya");
    const tokenAddress = await tokenFactory.allTokens(0);
    const curveAddress = await tokenFactory.tokenToCurve(tokenAddress);
    const curve = await ethers.getContractAt("BondingCurve", curveAddress);

    // Bob buys 10,000 cNGN worth of SUYA
    const buyAmount = ethers.parseEther("10000");
    await mockCNGN.connect(bob).approve(curveAddress, buyAmount);
    await curve.connect(bob).buy(buyAmount, 0);

    // Expected 1% fee = 100 cNGN
    const accumulatedFees = await curve.accumulatedCreatorFees();
    expect(accumulatedFees).to.equal(ethers.parseEther("100"));

    // Alice (creator) claims creator fees
    const aliceBalanceBefore = await mockCNGN.balanceOf(alice.address);
    await curve.connect(alice).claimCreatorFees();
    const aliceBalanceAfter = await mockCNGN.balanceOf(alice.address);

    expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(ethers.parseEther("100"));
    expect(await curve.accumulatedCreatorFees()).to.equal(0);
  });

  it("Should enforce 24-hour anti-rug lock for coin creator", async function () {
    await tokenFactory.connect(alice).launchToken("Pounded Yam", "YAM", "ipfs://QmYam");
    const tokenAddress = await tokenFactory.allTokens(0);
    const curveAddress = await tokenFactory.tokenToCurve(tokenAddress);
    const curve = await ethers.getContractAt("BondingCurve", curveAddress);
    const token = await ethers.getContractAt("MemecoinTemplate", tokenAddress);

    // Alice (creator) buys tokens
    const buyAmount = ethers.parseEther("1000");
    await mockCNGN.connect(alice).approve(curveAddress, buyAmount);
    await curve.connect(alice).buy(buyAmount, 0);

    const aliceTokenBal = await token.balanceOf(alice.address);
    await token.connect(alice).approve(curveAddress, aliceTokenBal);

    // Attempting to sell as creator within 24h must revert
    await expect(curve.connect(alice).sell(aliceTokenBal, 0)).to.be.revertedWith("Anti-Rug: Creator locked for 24 hours");

    // Fast-forward EVM time by 24 hours (86400 seconds)
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine", []);

    // After 24h, Alice can sell successfully
    await expect(curve.connect(alice).sell(aliceTokenBal, 0)).to.not.be.reverted;
  });

  it("Should NOT allow sellers to drain the bonding curve below the k-curve floor (creator fees held outside tradable reserve)", async function () {
    await tokenFactory.connect(alice).launchToken("Drain Me", "DRN", "ipfs://QmDrain");
    const tokenAddress = await tokenFactory.allTokens(0);
    const curveAddress = await tokenFactory.tokenToCurve(tokenAddress);

    const curve = await ethers.getContractAt("BondingCurve", curveAddress);
    const token = await ethers.getContractAt("MemecoinTemplate", tokenAddress);

    // Multiple alternating buy/sell cycles to try to extract the 1% creator fee
    // from the tradable pool. Before the fix, accumulatedCreatorFees inflated
    // realCngnReserve, letting sells drain past the true k-curve floor.
    for (let i = 0; i < 5; i++) {
      const buyAmount = ethers.parseEther("1000");
      await mockCNGN.connect(bob).approve(curveAddress, buyAmount);
      const quoteOut = await curve.quoteBuy(buyAmount);
      await curve.connect(bob).buy(buyAmount, quoteOut);

      // Sell the entire balance back
      const bobBalance = await token.balanceOf(bob.address);
      await token.connect(bob).approve(curveAddress, bobBalance);
      const cngnQuote = await curve.quoteSell(bobBalance);
      await curve.connect(bob).sell(bobBalance, cngnQuote);
    }

    // Every buy charged a 1% fee that is NOT part of the tradable reserve.
    const fees = await curve.accumulatedCreatorFees();
    expect(fees).to.be.gt(0);

    // SOLVENCY INVARIANT: the contract must hold essentially enough cNGN to cover
    // both the withdrawable real reserve AND the claimable creator fees. If the drain
    // bug were present, realReserve would be inflated by the accumulated fees and the
    // balance would fall short of realReserve + fees by ~50% of the fee pot. Here the
    // only shortfall is sub-wei floor-division dust (a few wei over 10 trades), which
    // is unclaimable and harmless.
    const actualCngnBalance = await mockCNGN.balanceOf(curveAddress);
    const realReserve = await curve.realCngnReserve();
    const DUST = 100n; // wei — bounds cumulative integer-division rounding
    expect(actualCngnBalance + DUST).to.be.gte(realReserve + fees);
    expect(realReserve).to.be.lte(actualCngnBalance);

    // Bob can still fully exit: selling his ENTIRE balance must succeed and be fully
    // backed by real cNGN (not revert with "Exceeds real reserve").
    const bobBalance = await token.balanceOf(bob.address);
    if (bobBalance > 0n) {
      await token.connect(bob).approve(curveAddress, bobBalance);
      await expect(curve.connect(bob).sell(bobBalance, 0)).to.not.be.reverted;
    }
  });

  it("Should migrate the real (net-of-fee) cNGN reserve to the pair while keeping creator fees claimable", async function () {
    await tokenFactory.connect(alice).launchToken("Migrate Fee", "MIGF", "ipfs://QmMigFee");
    const tokenAddress = await tokenFactory.allTokens(0);
    const curveAddress = await tokenFactory.tokenToCurve(tokenAddress);

    const curve = await ethers.getContractAt("BondingCurve", curveAddress);

    // Buy 50,000 cNGN → 500 cNGN fee withheld, 49,500 real reserve → NOT migrated yet
    const buyAmount = ethers.parseEther("50000");
    await mockCNGN.connect(bob).approve(curveAddress, buyAmount);
    await curve.connect(bob).buy(buyAmount, 0);

    expect(await curve.migrated()).to.be.false;

    // 1% of 50,000 = 500 withheld as creator fee
    expect(await curve.accumulatedCreatorFees()).to.equal(ethers.parseEther("500"));

    // Top up to cross the 50,000 threshold with the real reserve
    const topUp = ethers.parseEther("1000");
    await mockCNGN.connect(bob).approve(curveAddress, topUp);
    await curve.connect(bob).buy(topUp, 0);

    expect(await curve.migrated()).to.be.true;
    const pairAddress = await curve.uniswapPair();
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);

    // Creator fee bucket is still intact and claimable even after migration.
    // (510 = 500 on the first 50k buy + 10 on the 1k top-up.)
    const claimableFees = await curve.accumulatedCreatorFees();
    expect(claimableFees).to.be.gte(ethers.parseEther("500"));
    const aliceBefore = await mockCNGN.balanceOf(alice.address);
    await curve.connect(alice).claimCreatorFees();
    const aliceAfter = await mockCNGN.balanceOf(alice.address);
    expect(aliceAfter - aliceBefore).to.equal(claimableFees);

    // All real cNGN backing the pool was moved to the pair as liquidity
    const remainingCngn = await mockCNGN.balanceOf(curveAddress);
    expect(remainingCngn).to.equal(0);
  });
});
