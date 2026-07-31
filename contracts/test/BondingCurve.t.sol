// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MockCNGN.sol";
import "../src/MemecoinTemplate.sol";
import "../src/BondingCurve.sol";
import "../src/MigrationRouter.sol";
import "../src/TokenFactory.sol";
import "../src/uniswap/MockUniswapV2.sol";

contract BondingCurveTest is Test {
    MockCNGN public cngn;
    MockUniswapV2Factory public factory;
    MigrationRouter public router;
    TokenFactory public tokenFactory;

    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        cngn = new MockCNGN();
        factory = new MockUniswapV2Factory();
        router = new MigrationRouter(address(cngn), address(factory));
        tokenFactory = new TokenFactory(address(cngn), address(router));

        cngn.faucetMint(alice, 100_000 * 1e18);
        cngn.faucetMint(bob, 100_000 * 1e18);
    }

    function test_LaunchTokenAndBuy() public {
        vm.startPrank(alice);
        (address tokenAddr, address curveAddr) = tokenFactory.launchToken("AfroDoge", "AFRO", "ipfs://QmMetadata");
        BondingCurve curve = BondingCurve(curveAddr);
        IERC20 token = IERC20(tokenAddr);

        uint256 buyAmount = 1_000 * 1e18; // 1,000 cNGN
        cngn.approve(curveAddr, buyAmount);

        uint256 expectedTokens = curve.quoteBuy(buyAmount);
        assertTrue(expectedTokens > 0, "Quote buy should be > 0");

        curve.buy(buyAmount, expectedTokens);

        assertEq(token.balanceOf(alice), expectedTokens, "Alice should receive tokens");
        assertEq(curve.realCngnReserve(), buyAmount, "Real cNGN reserve should increase");
        vm.stopPrank();
    }

    function test_BuyAndSellMonotonicity() public {
        vm.startPrank(alice);
        (address tokenAddr, address curveAddr) = tokenFactory.launchToken("DanfoCoin", "DANFO", "ipfs://QmDanfo");
        BondingCurve curve = BondingCurve(curveAddr);
        IERC20 token = IERC20(tokenAddr);

        uint256 initialPrice = curve.getCurrentPrice();

        cngn.approve(curveAddr, 5_000 * 1e18);
        uint256 tokensOut = curve.quoteBuy(5_000 * 1e18);
        curve.buy(5_000 * 1e18, tokensOut);

        uint256 postBuyPrice = curve.getCurrentPrice();
        assertTrue(postBuyPrice > initialPrice, "Price must increase after buy");

        token.approve(curveAddr, tokensOut);
        uint256 cngnBack = curve.quoteSell(tokensOut);
        curve.sell(tokensOut, cngnBack);

        uint256 postSellPrice = curve.getCurrentPrice();
        assertApproxEqAbs(postSellPrice, initialPrice, 1e12, "Price must return to initial price after equal sell");
        vm.stopPrank();
    }

    function test_MigrationTriggeredAtThreshold() public {
        vm.startPrank(alice);
        (address tokenAddr, address curveAddr) = tokenFactory.launchToken("JollofToken", "JOFF", "ipfs://QmJollof");
        BondingCurve curve = BondingCurve(curveAddr);

        // Spend 50,000 cNGN to hit migration threshold
        uint256 buyAmount = 50_000 * 1e18;
        cngn.approve(curveAddr, buyAmount);
        
        curve.buy(buyAmount, 0);

        assertTrue(curve.migrated(), "Curve must be marked migrated");
        assertTrue(curve.uniswapPair() != address(0), "Uniswap pair must be created");

        // Verify LP tokens burned at address(0)
        MockUniswapV2Pair pair = MockUniswapV2Pair(curve.uniswapPair());
        assertTrue(pair.balanceOf(address(0)) > 0, "LP tokens must be burned at address(0)");
        vm.stopPrank();
    }
}
