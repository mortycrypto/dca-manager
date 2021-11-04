import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ADDRESS_ZERO, BURN_ADDRESS, fromEth, fromUnit, MAX_UINT_256, toBN, toEth, toUnit } from "../scripts/utils";
import { DCAManager, IDebtToken, IERC20, IUniswapV2Router02, RouterMock, TokenMock } from "../typechain";
import { network } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const ME_ADDRESS = process.env.ME_ADDRESS || "";

const ASSETS_ADDRESS = {
	ETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WBTC
	BTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", // WETH
	LUNA: "0x24834BBEc7E39ef42f4a75EAF8E5B6486d3F0e57", //WLuna
	WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", //
	AAVE: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", //
	FTM: "0xB85517b87BF64942adf3A0B9E4c71E4Bc5Caa4e5", //
};

const USDC_WHALE_ADDR = "0x8d520068BB6568adCA50FcfBBEF5C27a1d8B3125";
const BTC_WHALE_ADDR = "0xad94E1C5d1E6B355F534b0438aCc1e188aB39eac";
const ETH_WHALE_ADDR = "0xa0003CDb2F4bc16880a3d0163afe012aFAB6350c";

const USDC_ADDR = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_DECIMALS = 6;
const BTC_DECIMALS = 8;

const AAVE_LENDING_POOL_ADDR = "0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf";
const DEBT_USDC_ADDR = "0x248960a9d75edfa3de94f7193eae3161eb349a12";

const QUICK_ROUTER_ADDR = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";

