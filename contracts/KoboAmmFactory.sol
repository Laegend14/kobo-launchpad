// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./KoboAmmPair.sol";

/**
 * @title KoboAmmFactory
 * @notice Factory for deploying and tracking Kobo AMM constant product liquidity pairs
 */
contract KoboAmmFactory {
    address public feeToSetter;
    address public feeTo;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 allPairsLength);

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "KoboAMM: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "KoboAMM: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "KoboAMM: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "KoboAMM: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "KoboAMM: PAIR_EXISTS");

        KoboAmmPair newPair = new KoboAmmPair();
        newPair.initialize(token0, token1);

        pair = address(newPair);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
