import { BigDecimal } from "generated";
import {
  MINIMUM_NATIVE_LOCKED,
  REFERENCE_TOKEN,
  STABLE_COINS,
  STABLE_TOKEN_POOL,
  WHITELIST_TOKENS,
  ZERO_BI
} from "./constants";
import { ZERO_BD, ONE_BD } from "./constants";
import { exponentToBigDecimal, safeDiv } from "./utils";

const Q192 = 2n ** 192n;

export function sqrtPriceX96ToTokenPrices(
  sqrtPriceX96: bigint,
  token0Decimals: bigint,
  token1Decimals: bigint
): BigDecimal[] {
  const num = new BigDecimal((sqrtPriceX96 * sqrtPriceX96).toString());
  const denom = new BigDecimal(Q192.toString());

  const price1 = safeDiv(
    safeDiv(num, denom).times(exponentToBigDecimal(token0Decimals)),
    exponentToBigDecimal(token1Decimals)
  );

  const price0 = safeDiv(ONE_BD, price1);
  return [price0, price1];
}

export async function getEthPriceInUSD(context: any): Promise<BigDecimal> {
  const stablePool = STABLE_TOKEN_POOL;
  const pool = await context.Pool.get(stablePool);

  if (pool) {
    const token0Id = pool.token0_id.toLowerCase();
    if (token0Id === REFERENCE_TOKEN.toLowerCase()) {
      return pool.token1Price;
    } else {
      return pool.token0Price;
    }
  }
  return ZERO_BD;
}

export async function findEthPerToken(
  token: { id: string; whitelistPools: string[] },
  context: any
): Promise<BigDecimal> {
  if (token.id.toLowerCase() === REFERENCE_TOKEN.toLowerCase()) {
    return ONE_BD;
  }

  const whiteList = token.whitelistPools;
  let largestLiquidityETH = ZERO_BD;
  let priceSoFar = ZERO_BD;

  const bundle = await context.Bundle.get("1");
  if (!bundle) return ZERO_BD;

  // hardcoded fix for incorrect rates
  if (STABLE_COINS.includes(token.id.toLowerCase())) {
    priceSoFar = safeDiv(ONE_BD, bundle.ethPriceUSD);
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      const poolAddress = whiteList[i];
      const pool = await context.Pool.get(poolAddress);

      if (pool && pool.liquidity > ZERO_BI) {
        if (pool.token0_id.toLowerCase() === token.id.toLowerCase()) {
          const token1 = await context.Token.get(pool.token1_id);
          if (token1) {
            const ethLocked = pool.totalValueLockedToken1.times(token1.derivedETH);
            if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_NATIVE_LOCKED)) {
              largestLiquidityETH = ethLocked;
              priceSoFar = pool.token1Price.times(token1.derivedETH);
            }
          }
        }
        if (pool.token1_id.toLowerCase() === token.id.toLowerCase()) {
          const token0 = await context.Token.get(pool.token0_id);
          if (token0) {
            const ethLocked = pool.totalValueLockedToken0.times(token0.derivedETH);
            if (ethLocked.gt(largestLiquidityETH) && ethLocked.gt(MINIMUM_NATIVE_LOCKED)) {
              largestLiquidityETH = ethLocked;
              priceSoFar = pool.token0Price.times(token0.derivedETH);
            }
          }
        }
      }
    }
  }
  return priceSoFar;
}

export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: { id: string; derivedETH: BigDecimal },
  tokenAmount1: BigDecimal,
  token1: { id: string; derivedETH: BigDecimal },
  ethPriceUSD: BigDecimal
): BigDecimal {
  const price0USD = token0.derivedETH.times(ethPriceUSD);
  const price1USD = token1.derivedETH.times(ethPriceUSD);

  // both are whitelist tokens, return sum of both amounts
  if (
    WHITELIST_TOKENS.includes(token0.id.toLowerCase()) &&
    WHITELIST_TOKENS.includes(token1.id.toLowerCase())
  ) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD));
  }

  // take double value of the whitelisted token amount
  if (
    WHITELIST_TOKENS.includes(token0.id.toLowerCase()) &&
    !WHITELIST_TOKENS.includes(token1.id.toLowerCase())
  ) {
    return tokenAmount0.times(price0USD).times(new BigDecimal("2"));
  }

  // take double value of the whitelisted token amount
  if (
    !WHITELIST_TOKENS.includes(token0.id.toLowerCase()) &&
    WHITELIST_TOKENS.includes(token1.id.toLowerCase())
  ) {
    return tokenAmount1.times(price1USD).times(new BigDecimal("2"));
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD;
}
