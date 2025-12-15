import { BigDecimal } from "generated";
import { ZERO_BD, ZERO_BI, ONE_BI } from "./constants";

export async function updateUniswapDayData(
  context: any,
  factoryAddress: string,
  timestamp: bigint
): Promise<any> {
  const factory = await context.Factory.get(factoryAddress);
  if (!factory) return null;

  const timestampNum = Number(timestamp);
  const dayID = Math.floor(timestampNum / 86400);
  const dayStartTimestamp = dayID * 86400;

  let uniswapDayData = await context.UniswapDayData.get(dayID.toString());

  if (!uniswapDayData) {
    uniswapDayData = {
      id: dayID.toString(),
      date: dayStartTimestamp,
      volumeETH: ZERO_BD,
      volumeUSD: ZERO_BD,
      volumeUSDUntracked: ZERO_BD,
      feesUSD: ZERO_BD,
      txCount: ZERO_BI,
      tvlUSD: ZERO_BD,
    };
  }

  uniswapDayData = {
    ...uniswapDayData,
    tvlUSD: factory.totalValueLockedUSD,
    txCount: factory.txCount,
  };

  context.UniswapDayData.set(uniswapDayData);
  return uniswapDayData;
}

export async function updatePoolDayData(
  context: any,
  poolAddress: string,
  timestamp: bigint
): Promise<any> {
  const pool = await context.Pool.get(poolAddress);
  if (!pool) return null;

  const timestampNum = Number(timestamp);
  const dayID = Math.floor(timestampNum / 86400);
  const dayStartTimestamp = dayID * 86400;
  const dayPoolID = `${poolAddress}-${dayID}`;

  let poolDayData = await context.PoolDayData.get(dayPoolID);

  if (!poolDayData) {
    poolDayData = {
      id: dayPoolID,
      date: dayStartTimestamp,
      pool_id: poolAddress,
      volumeToken0: ZERO_BD,
      volumeToken1: ZERO_BD,
      volumeUSD: ZERO_BD,
      feesUSD: ZERO_BD,
      txCount: ZERO_BI,
      openPrice: pool.token0Price,
      highPrice: pool.token0Price,
      lowPrice: pool.token0Price,
      closePrice: pool.token0Price,
      liquidity: ZERO_BI,
      sqrtPrice: ZERO_BI,
      token0Price: ZERO_BD,
      token1Price: ZERO_BD,
      tick: null,
      tvlUSD: ZERO_BD,
    };
  }

  if (pool.token0Price.gt(poolDayData.highPrice)) {
    poolDayData = { ...poolDayData, highPrice: pool.token0Price };
  }
  if (pool.token0Price.lt(poolDayData.lowPrice)) {
    poolDayData = { ...poolDayData, lowPrice: pool.token0Price };
  }

  poolDayData = {
    ...poolDayData,
    liquidity: pool.liquidity,
    sqrtPrice: pool.sqrtPrice,
    token0Price: pool.token0Price,
    token1Price: pool.token1Price,
    closePrice: pool.token0Price,
    tick: pool.tick,
    tvlUSD: pool.totalValueLockedUSD,
    txCount: poolDayData.txCount + ONE_BI,
  };

  context.PoolDayData.set(poolDayData);
  return poolDayData;
}

export async function updatePoolHourData(
  context: any,
  poolAddress: string,
  timestamp: bigint
): Promise<any> {
  const pool = await context.Pool.get(poolAddress);
  if (!pool) return null;

  const timestampNum = Number(timestamp);
  const hourIndex = Math.floor(timestampNum / 3600);
  const hourStartUnix = hourIndex * 3600;
  const hourPoolID = `${poolAddress}-${hourIndex}`;

  let poolHourData = await context.PoolHourData.get(hourPoolID);

  if (!poolHourData) {
    poolHourData = {
      id: hourPoolID,
      periodStartUnix: hourStartUnix,
      pool_id: poolAddress,
      volumeToken0: ZERO_BD,
      volumeToken1: ZERO_BD,
      volumeUSD: ZERO_BD,
      txCount: ZERO_BI,
      feesUSD: ZERO_BD,
      openPrice: pool.token0Price,
      highPrice: pool.token0Price,
      lowPrice: pool.token0Price,
      closePrice: pool.token0Price,
      liquidity: ZERO_BI,
      sqrtPrice: ZERO_BI,
      token0Price: ZERO_BD,
      token1Price: ZERO_BD,
      tick: null,
      tvlUSD: ZERO_BD,
    };
  }

  if (pool.token0Price.gt(poolHourData.highPrice)) {
    poolHourData = { ...poolHourData, highPrice: pool.token0Price };
  }
  if (pool.token0Price.lt(poolHourData.lowPrice)) {
    poolHourData = { ...poolHourData, lowPrice: pool.token0Price };
  }

  poolHourData = {
    ...poolHourData,
    liquidity: pool.liquidity,
    sqrtPrice: pool.sqrtPrice,
    token0Price: pool.token0Price,
    token1Price: pool.token1Price,
    closePrice: pool.token0Price,
    tick: pool.tick,
    tvlUSD: pool.totalValueLockedUSD,
    txCount: poolHourData.txCount + ONE_BI,
  };

  context.PoolHourData.set(poolHourData);
  return poolHourData;
}

