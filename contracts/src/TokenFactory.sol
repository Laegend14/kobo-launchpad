// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MemecoinTemplate.sol";
import "./BondingCurve.sol";

/**
 * @title TokenFactory
 * @notice Factory contract for launching Naira memecoins with automated bonding curves.
 */
contract TokenFactory is Ownable {
    address public immutable cngnToken;
    address public immutable migrationRouter;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1 Billion tokens
    uint256 public constant VIRTUAL_CNGN_RESERVE = 3_000 * 1e18; // 3,000 cNGN virtual offset
    uint256 public constant MIGRATION_THRESHOLD = 50_000 * 1e18; // 50,000 cNGN graduation goal

    address[] public allTokens;
    mapping(address => address) public tokenToCurve;
    mapping(address => bool) public isLaunchedToken;
    // On-chain metadata URI (image URL) per token — read directly by clients so token
    // discovery + image never depend on any off-chain indexer or database.
    mapping(address => string) public tokenMetadataURI;

    event TokenLaunched(
        address indexed token,
        address indexed curve,
        string name,
        string symbol,
        string metadataURI,
        address indexed creator,
        uint256 timestamp
    );

    constructor(address _cngnToken, address _migrationRouter) Ownable(msg.sender) {
        require(_cngnToken != address(0), "Invalid cNGN address");
        require(_migrationRouter != address(0), "Invalid migration router");
        cngnToken = _cngnToken;
        migrationRouter = _migrationRouter;
    }

    /**
     * @notice Launch a new Naira-native memecoin.
     * @param name Token name
     * @param symbol Token symbol
     * @param metadataURI Off-chain metadata URI (IPFS/S3 image + description)
     */
    function launchToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI
    ) external returns (address token, address curve) {
        require(bytes(name).length > 0, "Empty name");
        require(bytes(symbol).length > 0, "Empty symbol");

        // 1. Deploy BondingCurve with msg.sender as creator
        BondingCurve newCurve = new BondingCurve(
            cngnToken,
            migrationRouter,
            msg.sender,
            VIRTUAL_CNGN_RESERVE,
            TOTAL_SUPPLY,
            MIGRATION_THRESHOLD
        );
        curve = address(newCurve);

        // 2. Deploy MemecoinTemplate minting 100% supply to curve
        MemecoinTemplate newToken = new MemecoinTemplate(name, symbol, TOTAL_SUPPLY, curve);
        token = address(newToken);

        // 3. Link token in curve
        newCurve.setToken(token);

        allTokens.push(token);
        tokenToCurve[token] = curve;
        isLaunchedToken[token] = true;
        tokenMetadataURI[token] = metadataURI;

        emit TokenLaunched(token, curve, name, symbol, metadataURI, msg.sender, block.timestamp);
    }

    function getAllTokensCount() external view returns (uint256) {
        return allTokens.length;
    }
}
