// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniswapV2.sol";
import "./MigrationRouter.sol";

/**
 * @title BondingCurve
 * @notice Constant-product bonding curve pricing & holding contract for a single memecoin.
 */
contract BondingCurve is ReentrancyGuard {
    address public token;
    address public immutable cngnToken;
    address public immutable migrationRouter;
    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;

    uint256 public virtualCngnReserve;
    uint256 public virtualTokenReserve;
    uint256 public realCngnReserve;
    uint256 public immutable MIGRATION_THRESHOLD;

    uint256 public constant CREATOR_FEE_BPS = 100; // 1% Creator royalty fee
    uint256 public constant CREATOR_LOCK_DURATION = 24 hours; // 24h Anti-Rug lock
    uint256 public accumulatedCreatorFees;

    bool public migrated;
    address public uniswapPair;

    event Trade(
        address indexed trader,
        bool isBuy,
        uint256 cngnAmount,
        uint256 tokenAmount,
        uint256 price,
        uint256 timestamp
    );
    event MigrationTriggered(address indexed token, address indexed pair, uint256 cngnAmount, uint256 tokenAmount);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    constructor(
        address _cngnToken,
        address _migrationRouter,
        address _creator,
        uint256 _virtualCngnReserve,
        uint256 _virtualTokenReserve,
        uint256 _migrationThreshold
    ) {
        cngnToken = _cngnToken;
        migrationRouter = _migrationRouter;
        creator = _creator;
        createdAt = block.timestamp;
        factory = msg.sender;

        virtualCngnReserve = _virtualCngnReserve;
        virtualTokenReserve = _virtualTokenReserve;
        MIGRATION_THRESHOLD = _migrationThreshold;
    }

    function setToken(address _token) external {
        require(msg.sender == factory, "Only factory can set token");
        require(token == address(0), "Token already set");
        require(_token != address(0), "Invalid token address");
        token = _token;
    }

    /**
     * @notice Live token price in cNGN wei per token (scaled by 1e18).
     */
    function getCurrentPrice() public view returns (uint256) {
        if (virtualTokenReserve == 0) return 0;
        return (virtualCngnReserve * 1e18) / virtualTokenReserve;
    }

    /**
     * @notice Quotes tokens received for a given cNGN input amount.
     */
    function quoteBuy(uint256 cngnIn) public view returns (uint256 tokensOut) {
        if (cngnIn == 0) return 0;
        uint256 creatorFee = (cngnIn * CREATOR_FEE_BPS) / 10000;
        uint256 effectiveCngn = cngnIn - creatorFee;
        uint256 k = virtualCngnReserve * virtualTokenReserve;
        uint256 newVirtualCngn = virtualCngnReserve + effectiveCngn;
        uint256 newVirtualToken = k / newVirtualCngn;
        tokensOut = virtualTokenReserve - newVirtualToken;
    }

    /**
     * @notice Quotes cNGN received for a given token input amount.
     */
    function quoteSell(uint256 tokensIn) public view returns (uint256 netCngnOut) {
        if (tokensIn == 0) return 0;
        uint256 k = virtualCngnReserve * virtualTokenReserve;
        uint256 newVirtualToken = virtualTokenReserve + tokensIn;
        uint256 newVirtualCngn = k / newVirtualToken;
        uint256 grossCngnOut = virtualCngnReserve - newVirtualCngn;
        uint256 creatorFee = (grossCngnOut * CREATOR_FEE_BPS) / 10000;
        netCngnOut = grossCngnOut - creatorFee;
    }

    /**
     * @notice Buy memecoins with cNGN on the bonding curve.
     * @param cngnIn Amount of cNGN to spend
     * @param minTokensOut Minimum tokens expected (slippage protection)
     */
    function buy(uint256 cngnIn, uint256 minTokensOut) external nonReentrant {
        require(!migrated, "Token already migrated to AMM");
        require(cngnIn > 0, "cNGN input must be > 0");

        uint256 creatorFee = (cngnIn * CREATOR_FEE_BPS) / 10000;
        uint256 effectiveCngn = cngnIn - creatorFee;

        uint256 tokensOut = quoteBuy(cngnIn);
        require(tokensOut >= minTokensOut, "Slippage tolerance exceeded");

        // Checks-Effects
        virtualCngnReserve += effectiveCngn;
        virtualTokenReserve -= tokensOut;
        realCngnReserve += effectiveCngn;
        accumulatedCreatorFees += creatorFee;

        uint256 price = getCurrentPrice();

        // Interactions
        IERC20(cngnToken).transferFrom(msg.sender, address(this), cngnIn);
        IERC20(token).transfer(msg.sender, tokensOut);

        emit Trade(msg.sender, true, cngnIn, tokensOut, price, block.timestamp);

        // Check if migration threshold reached
        if (realCngnReserve >= MIGRATION_THRESHOLD && !migrated) {
            _executeMigration();
        }
    }

    /**
     * @notice Sell memecoins back to the bonding curve for cNGN.
     * @dev Creator is locked from selling for 24 hours post-launch (Anti-Rug Mechanism).
     * @param tokensIn Amount of memecoins to sell
     * @param minCngnOut Minimum cNGN expected (slippage protection)
     */
    function sell(uint256 tokensIn, uint256 minCngnOut) external nonReentrant {
        require(!migrated, "Token already migrated to AMM");
        require(tokensIn > 0, "Token input must be > 0");

        // 24-Hour Anti-Rug Creator Lock
        if (msg.sender == creator) {
            require(block.timestamp >= createdAt + CREATOR_LOCK_DURATION, "Anti-Rug: Creator locked for 24 hours");
        }

        uint256 k = virtualCngnReserve * virtualTokenReserve;
        uint256 newVirtualToken = virtualTokenReserve + tokensIn;
        uint256 newVirtualCngn = k / newVirtualToken;
        uint256 grossCngnOut = virtualCngnReserve - newVirtualCngn;

        uint256 creatorFee = (grossCngnOut * CREATOR_FEE_BPS) / 10000;
        uint256 netCngnOut = grossCngnOut - creatorFee;

        require(netCngnOut <= realCngnReserve, "Exceeds real reserve");
        require(netCngnOut >= minCngnOut, "Slippage tolerance exceeded");

        // Checks-Effects
        virtualTokenReserve += tokensIn;
        virtualCngnReserve -= netCngnOut;
        realCngnReserve -= netCngnOut;
        accumulatedCreatorFees += creatorFee;

        uint256 price = getCurrentPrice();

        // Interactions
        IERC20(token).transferFrom(msg.sender, address(this), tokensIn);
        IERC20(cngnToken).transfer(msg.sender, netCngnOut);

        emit Trade(msg.sender, false, netCngnOut, tokensIn, price, block.timestamp);
    }

    /**
     * @notice Claims accumulated 1% trading fee royalties for the token creator.
     */
    function claimCreatorFees() external nonReentrant {
        require(msg.sender == creator, "Only creator can claim fees");
        uint256 amount = accumulatedCreatorFees;
        require(amount > 0, "No creator fees to claim");

        accumulatedCreatorFees = 0;
        IERC20(cngnToken).transfer(creator, amount);

        emit CreatorFeesClaimed(creator, amount);
    }

    /**
     * @notice View 24-hour creator anti-rug lock status.
     */
    function getCreatorLockStatus() external view returns (bool isLocked, uint256 lockExpiry, uint256 timeRemaining) {
        lockExpiry = createdAt + CREATOR_LOCK_DURATION;
        if (block.timestamp < lockExpiry) {
            isLocked = true;
            timeRemaining = lockExpiry - block.timestamp;
        } else {
            isLocked = false;
            timeRemaining = 0;
        }
    }

    /**
     * @dev Internal helper to trigger liquidity migration to Uniswap V2 AMM.
     */
    function _executeMigration() internal {
        migrated = true;

        uint256 remainingTokens = IERC20(token).balanceOf(address(this));
        uint256 cngnLiquidity = realCngnReserve;

        IERC20(token).approve(migrationRouter, remainingTokens);
        IERC20(cngnToken).approve(migrationRouter, cngnLiquidity);

        uniswapPair = MigrationRouter(migrationRouter).migrate(token, remainingTokens, cngnLiquidity);

        emit MigrationTriggered(token, uniswapPair, cngnLiquidity, remainingTokens);
    }
}
