import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { parseEther, formatEther, parseUnits, formatUnits } from "@ethersproject/units";
import { ethers } from "hardhat";

export const toEth = (n: string | number) => parseEther(n.toString());
export const fromEth = (n: BigNumberish) => formatEther(n);
export const toBN = (n: string | number) => BigNumber.from(n);
export const fromBN = (n: BigNumberish) => n.toString();
export const toUnit = (n: string | number, decimals?: BigNumberish) => parseUnits(n.toString(), decimals || 18);
export const fromUnit = (n: BigNumberish, decimals?: BigNumberish) => formatUnits(n, decimals || 18);

export const ADDRESS_ZERO = ethers.constants.AddressZero;
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
export const MAX_UINT_256 = ethers.constants.MaxUint256;