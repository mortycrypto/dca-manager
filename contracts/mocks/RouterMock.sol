// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "hardhat/console.sol";

contract RouterMock {
    using SafeMath for uint256;

    function WETH() external pure returns (address) {
        return 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    }

    function factory() external pure returns (address) {
        return 0x000000000000000000000000000000000000dEaD;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);

        uint256 bal = IERC20(path[1]).balanceOf(address(this));

        IERC20(path[1]).transfer(to, bal.div(10));

        amounts;
        amountOutMin;
        to;
        deadline;
    }
}
