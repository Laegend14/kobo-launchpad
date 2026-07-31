// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MemecoinTemplate
 * @notice Standard ERC-20 token minted 100% to its BondingCurve contract at launch.
 */
contract MemecoinTemplate is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address bondingCurve_
    ) ERC20(name_, symbol_) {
        require(bondingCurve_ != address(0), "Invalid bonding curve address");
        _mint(bondingCurve_, totalSupply_);
    }
}
