import hre from "hardhat";
import { toUnit } from "./utils";

const ME_ADDRESS = process.env.ME_ADDRESS || "";

const ASSETS_ADDRESS = {
	ETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WBTC
	BTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", // WETH
	LUNA: "0x24834BBEc7E39ef42f4a75EAF8E5B6486d3F0e57", //WLuna
	WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", //
	AAVE: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", //
	FTM: "0xB85517b87BF64942adf3A0B9E4c71E4Bc5Caa4e5", //
};

const USDC_ADDR = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const DEBT_USDC_ADDR = "0x248960a9d75edfa3de94f7193eae3161eb349a12";

const AAVE_LENDING_POOL_ADDR = "0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf";
const QUICK_ROUTER_ADDR = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";

const USDC_DECIMALS = 6;

const contractAddress = "0x43cc1edc3B376d9c392ee2fdC80043Caba82f901";

const main = async () => {
	await hre.run("verify:verify", {
		address: contractAddress,
		constructorArguments: [
			QUICK_ROUTER_ADDR,
			USDC_ADDR,
			toUnit(12.5, USDC_DECIMALS),
			AAVE_LENDING_POOL_ADDR,
			[ASSETS_ADDRESS.BTC, ASSETS_ADDRESS.ETH, ASSETS_ADDRESS.LUNA, ASSETS_ADDRESS.AAVE, ASSETS_ADDRESS.FTM],
		],
	});
};

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.log(err);
		process.exit(1);
	});