describe("DCAManager", function () {
	let _DCAManager: DCAManager,
		me: SignerWithAddress,
		usdcWhale: SignerWithAddress,
		btcWhale: SignerWithAddress,
		ethWhale: SignerWithAddress,
		USDC: IERC20,
		BTC: IERC20,
		ETH: IERC20,
		LUNA: IERC20,
		WMATIC: IERC20,
		FTM: IERC20,
		DEBT_USDC: IDebtToken,
		token1: TokenMock,
		token2: TokenMock,
		router: IUniswapV2Router02;

	before(async () => {
		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [USDC_WHALE_ADDR],
		});

		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [BTC_WHALE_ADDR],
		});

		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [ETH_WHALE_ADDR],
		});

		usdcWhale = await ethers.getSigner(USDC_WHALE_ADDR);
		btcWhale = await ethers.getSigner(BTC_WHALE_ADDR);
		ethWhale = await ethers.getSigner(ETH_WHALE_ADDR);

		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [ME_ADDRESS],
		});

		console.log(ME_ADDRESS);
		me = await ethers.getSigner(ME_ADDRESS);

		USDC = await ethers.getContractAt("IERC20", USDC_ADDR);

		BTC = await ethers.getContractAt("IERC20", ASSETS_ADDRESS.BTC);
		ETH = await ethers.getContractAt("IERC20", ASSETS_ADDRESS.ETH);
		LUNA = await ethers.getContractAt("IERC20", ASSETS_ADDRESS.LUNA);
		WMATIC = await ethers.getContractAt("IERC20", ASSETS_ADDRESS.WMATIC);
		FTM = await ethers.getContractAt("IERC20", ASSETS_ADDRESS.FTM);

		DEBT_USDC = await ethers.getContractAt("IDebtToken", DEBT_USDC_ADDR);

		await USDC.connect(usdcWhale).transfer(me.address, toUnit(100, USDC_DECIMALS));

		const [alice] = await ethers.getSigners();

		await alice.sendTransaction({ to: me.address, value: toEth(100) });

		router = await ethers.getContractAt("IUniswapV2Router02", QUICK_ROUTER_ADDR);

	});

	beforeEach(async () => {
		const DCA_MANAGER = await ethers.getContractFactory("DCAManager");
		_DCAManager = await DCA_MANAGER.connect(me).deploy(router.address, USDC.address, toUnit(20, USDC_DECIMALS), [
			BTC.address,
			ETH.address,
			LUNA.address,
			FTM.address,
		]);
		await _DCAManager.deployed();
		await USDC.connect(me).approve(_DCAManager.address, MAX_UINT_256);
	});

	describe("Ownership", () => {
		it("Deployer is Manager owner.", async () => {
			expect(await _DCAManager.owner()).to.be.eq(me.address);
		});

		it("Anyone can send Matic to Manager", async () => {
			const _before = await ethers.provider.getBalance(_DCAManager.address);

			await me.sendTransaction({ to: _DCAManager.address, value: toEth(0.1) });
			await usdcWhale.sendTransaction({ to: _DCAManager.address, value: toEth(0.1) });

			const _after = await ethers.provider.getBalance(_DCAManager.address);

			expect(_after.sub(_before)).to.be.eq(toEth(0.2));
		});

		it("Only Owner can withdraw MATIC", async () => {
			await me.sendTransaction({ to: _DCAManager.address, value: toEth(0.01) });

			const _before = await ethers.provider.getBalance(me.address);
			const _mbefore = await ethers.provider.getBalance(_DCAManager.address);

			await _DCAManager.connect(me)["withdraw(address)"](ADDRESS_ZERO);

			const _after = await ethers.provider.getBalance(me.address);
			const _mafter = await ethers.provider.getBalance(_DCAManager.address);

			expect(_mbefore).to.be.gt(0);
			expect(_before).to.be.lt(_after);
			expect(_mafter).to.be.eq(0);

			await ethWhale.sendTransaction({ to: _DCAManager.address, value: toEth(0.1) });

			await expect(_DCAManager.connect(ethWhale)["withdraw(address)"](ADDRESS_ZERO)).to.be.reverted;

			expect(await ethers.provider.getBalance(_DCAManager.address)).to.be.eq(toEth(0.1));
		});
	});

	describe("Router", () => {
		it("Can be upgraded", async () => {
			const oldRouter = await _DCAManager.router();

			const Router = await ethers.getContractFactory("RouterMock");
			const _router2 = await Router.deploy();

			expect(await _DCAManager.connect(me).updateRouter(_router2.address)).emit(_DCAManager, "RouterUpdated");
			expect(await _DCAManager.router()).to.be.eq(_router2.address);
			expect(oldRouter).not.to.be.eq(_router2.address);

			expect(await _DCAManager.connect(me).updateRouter(router.address)).emit(_DCAManager, "RouterUpdated");
			expect(await _DCAManager.router()).to.be.eq(router.address);
		});

		it("Cannot be zero", async () => {
			await expect(_DCAManager.connect(me).updateRouter(ADDRESS_ZERO)).to.be.revertedWith(
				"Router cannot be Address Zero."
			);
		});

		it("Must be a valid Router", async () => {
			await expect(_DCAManager.connect(me).updateRouter(BURN_ADDRESS)).to.be.reverted;
		});
	});

	describe("Assets", () => {
		it("Can be set on constructor", async () => {
			expect(await _DCAManager.assetsLength()).to.be.eq(4);
		});

		it("Can be added later", async () => {
			const lengthBefore = await _DCAManager.assetsLength();

			const TokenMock = await ethers.getContractFactory("TokenMock");
			const token2 = await TokenMock.deploy("Token2", "TK2");

			await _DCAManager.connect(me).addAsset(token2.address);

			expect(await _DCAManager.assetsLength()).to.be.eq(lengthBefore.add(1));
		});

		it("Cannot be Zero", async () => {
			await expect(_DCAManager.connect(me).addAsset(ADDRESS_ZERO)).to.be.revertedWith("Token is Address Zero");
		});

		it("Can retrieve info of an asset", async () => {
			const token1info = await _DCAManager.assetInfo(0);
			expect(token1info.token).to.be.eq(BTC.address);
		});

		it("Cannot retrieve info if the asset doesnt exists", async () => {
			const length = await _DCAManager.assetsLength();
			await expect(_DCAManager.assetInfo(length)).to.be.reverted;
		});

		it("Can remove asset", async () => {
			const lengthBefore = await _DCAManager.assetsLength();
			await _DCAManager.connect(me)["removeAsset(uint256)"](lengthBefore.sub(1));
			expect(await _DCAManager.assetsLength()).to.be.eq(lengthBefore.sub(1));
		});

		it("Cannot remove unexistent asset", async () => {
			const length = await _DCAManager.assetsLength();
			await expect(_DCAManager.connect(me)["removeAsset(uint256)"](length)).to.be.reverted;
		});

		it("Can remove and withdraw asset in the same time", async () => {
			const balBTC = await BTC.balanceOf(btcWhale.address);
			const amountBTC = balBTC.div(10);

			await BTC.connect(btcWhale).transfer(_DCAManager.address, amountBTC);

			const balBeforeManager = await BTC.balanceOf(_DCAManager.address);
			const balBeforeOwner = await BTC.balanceOf(me.address);

			const length = await _DCAManager.assetsLength();

			await expect(_DCAManager.connect(me)["removeAsset(uint256,bool)"](length.add(99), true)).to.be.reverted;
			expect(await _DCAManager.connect(me)["removeAsset(uint256,bool)"](0, true))
				.emit(_DCAManager, "AssetWithdrawn")
				.withArgs(BTC.address, balBeforeManager);

			const balAfterManager = await BTC.balanceOf(_DCAManager.address);
			const balAfterOwner = await BTC.balanceOf(me.address);

			expect(balBeforeOwner.add(balBeforeManager)).to.be.eq(balAfterOwner);
			expect(balAfterManager).to.be.eq(0);

			const balBTCII = await BTC.balanceOf(btcWhale.address);
			const amountBTCII = balBTCII.div(10);

			await BTC.connect(btcWhale).transfer(_DCAManager.address, amountBTCII);

			await _DCAManager.connect(me).addAsset(BTC.address);

			const balBeforeManagerII = await BTC.balanceOf(_DCAManager.address);
			const balBeforeOwnerII = await BTC.balanceOf(me.address);

			expect(await _DCAManager.connect(me)["removeAsset(uint256,bool)"](0, false)).not.emit(
				_DCAManager,
				"AssetWithdrawn"
			);

			const balAfterManagerII = await BTC.balanceOf(_DCAManager.address);
			const balAfterOwnerII = await BTC.balanceOf(me.address);

			expect(balAfterOwnerII).to.be.eq(balBeforeOwnerII);
			expect(balAfterManagerII).to.be.eq(balBeforeManagerII);
		});
	});

	describe("Withdrawl", () => {
		it("Can Withdrawl token individualy", async () => {
			const balBTCWhale = await BTC.balanceOf(_DCAManager.address);
			await BTC.connect(btcWhale)["transfer(address,uint256)"](_DCAManager.address, balBTCWhale.div(10));

			const balanceBefore = await BTC.balanceOf(_DCAManager.address);
			const ownerBalanceBefore = await BTC.balanceOf(me.address);

			await _DCAManager.connect(me)["withdraw(address)"](BTC.address);

			const ownerBalance = await BTC.balanceOf(me.address);
			const balanceAfter = await BTC.balanceOf(_DCAManager.address);

			expect(ownerBalanceBefore.add(balanceBefore)).to.be.eq(ownerBalance);
			expect(balanceAfter).to.be.eq(0);
		});

		it("Can Withdrawl specific amount of a token individualy", async () => {
			const btcWhaleBalance = await BTC.balanceOf(btcWhale.address);
			await BTC.connect(btcWhale)["transfer(address,uint256)"](
				_DCAManager.address,
				btcWhaleBalance.mul(100).div(10000)
			);

			const balanceBefore = await BTC.balanceOf(_DCAManager.address);
			const ownerBalanceBefore = await BTC.balanceOf(me.address);

			const amount = balanceBefore.div(10);

			await _DCAManager.connect(me)["withdraw(address,uint256)"](BTC.address, amount);

			const ownerBalance = await BTC.balanceOf(me.address);
			const balanceAfter = await BTC.balanceOf(_DCAManager.address);

			expect(ownerBalance).to.be.eq(ownerBalanceBefore.add(amount));
			expect(balanceAfter).to.be.eq(balanceBefore.sub(amount));
		});

		it("Can withdrawn all assets in the same time", async () => {
			await _DCAManager.connect(me).addAsset(ETH.address);

			const btcWhaleBalance = await BTC.balanceOf(btcWhale.address);
			const ethWhaleBalance = await ETH.balanceOf(ethWhale.address);

			await BTC.connect(btcWhale).transfer(_DCAManager.address, btcWhaleBalance.mul(100).div(10000));
			await ETH.connect(ethWhale).transfer(_DCAManager.address, ethWhaleBalance.mul(100).div(10000));

			await me.sendTransaction({ to: _DCAManager.address, value: toEth(0.1) });

			const btcBal = await BTC.balanceOf(_DCAManager.address);
			const ethBal = await ETH.balanceOf(_DCAManager.address);
			const bal = await ethers.provider.getBalance(_DCAManager.address);

			expect(btcBal).to.be.gt(0);
			expect(ethBal).to.be.gt(0);
			expect(bal).to.be.gt(0);

			const btcBalOwner = await BTC.balanceOf(me.address);
			const ethBalOwner = await ETH.balanceOf(me.address);
			const balOwner = await ethers.provider.getBalance(me.address);

			await _DCAManager.connect(me).withdrawAll();

			expect(await BTC.balanceOf(_DCAManager.address)).to.be.eq(0);
			expect(await ETH.balanceOf(_DCAManager.address)).to.be.eq(0);
			expect(await ethers.provider.getBalance(_DCAManager.address)).to.be.eq(0);

			expect(await BTC.balanceOf(me.address)).to.be.eq(btcBalOwner.add(btcBal));
			expect(await ETH.balanceOf(me.address)).to.be.eq(ethBalOwner.add(ethBal));
			expect(await ethers.provider.getBalance(me.address)).to.be.gte(balOwner.add(bal).mul(90).div(100)); // 90% for fees.

			// Dont try to send if dont have balances.
			expect(await _DCAManager.connect(me).withdrawAll()).not.emit(_DCAManager, "AssetWithdrawn");
		});

		it("Withdraw the maximum amount in case of trying to withdraw an amount greater than the current balance.", async () => {
			const btcWhaleBalance = await BTC.balanceOf(btcWhale.address);
			await BTC.connect(btcWhale).transfer(_DCAManager.address, btcWhaleBalance.mul(100).div(10000));

			const balBefore = await BTC.balanceOf(_DCAManager.address);
			const balBeforeOwner = await BTC.balanceOf(me.address);

			const exceededAmount = balBefore.add(toEth(1));

			expect(await _DCAManager.connect(me)["withdraw(address,uint256)"](BTC.address, exceededAmount)).emit(
				_DCAManager,
				"AssetWithdrawalExceedsBalance"
			);

			const balAfter = await BTC.balanceOf(_DCAManager.address);
			const balAfterOwner = await BTC.balanceOf(me.address);

			expect(balBefore).to.be.gt(0);
			expect(balAfter).to.be.eq(0);
			expect(balAfterOwner.sub(balBeforeOwner)).to.be.eq(balBefore);
		});
	});

	describe("Work", () => {
		it("Purchase for equal amounts of the payment token.", async () => {

			const balBeforeBTC = await BTC.balanceOf(_DCAManager.address);
			const balBeforeETH = await ETH.balanceOf(_DCAManager.address);

			await _DCAManager.connect(me).work();

			const balAfterBTC = await BTC.balanceOf(_DCAManager.address);
			const balAfterETH = await ETH.balanceOf(_DCAManager.address);

			expect(balAfterBTC).to.be.gt(balBeforeBTC);
			expect(balAfterETH).to.be.gt(balBeforeETH);

		}).timeout(60 * 1000);

		it("Can change destination after buy", async () => {

			const balBeforeToken1Manager = await BTC.balanceOf(_DCAManager.address);
			const balBeforeToken2Manager = await ETH.balanceOf(_DCAManager.address);

			const balBeforeToken1 = await BTC.balanceOf(me.address);
			const balBeforeETH = await ETH.balanceOf(me.address);

			expect(await _DCAManager.connect(me).updateAutoWithdraw(true)).emit(_DCAManager, "AutoWithdrawUpdated");

			await _DCAManager.connect(me).work();

			const balAfterToken1Manager = await BTC.balanceOf(_DCAManager.address);
			const balAfterToken2Manager = await ETH.balanceOf(_DCAManager.address);

			const balAfterBTC = await BTC.balanceOf(me.address);
			const balAfterETH = await ETH.balanceOf(me.address);

			expect(balAfterToken1Manager.sub(balBeforeToken1Manager)).to.be.eq(0);
			expect(balAfterToken2Manager.sub(balBeforeToken2Manager)).to.be.eq(0);

			expect(balAfterBTC).to.be.gt(balBeforeToken1);
			expect(balAfterETH).to.be.gt(balBeforeETH);

		}).timeout(60 * 1000);

		it("Cant change state if is the same state", async () => {
			expect(await _DCAManager.connect(me).updateAutoWithdraw(true)).emit(_DCAManager, "AutoWithdrawUpdated");
			expect(await _DCAManager.connect(me).updateAutoWithdraw(true)).not.emit(_DCAManager, "AutoWithdrawUpdated");
		}).timeout(60 * 1000);

		it("Dont try to buy if balance is zero", async () => {
			const amount = await USDC.balanceOf(me.address);
			if (amount.gt(0)) await USDC.connect(me).transfer(BURN_ADDRESS, amount);

			expect(await _DCAManager.connect(me).work()).not.emit(_DCAManager, "AssetPurchased");
		}).timeout(60 * 1000);
	});

	describe("Liquidate", () => {
		it("Can liquidate an entire asset in the Manager", async () => {
			const balBTCWhale = await BTC.balanceOf(btcWhale.address);
			await BTC.connect(btcWhale).transfer(_DCAManager.address, balBTCWhale.div(10));

			const balBeforeManager = await BTC.balanceOf(_DCAManager.address);
			const balBeforeOwner = await USDC.balanceOf(me.address);

			expect(await _DCAManager.connect(me).liquidateAsset(BTC.address, 0)).emit(
				_DCAManager,
				"AssetLiquidated"
			);

			const balAfterManager = await BTC.balanceOf(_DCAManager.address);
			const balAfterOwner = await USDC.balanceOf(me.address);

			expect(balBeforeManager).to.be.gt(0);
			expect(balAfterManager).to.be.eq(0);
			expect(balAfterOwner.sub(balBeforeOwner)).to.be.gt(0);
		});

		it("Can partially liquidate an asset in the Manager", async () => {
			const balETHWhale = await ETH.balanceOf(ethWhale.address);
			await ETH.connect(ethWhale).transfer(_DCAManager.address, balETHWhale.div(10));

			const balBeforeManager = await ETH.balanceOf(_DCAManager.address);
			const balBeforeOwner = await USDC.balanceOf(me.address);

			expect(await _DCAManager.connect(me).liquidateAsset(ETH.address, balBeforeManager.div(10)))
				.emit(_DCAManager, "AssetLiquidated")
				.withArgs(ETH.address, balBeforeManager.div(10));

			const balAfterManager = await ETH.balanceOf(_DCAManager.address);
			const balAfterOwner = await USDC.balanceOf(me.address);

			expect(balBeforeManager.sub(balAfterManager)).to.be.eq(balBeforeManager.div(10));
			expect(balAfterOwner.sub(balBeforeOwner)).to.be.gt(0);
		});

		it("Will not try to send anything if there is no balance of the asset to be liquidated.", async () => {
			await _DCAManager.connect(me)["withdraw(address)"](BTC.address);
			const bal = await BTC.balanceOf(_DCAManager.address);
			expect(bal).to.be.eq(0);

			expect(await _DCAManager.connect(me).liquidateAsset(BTC.address, 0)).not.emit(
				_DCAManager,
				"AssetLiquidated"
			);
		});

		it("Doesnt allow to liquidate Matic.", async () => {
			const balETHWhale = await ETH.balanceOf(ethWhale.address);
			await ETH.connect(ethWhale).transfer(_DCAManager.address, balETHWhale.div(10));

			const bal = await ETH.balanceOf(_DCAManager.address);

			await expect(_DCAManager.connect(me).liquidateAsset(ADDRESS_ZERO, 0)).to.be.reverted;

			expect(await ETH.balanceOf(_DCAManager.address)).to.be.eq(bal);
		});

		it("Panic!", async () => {
			const balBTCWhale = await BTC.balanceOf(btcWhale.address);
			const balETHWhale = await ETH.balanceOf(ethWhale.address);
			await BTC.connect(btcWhale).transfer(_DCAManager.address, balBTCWhale.div(10));
			await ETH.connect(ethWhale).transfer(_DCAManager.address, balETHWhale.div(10));

			const balToken1ManagerBefore = await BTC.balanceOf(_DCAManager.address);
			const balToken2ManagerBefore = await ETH.balanceOf(_DCAManager.address);

			const balOwnerBefore = await USDC.balanceOf(me.address);

			expect(await _DCAManager.connect(me).panic()).emit(_DCAManager, "PanicAtTheDisco");

			const balToken1ManagerAfter = await BTC.balanceOf(_DCAManager.address);
			const balToken2ManagerAfter = await ETH.balanceOf(_DCAManager.address);

			const balOwnerAfter = await USDC.balanceOf(me.address);

			expect(balToken1ManagerBefore).not.to.be.eq(0);
			expect(balToken2ManagerBefore).not.to.be.eq(0);

			expect(balToken1ManagerAfter).to.be.eq(0);
			expect(balToken2ManagerAfter).to.be.eq(0);

			expect(balOwnerAfter).to.be.gt(balOwnerBefore);
		});
	});
});
