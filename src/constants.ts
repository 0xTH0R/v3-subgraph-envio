import { BigDecimal } from "generated";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

export const ZERO_BI = 0n;
export const ONE_BI = 1n;
export const ZERO_BD = new BigDecimal("0");
export const ONE_BD = new BigDecimal("1");
export const BI_18 = 18n;

// Chain-specific constants for Arbitrum One
export const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
export const NONFUNGIBLE_POSITION_MANAGER_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

export const REFERENCE_TOKEN = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; // WETH on Arbitrum
export const STABLE_TOKEN_POOL = "0x17c14d2c404d167802b16c450d3c99f88f2c4f4d";

export const MINIMUM_NATIVE_LOCKED = new BigDecimal("20");

// Whitelist tokens for USD pricing
export const WHITELIST_TOKENS: string[] = [
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // USDC
  "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
];

export const STABLE_COINS: string[] = [
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // USDC
  "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
];

export const SKIP_POOLS: string[] = [];

export interface TokenDefinition {
  address: string;
  symbol: string;
  name: string;
  decimals: bigint;
}

export const STATIC_TOKEN_DEFINITIONS: TokenDefinition[] = [
  {
    address: REFERENCE_TOKEN,
    symbol: "WETH",
    name: "Wrapped Ethereum",
    decimals: 18n,
  },
  {
    address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6n,
  },
];
