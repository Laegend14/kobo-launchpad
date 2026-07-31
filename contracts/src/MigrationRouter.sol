// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniswapV2.sol";

/**
 * @title MigrationRouter
 * @notice Handles token graduation: creates a Uniswap V2 pair, deposits reserves, and burns LP tokens at dead address.
 */
contract MigrationRouter is ReentrancyGuard, Ownable {
    address public immutable cngnToken;
    address public immutable uniswapFactory;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    event Migrated(
        address indexed token,
        address indexed pair,
        uint256 tokenAmount,
        uint256 cngnAmount,
        uint256 timestamp
    );

    constructor(address _cngnToken, address _uniswapFactory) Ownable(msg.sender) {
        require(_cngnToken != address(0), "Invalid cNGN address");
        require(_uniswapFactory != address(0), "Invalid factory address");
        cngnToken = _cngnToken;
        uniswapFactory = _uniswapFactory;
    }

    /**
     * @notice Migrates liquidity from BondingCurve to Uniswap V2 AMM pair.
     * @param token Memecoin contract address
     * @param tokenAmount Amount of memecoin to seed LP
     * @param cngnAmount Amount of cNGN to seed LP
     */
    function migrate(
        address token,
        uint256 tokenAmount,
        uint256 cngnAmount
    ) external nonReentrant returns (address pair) {
        require(tokenAmount > 0 && cngnAmount > 0, "Zero amount");

        // 1. Transfer tokens and cNGN from msg.sender (BondingCurve) to this contract
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);
        IERC20(cngnToken).transferFrom(msg.sender, address(this), cngnAmount);

        // 2. Get or Create Uniswap V2 Pair
        pair = IUniswapV2Factory(uniswapFactory).getPair(token, cngnToken);
        if (pair == address(0)) {
            pair = IUniswapV2Factory(uniswapFactory).createPair(token, cngnToken);
        }

        // 3. Transfer tokens directly to the pair contract
        IERC20(token).transfer(pair, tokenAmount);
        IERC20(cngnToken).transfer(pair, cngnAmount);

        // 4. Mint LP tokens directly to BURN_ADDRESS (permanently locked / burned)
        uint256 liquidity = IUniswapV2Pair(pair).mint(BURN_ADDRESS);
        require(liquidity > 0, "Zero LP liquidity minted");

        emit Migrated(token, pair, tokenAmount, cngnAmount, block.timestamp);
    }
}
