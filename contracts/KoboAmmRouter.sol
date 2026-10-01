// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./KoboAmmPair.sol";

interface IKoboAmmFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IKoboAmmPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function mint(address to) external returns (uint256 liquidity);
    function burn(address to) external returns (uint256 amount0, uint256 amount1);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title KoboAmmRouter
 * @notice Router for trading and liquidity management on Kobo AMM
 */
contract KoboAmmRouter {
    address public immutable factory;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "KoboAMM: EXPIRED");
        _;
    }

    constructor(address _factory) {
        factory = _factory;
    }

    // Helper to calculate optimal amounts for liquidity
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        if (IKoboAmmFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IKoboAmmFactory(factory).createPair(tokenA, tokenB);
        }
        address pair = IKoboAmmFactory(factory).getPair(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = IKoboAmmPair(pair).getReserves();
        (uint256 reserveA, uint256 reserveB) = tokenA < tokenB ? (reserve0, reserve1) : (reserve1, reserve0);

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "KoboAMM: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "KoboAMM: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = IKoboAmmFactory(factory).getPair(tokenA, tokenB);

        require(IERC20(tokenA).transferFrom(msg.sender, pair, amountA), "KoboAMM: TRANSFER_A_FAILED");
        require(IERC20(tokenB).transferFrom(msg.sender, pair, amountB), "KoboAMM: TRANSFER_B_FAILED");

        liquidity = IKoboAmmPair(pair).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = IKoboAmmFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "KoboAMM: PAIR_NOT_FOUND");

        require(IKoboAmmPair(pair).transferFrom(msg.sender, pair, liquidity), "KoboAMM: LP_TRANSFER_FAILED");
        (uint256 amount0, uint256 amount1) = IKoboAmmPair(pair).burn(to);
        (amountA, amountB) = tokenA < tokenB ? (amount0, amount1) : (amount1, amount0);

        require(amountA >= amountAMin, "KoboAMM: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "KoboAMM: INSUFFICIENT_B_AMOUNT");
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "KoboAMM: INSUFFICIENT_OUTPUT_AMOUNT");

        address pair = IKoboAmmFactory(factory).getPair(path[0], path[1]);
        require(pair != address(0), "KoboAMM: PAIR_DOES_NOT_EXIST");

        require(IERC20(path[0]).transferFrom(msg.sender, pair, amounts[0]), "KoboAMM: INPUT_TRANSFER_FAILED");

        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, "KoboAMM: EXCESSIVE_INPUT_AMOUNT");

        address pair = IKoboAmmFactory(factory).getPair(path[0], path[1]);
        require(pair != address(0), "KoboAMM: PAIR_DOES_NOT_EXIST");

        require(IERC20(path[0]).transferFrom(msg.sender, pair, amounts[0]), "KoboAMM: INPUT_TRANSFER_FAILED");

        _swap(amounts, path, to);
    }

    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = input < output ? (input, output) : (output, input);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? IKoboAmmFactory(factory).getPair(output, path[i + 2]) : _to;
            address pair = IKoboAmmFactory(factory).getPair(input, output);
            IKoboAmmPair(pair).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    // Math quote helper
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        require(amountA > 0, "KoboAMM: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "KoboAMM: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "KoboAMM: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "KoboAMM: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountIn) {
        require(amountOut > 0, "KoboAMM: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "KoboAMM: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

    function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts) {
        require(path.length >= 2, "KoboAMM: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            address pair = IKoboAmmFactory(factory).getPair(path[i], path[i + 1]);
            require(pair != address(0), "KoboAMM: PAIR_DOES_NOT_EXIST");
            (uint112 reserve0, uint112 reserve1,) = IKoboAmmPair(pair).getReserves();
            (uint256 reserveIn, uint256 reserveOut) = path[i] < path[i + 1] ? (reserve0, reserve1) : (reserve1, reserve0);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function getAmountsIn(uint256 amountOut, address[] memory path) public view returns (uint256[] memory amounts) {
        require(path.length >= 2, "KoboAMM: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            address pair = IKoboAmmFactory(factory).getPair(path[i - 1], path[i]);
            require(pair != address(0), "KoboAMM: PAIR_DOES_NOT_EXIST");
            (uint112 reserve0, uint112 reserve1,) = IKoboAmmPair(pair).getReserves();
            (uint256 reserveIn, uint256 reserveOut) = path[i - 1] < path[i] ? (reserve0, reserve1) : (reserve1, reserve0);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }
}
