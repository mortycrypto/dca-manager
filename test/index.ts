import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ADDRESS_ZERO, BURN_ADDRESS, fromEth, toEth } from "../scripts/utils";
import { DCAManager, TokenMock } from "../typechain";

describe("DCAManager", function () {
    let _DCAManager: DCAManager, me: SignerWithAddress, alice: SignerWithAddress, token1: TokenMock;

    before(async () => {
        [me, alice] = await ethers.getSigners();

        const RouterMock = await ethers.getContractFactory("RouterMock");
        const _router1 = await RouterMock.deploy();

        const TokenMock = await ethers.getContractFactory("TokenMock");
        token1 = await TokenMock.deploy("Token1", "TK1");

        const DCA_MANAGER = await ethers.getContractFactory("DCAManager");
        _DCAManager = await DCA_MANAGER.deploy(_router1.address, [token1.address]);
        await _DCAManager.deployed();

        await token1.mint(_DCAManager.address, toEth(100));

    });

    describe('Ownership', () => {
        it("Deployer is owner", async () => {
            expect(await _DCAManager.owner()).to.be.eq(me.address);
        });

        it("Deployer can send Matic to Manager", async () => {
            const _before = await ethers.provider.getBalance(_DCAManager.address);
            await me.sendTransaction({ to: _DCAManager.address, value: toEth(1) });
            const _after = await ethers.provider.getBalance(_DCAManager.address);

            expect(_before).to.be.lt(_after);
        })

        it("Only Owner can withdrawl MATIC", async () => {
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
        });

    });

    describe('Router', () => {
        it("Can be updated", async () => {
            const oldRouter = await _DCAManager.router();

            const Router = await ethers.getContractFactory("RouterMock");
            const _router2 = await Router.deploy();

            expect(await _DCAManager.connect(me).updateRouter(_router2.address)).emit(_DCAManager, "RouterUpdated");
            expect(await _DCAManager.router()).to.be.eq(_router2.address);
            expect(oldRouter).not.to.be.eq(_router2.address);
        });

        it("Cannot be zero", async () => {
            await expect(_DCAManager.connect(me).updateRouter(ADDRESS_ZERO)).to.be.revertedWith("Router cannot be Address Zero.")
        });

        it("Can be a valid Router", async () => {
            await expect(_DCAManager.connect(me).updateRouter(BURN_ADDRESS)).to.be.reverted;
        })
    })

    describe('Assets', () => {
        it("Can be set on constructor", async () => {
            expect(await _DCAManager.assetsLength()).to.be.eq(1);
        })

        it("Can be added after", async () => {
            const lengthBefore = await _DCAManager.assetsLength();

            const TokenMock = await ethers.getContractFactory("TokenMock");
            const token2 = await TokenMock.deploy("Token2", "TK2");

            await _DCAManager.connect(me).addAsset(token2.address);

            expect(await _DCAManager.assetsLength()).to.be.eq(lengthBefore.add(1));

        });

        it("Cannot be Zero", async () => {
            await expect(_DCAManager.connect(me).addAsset(ADDRESS_ZERO)).to.be.revertedWith("Token is Address Zero");
        })

        it("Can retrive info of a asset", async () => {
            const token1info = await _DCAManager.assetInfo(0);
            expect(token1info.token).to.be.eq(token1.address);
        })

        it("Cannot retrive info if token not exists", async () => {
            const length = await _DCAManager.assetsLength();
            await expect(_DCAManager.assetInfo(length)).to.be.reverted;
        })

        it("Can remove asset", async () => {
            const lengthBefore = await _DCAManager.assetsLength();
            await _DCAManager.connect(me).removeAsset(1);
            expect(await _DCAManager.assetsLength()).to.be.eq(lengthBefore.sub(1));
        });

        it("Cannot remove unexistent asset", async () => {
            const length = await _DCAManager.assetsLength();
            await expect(_DCAManager.connect(me).removeAsset(length)).to.be.reverted;
        })
    })

    describe('Withdrawl', () => {
        it("Can Withdrawl token individualy", async () => {
            const balanceBefore = await token1.balanceOf(_DCAManager.address);

            await _DCAManager.connect(me)["withdraw(address)"](token1.address);

            const ownerBalance = await token1.balanceOf(me.address);
            const balanceAfter = await token1.balanceOf(_DCAManager.address);

            expect(ownerBalance).to.be.eq(balanceBefore);
            expect(balanceAfter).to.be.eq(0);
        })

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

            await token1.connect(me).transfer(_DCAManager.address, toEth(100));
            await token2.connect(me).transfer(_DCAManager.address, toEth(150));

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

        })
    })

});
