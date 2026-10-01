// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockCNGN (Compliant Naira)
 * @notice Mock cNGN ERC20 token for Base Sepolia testnet
 * @dev 6 decimals, matching the real cNGN deployed on Base
 */
contract MockCNGN {
    string public name = "Compliant Naira";
    string public symbol = "cNGN";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    address public owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public lastFaucetTime;

    uint256 public constant FAUCET_AMOUNT = 500_000 * 10**6; // 500,000 cNGN per claim
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event FaucetClaimed(address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        // Mint initial supply of 100,000,000 cNGN to deployer / relayer
        _mint(msg.sender, 100_000_000 * 10**6);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(to != address(0), "Invalid recipient");
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        require(spender != address(0), "Invalid spender");
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(to != address(0), "Invalid recipient");
        require(balanceOf[from] >= value, "Insufficient balance");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= value, "Insufficient allowance");
            allowance[from][msg.sender] -= value;
        }
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function faucet(address to) external {
        require(block.timestamp >= lastFaucetTime[to] + FAUCET_COOLDOWN, "Faucet cooldown active. Chill small!");
        lastFaucetTime[to] = block.timestamp;
        _mint(to, FAUCET_AMOUNT);
        emit FaucetClaimed(to, FAUCET_AMOUNT);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