export async function updateTokenDayData(
  context: any,
  token: any,
  timestamp: bigint
): Promise<any> {
  const bundle = await context.Bundle.get("1");
  if (!bundle) return null;

  const timestampNum = Number(timestamp);
  const dayID = Math.floor(timestampNum / 86400);
  const dayStartTimestamp = dayID * 86400;
  const tokenDayID = `${token.id}-${dayID}`;
  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);

  let tokenDayData = await context.TokenDayData.get(tokenDayID);

  if (!tokenDayData) {
    tokenDayData = {
      id: tokenDayID,
      date: dayStartTimestamp,
      token_id: token.id,
      volume: ZERO_BD,
      volumeUSD: ZERO_BD,
      feesUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      openPrice: tokenPrice,
      highPrice: tokenPrice,
      lowPrice: tokenPrice,
      closePrice: tokenPrice,
      totalValueLocked: ZERO_BD,
      totalValueLockedUSD: ZERO_BD,
      priceUSD: ZERO_BD,
    };
  }

  if (tokenPrice.gt(tokenDayData.highPrice)) {
    tokenDayData = { ...tokenDayData, highPrice: tokenPrice };
  }

  if (tokenPrice.lt(tokenDayData.lowPrice)) {
    tokenDayData = { ...tokenDayData, lowPrice: tokenPrice };
  }

  tokenDayData = {
    ...tokenDayData,
    closePrice: tokenPrice,
    priceUSD: tokenPrice,
    totalValueLocked: token.totalValueLocked,
    totalValueLockedUSD: token.totalValueLockedUSD,
  };

  context.TokenDayData.set(tokenDayData);
  return tokenDayData;
}

export async function updateTokenHourData(
  context: any,
  token: any,
  timestamp: bigint
): Promise<any> {
  const bundle = await context.Bundle.get("1");
  if (!bundle) return null;

  const timestampNum = Number(timestamp);
  const hourIndex = Math.floor(timestampNum / 3600);
  const hourStartUnix = hourIndex * 3600;
  const tokenHourID = `${token.id}-${hourIndex}`;
  const tokenPrice = token.derivedETH.times(bundle.ethPriceUSD);

  let tokenHourData = await context.TokenHourData.get(tokenHourID);

  if (!tokenHourData) {
    tokenHourData = {
      id: tokenHourID,
      periodStartUnix: hourStartUnix,
      token_id: token.id,
      volume: ZERO_BD,
      volumeUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      feesUSD: ZERO_BD,
      openPrice: tokenPrice,
      highPrice: tokenPrice,
      lowPrice: tokenPrice,
      closePrice: tokenPrice,
      totalValueLocked: ZERO_BD,
      totalValueLockedUSD: ZERO_BD,
      priceUSD: ZERO_BD,
    };
  }

  if (tokenPrice.gt(tokenHourData.highPrice)) {
    tokenHourData = { ...tokenHourData, highPrice: tokenPrice };
  }

  if (tokenPrice.lt(tokenHourData.lowPrice)) {
    tokenHourData = { ...tokenHourData, lowPrice: tokenPrice };
  }

  tokenHourData = {
    ...tokenHourData,
    closePrice: tokenPrice,
    priceUSD: tokenPrice,
    totalValueLocked: token.totalValueLocked,
    totalValueLockedUSD: token.totalValueLockedUSD,
  };

  context.TokenHourData.set(tokenHourData);
  return tokenHourData;
}
