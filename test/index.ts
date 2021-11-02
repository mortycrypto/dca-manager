import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ADDRESS_ZERO, BURN_ADDRESS, fromEth, toEth } from "../scripts/utils";
import { DCAManager, RouterMock, TokenMock } from "../typechain";

describe("DCAManager", function () {
	let _DCAManager: DCAManager,
		me: SignerWithAddress,
		alice: SignerWithAddress,
		token1: TokenMock,
		token2: TokenMock,
		router: RouterMock,
		USDC: TokenMock;

	beforeEach(async () => {
		[me, alice] = await ethers.getSigners();

		const RouterMock = await ethers.getContractFactory("RouterMock");
		router = await RouterMock.deploy();

		const TokenMock = await ethers.getContractFactory("TokenMock");

		token1 = await TokenMock.deploy("Token1", "TK1");

		token2 = await TokenMock.deploy("Token2", "TK2");

		USDC = await TokenMock.deploy("USDC", "USDC");

		const DCA_MANAGER = await ethers.getContractFactory("DCAManager");
		_DCAManager = await DCA_MANAGER.deploy(router.address, USDC.address, toEth(20), [token1.address]);
		await _DCAManager.deployed();

		await token1.connect(me).mint(router.address, toEth(1000000));
		await token2.connect(me).mint(router.address, toEth(1000000));
		await USDC.connect(me).mint(me.address, toEth(1000));
	});

	describe("Ownership", () => {
		it("Deployer is Manager owner.", async () => {
			expect(await _DCAManager.owner()).to.be.eq(me.address);
		});

		it("Anyone can send Matic to Manager", async () => {
			const _before = await ethers.provider.getBalance(_DCAManager.address);

			await me.sendTransaction({ to: _DCAManager.address, value: toEth(1) });
			await alice.sendTransaction({ to: _DCAManager.address, value: toEth(1) });

			const _after = await ethers.provider.getBalance(_DCAManager.address);

			expect(_after.sub(_before)).to.be.eq(toEth(2));
		});

		it("Only Owner can withdraw MATIC", async () => {
			await me.sendTransaction({ to: _DCAManager.address, value: toEth(1) });

			const _before = await ethers.provider.getBalance(me.address);
			const _mbefore = await ethers.provider.getBalance(_DCAManager.address);

			await _DCAManager.connect(me)["withdraw(address)"](ADDRESS_ZERO);

			const _after = await ethers.provider.getBalance(me.address);
			const _mafter = await ethers.provider.getBalance(_DCAManager.address);

			expect(_mbefore).to.be.gt(0);
			expect(_before).to.be.lt(_after);
			expect(_mafter).to.be.eq(0);

			await alice.sendTransaction({ to: _DCAManager.address, value: toEth(1) });

			await expect(_DCAManager.connect(alice)["withdraw(address)"](ADDRESS_ZERO)).to.be.reverted;

			expect(await ethers.provider.getBalance(_DCAManager.address)).to.be.eq(toEth(1));
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
			expect(await _DCAManager.assetsLength()).to.be.eq(1);
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
			expect(token1info.token).to.be.eq(token1.address);
		});

		it("Cannot retrieve info if the asset doesnt exists", async () => {
			const length = await _DCAManager.assetsLength();
			await expect(_DCAManager.assetInfo(length)).to.be.reverted;
		});

		it("Can remove asset", async () => {
			const lengthBefore = await _DCAManager.assetsLength();
			await _DCAManager.connect(me).removeAsset(lengthBefore.sub(1));
			expect(await _DCAManager.assetsLength()).to.be.eq(lengthBefore.sub(1));
		});

		it("Cannot remove unexistent asset", async () => {
			const length = await _DCAManager.assetsLength();
			await expect(_DCAManager.connect(me).removeAsset(length)).to.be.reverted;
		});
	});

	describe("Withdrawl", () => {
		it("Can Withdrawl token individualy", async () => {
			const balanceBefore = await token1.balanceOf(_DCAManager.address);

			await _DCAManager.connect(me)["withdraw(address)"](token1.address);

			const ownerBalance = await token1.balanceOf(me.address);
			const balanceAfter = await token1.balanceOf(_DCAManager.address);

			expect(ownerBalance).to.be.eq(balanceBefore);
			expect(balanceAfter).to.be.eq(0);
		});

		it("Can Withdrawl specific amount of a token individualy", async () => {
			await token1.mint(_DCAManager.address, toEth(200));

			const balanceBefore = await token1.balanceOf(_DCAManager.address);
			const ownerBalanceBefore = await token1.balanceOf(me.address);

			await _DCAManager.connect(me)["withdraw(address,uint256)"](token1.address, balanceBefore.div(2));

			const ownerBalance = await token1.balanceOf(me.address);
			const balanceAfter = await token1.balanceOf(_DCAManager.address);

			expect(ownerBalance).to.be.eq(ownerBalanceBefore.add(balanceBefore.div(2)));
			expect(balanceAfter).to.be.eq(balanceBefore.div(2));
		});

		it("Can withdrawn all assets in the same time", async () => {
			const TokenMock = await ethers.getContractFactory("TokenMock");
			const token2 = await TokenMock.deploy("Token2", "TK2");

			await _DCAManager.connect(me).addAsset(token2.address);

			await token1.connect(me)["mint(address,uint256)"](_DCAManager.address, toEth(100));
			await token2.connect(me)["mint(address,uint256)"](_DCAManager.address, toEth(150));

			await me.sendTransaction({ to: _DCAManager.address, value: toEth(1) });

			const token1Bal = await token1.balanceOf(_DCAManager.address);
			const token2Bal = await token2.balanceOf(_DCAManager.address);
			const bal = await ethers.provider.getBalance(_DCAManager.address);

			expect(token1Bal).to.be.gt(0);
			expect(token2Bal).to.be.gt(0);
			expect(bal).to.be.gt(0);

			const token1BalOwner = await token1.balanceOf(me.address);
			const token2BalOwner = await token2.balanceOf(me.address);
			const balOwner = await ethers.provider.getBalance(me.address);

			await _DCAManager.connect(me).withdrawAll();

			expect(await token1.balanceOf(_DCAManager.address)).to.be.eq(0);
			expect(await token2.balanceOf(_DCAManager.address)).to.be.eq(0);
			expect(await ethers.provider.getBalance(_DCAManager.address)).to.be.eq(0);

			expect(await token1.balanceOf(me.address)).to.be.eq(token1BalOwner.add(token1Bal));
			expect(await token2.balanceOf(me.address)).to.be.eq(token2BalOwner.add(token2Bal));
			expect(await ethers.provider.getBalance(me.address)).to.be.gte(balOwner.add(bal).mul(90).div(100)); // 90% for fees.

			// Dont try to send if dont have balances.
			expect(await _DCAManager.connect(me).withdrawAll()).not.emit(_DCAManager, "AssetWithdrawn");
		});
	});

	describe("Boutghts", () => {
		it("Purchase for equal amounts of the payment token.", async () => {
			await USDC.connect(me).approve(_DCAManager.address, toEth(20));

			await _DCAManager.connect(me)["addAsset(address)"](token2.address);

			const balBeforeToken1 = await token1.balanceOf(_DCAManager.address);
			const balBeforeToken2 = await token2.balanceOf(_DCAManager.address);

			await _DCAManager.connect(me).work();

			const balAfterToken1 = await token1.balanceOf(_DCAManager.address);
			const balAfterToken2 = await token2.balanceOf(_DCAManager.address);

			expect(balAfterToken1).to.be.gt(balBeforeToken1);
			expect(balAfterToken2).to.be.gt(balBeforeToken2);

			expect(await USDC.balanceOf(router.address)).to.be.eq(toEth(20));
			expect(balAfterToken1).to.be.eq(balAfterToken2);
		});

		it("Dont try to buy if balance is zero", async () => {
			const amount = await USDC.balanceOf(me.address);
			if (amount.gt(0)) await USDC.connect(me).transfer(BURN_ADDRESS, amount);

			expect(await _DCAManager.connect(me).work()).not.emit(_DCAManager, "AssetPurchased");
		});
	});
});
