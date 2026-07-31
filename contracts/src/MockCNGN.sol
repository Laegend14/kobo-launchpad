// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockCNGN
 * @notice Simulates cNGN (Nigeria's regulated Naira stablecoin) for testnet development.
 */
contract MockCNGN is ERC20, Ownable {
    constructor() ERC20("Mock Compliant Naira", "mcNGN") Ownable(msg.sender) {}

    /**
     * @notice Simulates fiat deposit -> cNGN minting flow.
     * @param to Recipient address
     * @param amount cNGN amount in wei (18 decimals)
     */
    function faucetMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Simulates cNGN redemption -> fiat bank payout flow.
     * @param from Wallet address redeeming cNGN
     * @param amount cNGN amount in wei (18 decimals)
     */
    function faucetBurn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
