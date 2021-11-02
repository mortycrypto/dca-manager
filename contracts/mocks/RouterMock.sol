// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract RouterMock {
    function WETH() external pure returns (address) {
        return 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    }

    function factory() external pure returns (address) {
        return 0x000000000000000000000000000000000000dEaD;
    }
}
