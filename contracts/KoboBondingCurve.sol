// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockCNGN.sol";
import "./KoboToken.sol";

/**
 * @title KoboBondingCurve
 * @notice Factory and bonding curve engine for Kobo Launchpad (Base Sepolia)
 * @dev Denominated in cNGN (Compliant Naira, 6 decimals).
 *      Constant Product Virtual AMM: (x * y = k)
 *      Graduation target: 10,000,000 cNGN ($~6,500 USD).
 *      Creator fee: 0.35%, Platform fee: 1.00%.
 */
contract KoboBondingCurve {
    address public immutable cngnToken;
    address public treasury;
    address public owner;

    // Constants
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18;      // 1B tokens
    uint256 public constant CURVE_SUPPLY = 800_000_000 * 10**18;        // 800M tokens for sale
    uint256 public constant DEX_RESERVE = 200_000_000 * 10**18;         // 200M reserved for DEX
    uint256 public constant GRADUATION_TARGET = 10_000_000 * 10**6;     // 10 Million cNGN
    uint256 public constant CREATOR_REWARD = 500_000 * 10**6;           // 500k cNGN Odogwu bonus

    // Virtual reserves for AMM math
    uint256 public constant INITIAL_VIRTUAL_CNGN = 2_500_000 * 10**6;   // 2.5M cNGN
    uint256 public constant INITIAL_VIRTUAL_TOKEN = 1_000_000_000 * 10**18; // 1B virtual tokens
    uint256 public constant K_CONSTANT = INITIAL_VIRTUAL_CNGN * INITIAL_VIRTUAL_TOKEN;

    // Fees (Basis Points: 10000 = 100%)
    uint256 public constant PLATFORM_FEE_BPS = 100; // 1.00%
    uint256 public constant CREATOR_FEE_BPS = 35;   // 0.35%
    uint256 public constant TOTAL_FEE_BPS = 135;     // 1.35%

    struct TokenState {
        address tokenAddress;
        string name;
        string symbol;
        string imageUri;
        string description;
        address creator;
        uint256 realCngn;          // Real cNGN collected in curve
        uint256 realTokens;        // Real tokens remaining in curve
        uint256 virtualCngn;       // Virtual cNGN reserve
        uint256 virtualTokens;     // Virtual token reserve
        bool graduated;
        uint256 createdAt;
        uint256 totalTrades;
    }

    address[] public allTokens;
    mapping(address => TokenState) public tokens;

    event TokenCreated(
        address indexed tokenAddress,
        string name,
        string symbol,
        string imageUri,
        string description,
        address indexed creator,
        uint256 timestamp
    );

    event Trade(
        address indexed tokenAddress,
        address indexed trader,
        bool isBuy,
        uint256 cngnAmount,
        uint256 tokenAmount,
        uint256 currentPriceKobo,
        uint256 timestamp
    );

    event TokenGraduated(
        address indexed tokenAddress,
        uint256 finalCngnLiquidity,
        uint256 dexTokens,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _cngnToken, address _treasury) {
        require(_cngnToken != address(0), "Invalid cNGN address");
        require(_treasury != address(0), "Invalid treasury address");
        cngnToken = _cngnToken;
        treasury = _treasury;
        owner = msg.sender;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    /**
     * @notice Deploy a new memecoin on Kobo Launchpad
     */
    function createToken(
        string memory name,
        string memory symbol,
        string memory imageUri,
        string memory description
    ) external returns (address) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(symbol).length > 0, "Symbol required");

        KoboToken token = new KoboToken(
            name,
            symbol,
            imageUri,
            description,
            msg.sender,
            address(this)
        );

        address tokenAddr = address(token);

        tokens[tokenAddr] = TokenState({
            tokenAddress: tokenAddr,
            name: name,
            symbol: symbol,
            imageUri: imageUri,
            description: description,
            creator: msg.sender,
            realCngn: 0,
            realTokens: CURVE_SUPPLY,
            virtualCngn: INITIAL_VIRTUAL_CNGN,
            virtualTokens: INITIAL_VIRTUAL_TOKEN,
            graduated: false,
            createdAt: block.timestamp,
            totalTrades: 0
        });

        allTokens.push(tokenAddr);

        emit TokenCreated(
            tokenAddr,
            name,
            symbol,
            imageUri,
            description,
            msg.sender,
            block.timestamp
        );

        return tokenAddr;
    }

    /**
     * @notice Buy memecoins with cNGN
     */
    function buy(address tokenAddr, uint256 cngnIn, uint256 minTokensOut) external returns (uint256 tokensOut) {
        TokenState storage state = tokens[tokenAddr];
        require(state.tokenAddress != address(0), "Coin no dey exist");
        require(!state.graduated, "Coin don already graduate to DEX!");
        require(cngnIn > 0, "Enter amount pass zero");

        // Calculate fees
        uint256 platformFee = (cngnIn * PLATFORM_FEE_BPS) / 10000;
        uint256 creatorFee = (cngnIn * CREATOR_FEE_BPS) / 10000;
        uint256 netCngnIn = cngnIn - platformFee - creatorFee;

        // Pull full cngnIn from buyer
        require(MockCNGN(cngnToken).transferFrom(msg.sender, address(this), cngnIn), "cNGN transfer failed");

        // Send fees immediately
        if (platformFee > 0) {
            MockCNGN(cngnToken).transfer(treasury, platformFee);
        }
        if (creatorFee > 0) {
            MockCNGN(cngnToken).transfer(state.creator, creatorFee);
        }

        // AMM calculation: (V_c + netCngnIn) * (V_t - tokensOut) = k
        uint256 newVirtualCngn = state.virtualCngn + netCngnIn;
        uint256 newVirtualTokens = K_CONSTANT / newVirtualCngn;
        tokensOut = state.virtualTokens - newVirtualTokens;

        // Cap to available real tokens
        if (tokensOut > state.realTokens) {
            tokensOut = state.realTokens;
        }

        require(tokensOut >= minTokensOut, "Slippage too high, chill!");

        // Update state
        state.realCngn += netCngnIn;
        state.realTokens -= tokensOut;
        state.virtualCngn = newVirtualCngn;
        state.virtualTokens = newVirtualTokens;
        state.totalTrades += 1;

        // Transfer tokens to buyer
        require(KoboToken(tokenAddr).transfer(msg.sender, tokensOut), "Token transfer failed");

        // Calculate price in Kobo (1 cNGN = 100 Kobo)
        uint256 priceKobo = (state.virtualCngn * 100 * 10**18) / state.virtualTokens;

        emit Trade(tokenAddr, msg.sender, true, cngnIn, tokensOut, priceKobo, block.timestamp);

        // Check graduation condition
        if (state.realCngn >= GRADUATION_TARGET || state.realTokens == 0) {
            _graduate(tokenAddr);
        }

        return tokensOut;
    }

    /**
     * @notice Sell memecoins back to the bonding curve for cNGN
     */
    function sell(address tokenAddr, uint256 tokensIn, uint256 minCngnOut) external returns (uint256 netCngnOut) {
        TokenState storage state = tokens[tokenAddr];
        require(state.tokenAddress != address(0), "Coin no dey exist");
        require(!state.graduated, "Coin don graduate! Trade on Aerodrome");
        require(tokensIn > 0, "Enter tokens pass zero");

        // Transfer tokens from seller into bonding curve
        require(KoboToken(tokenAddr).transferFrom(msg.sender, address(this), tokensIn), "Token transfer failed");

        // AMM calculation: (V_t + tokensIn) * (V_c - cngnOut) = k
        uint256 newVirtualTokens = state.virtualTokens + tokensIn;
        uint256 newVirtualCngn = K_CONSTANT / newVirtualTokens;
        uint256 grossCngnOut = state.virtualCngn - newVirtualCngn;

        // Cannot pull more real cNGN than is in the curve
        if (grossCngnOut > state.realCngn) {
            grossCngnOut = state.realCngn;
        }

        // Calculate fees
        uint256 platformFee = (grossCngnOut * PLATFORM_FEE_BPS) / 10000;
        uint256 creatorFee = (grossCngnOut * CREATOR_FEE_BPS) / 10000;
        netCngnOut = grossCngnOut - platformFee - creatorFee;

        require(netCngnOut >= minCngnOut, "Slippage too high, chill!");

        // Update state
        state.realCngn -= grossCngnOut;
        state.realTokens += tokensIn;
        state.virtualCngn = newVirtualCngn;
        state.virtualTokens = newVirtualTokens;
        state.totalTrades += 1;

        // Distribute fees & net cNGN
        if (platformFee > 0) {
            MockCNGN(cngnToken).transfer(treasury, platformFee);
        }
        if (creatorFee > 0) {
            MockCNGN(cngnToken).transfer(state.creator, creatorFee);
        }
        MockCNGN(cngnToken).transfer(msg.sender, netCngnOut);

        uint256 priceKobo = (state.virtualCngn * 100 * 10**18) / state.virtualTokens;

        emit Trade(tokenAddr, msg.sender, false, netCngnOut, tokensIn, priceKobo, block.timestamp);

        return netCngnOut;
    }

    /**
     * @dev Trigger graduation when target is reached
     */
    function _graduate(address tokenAddr) internal {
        TokenState storage state = tokens[tokenAddr];
        state.graduated = true;

        // Pay creator Odogwu bonus
        if (state.realCngn >= CREATOR_REWARD) {
            MockCNGN(cngnToken).transfer(state.creator, CREATOR_REWARD);
        }

        uint256 finalLiquidityCngn = state.realCngn > CREATOR_REWARD ? state.realCngn - CREATOR_REWARD : 0;
        uint256 dexTokens = DEX_RESERVE + state.realTokens; // 200M reserved + any unsold

        emit TokenGraduated(tokenAddr, finalLiquidityCngn, dexTokens, block.timestamp);
    }

    // View helper for token count
    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    // View helper for calculating expected tokens out on Buy
    function getAmountOutTokens(address tokenAddr, uint256 cngnIn) external view returns (uint256) {
        TokenState memory state = tokens[tokenAddr];
        if (state.graduated || state.tokenAddress == address(0)) return 0;
        uint256 netCngnIn = cngnIn - ((cngnIn * TOTAL_FEE_BPS) / 10000);
        uint256 newVirtualCngn = state.virtualCngn + netCngnIn;
        uint256 newVirtualTokens = K_CONSTANT / newVirtualCngn;
        uint256 tokensOut = state.virtualTokens - newVirtualTokens;
        return tokensOut > state.realTokens ? state.realTokens : tokensOut;
    }

    // View helper for calculating expected cNGN out on Sell
    function getAmountOutCngn(address tokenAddr, uint256 tokensIn) external view returns (uint256) {
        TokenState memory state = tokens[tokenAddr];
        if (state.graduated || state.tokenAddress == address(0)) return 0;
        uint256 newVirtualTokens = state.virtualTokens + tokensIn;
        uint256 newVirtualCngn = K_CONSTANT / newVirtualTokens;
        uint256 grossCngnOut = state.virtualCngn - newVirtualCngn;
        if (grossCngnOut > state.realCngn) grossCngnOut = state.realCngn;
        return grossCngnOut - ((grossCngnOut * TOTAL_FEE_BPS) / 10000);
    }
}
