// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IWETH.sol";

import "hardhat/console.sol";

contract DCAManager is Ownable {
    using SafeMath for uint256;

    uint256 public lastPurchase;
    uint256 public amountToBought;
    IWETH public immutable WMATIC;
    IERC20 public immutable ASSET;
    IUniswapV2Router02 public router; // Any AMM fork of Uniswapt is compatible.

    struct Asset {
        uint256 lastPurchase;
        IERC20 token;
    }

    Asset[] public assets;

    event AssetAdded(address indexed newToken, uint256 indexed timestamp);
    event AssetRemoved(address indexed removedToken, uint256 indexed timestamp);
    event AssetWithdrawn(address indexed asset, uint256 amount);
    event AssetPurchased(address indexed asset, uint256 amount);

    event RouterUpdated(
        address indexed oldRouter,
        address indexed newRouter,
        uint256 indexed timestamp
    );

    receive() external payable {}

    constructor(
        address _router,
        address _asset,
        uint256 _amountToBought,
        address[] memory _assets
    ) {
        router = IUniswapV2Router02(_router);
        WMATIC = IWETH(router.WETH());
        ASSET = IERC20(_asset);
        amountToBought = _amountToBought;
        lastPurchase = 0;

        for (uint256 i = 0; i < _assets.length; i++) {
            assets.push(Asset({lastPurchase: 0, token: IERC20(_assets[i])}));
        }
    }

    function addAsset(address _token) external onlyOwner {
        require(_token != address(0), "Token is Address Zero.");
        assets.push(Asset({token: IERC20(_token), lastPurchase: 0}));
        emit AssetAdded(_token, block.timestamp);
    }

    function removeAsset(uint256 index) external onlyOwner {
        require(index < assets.length, "Invalid Index.");
        emit AssetRemoved(address(assets[index].token), block.timestamp);
        assets[index] = assets[assets.length - 1];
        assets.pop();
    }

    function assetInfo(uint256 index)
        external
        view
        returns (Asset memory asset)
    {
        require(index < assets.length);
        asset = assets[index];
    }

    function assetsLength() external view returns (uint256) {
        return assets.length;
    }

    function work() external onlyOwner {
        getAsset();
        uint256 totalBalance = ASSET.balanceOf(address(this));

        if (totalBalance > 0) {
            address[] memory path = new address[](2);
            path[0] = address(ASSET);

            ASSET.approve(address(router), totalBalance);

            uint256 amount = totalBalance.div(assets.length);

            for (uint256 i = 0; i < assets.length; i++) {
                IERC20 _token = assets[i].token;

                uint256 _before = _token.balanceOf(address(this));

                path[1] = address(_token);

                router.swapExactTokensForTokens(
                    amount,
                    0,
                    path,
                    address(this),
                    block.timestamp
                );

                uint256 _after = _token.balanceOf(address(this));

                emit AssetPurchased(address(_token), _after.sub(_before));
            }
        }
    }

    function getAsset() internal {
        uint256 bal = ASSET.balanceOf(owner());
        if (bal > amountToBought) {
            ASSET.transferFrom(owner(), address(this), amountToBought);
        }
    }

    function updateRouter(address _router) external onlyOwner {
        require(_router != address(0), "Router cannot be Address Zero.");
        require(
            IUniswapV2Router01(_router).factory() != address(0),
            "Bad Router address"
        );
        emit RouterUpdated(address(router), _router, block.timestamp);
        router = IUniswapV2Router02(_router);
    }

    /// @dev Withdraw individual token.
    function withdraw(address token) external onlyOwner {
        uint256 amount = 0;
        if (token != address(0)) {
            amount = IERC20(token).balanceOf(address(this));
        } else {
            amount = payable(address(this)).balance;
        }

        withdraw(token, amount);
    }

    /// @dev Withdraw individual token.
    function withdraw(address token, uint256 amount)
        public
        onlyOwner
        returns (bool)
    {
        if (token != address(0)) {
            emit AssetWithdrawn(token, amount);
            return IERC20(token).transfer(owner(), amount);
        } else {
            (bool result, ) = payable(owner()).call{value: amount}("");
            emit AssetWithdrawn(address(0), amount);
            return result;
        }
    }

    function withdrawAll() external onlyOwner {
        for (uint256 i = 0; i < assets.length; i++) {
            Asset memory _asset = assets[i];
            uint256 amount = _asset.token.balanceOf(address(this));
            if (amount > 0) {
                _asset.token.transfer(owner(), amount);
                emit AssetWithdrawn(address(_asset.token), amount);
            }
        }

        uint256 bal = payable(address(this)).balance;
        if (bal > 0) {
            (bool result, ) = owner().call{value: bal}("");
            result;
            emit AssetWithdrawn(address(0), bal);
        }
    }
}
