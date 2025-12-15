import {
  Factory,
  NonfungiblePositionManager,
  Pool,
} from "generated";

import {
  ADDRESS_ZERO,
  FACTORY_ADDRESS,
  SKIP_POOLS,
  WHITELIST_TOKENS,
  ZERO_BD,
  ZERO_BI,
  ONE_BI,
  STATIC_TOKEN_DEFINITIONS,
} from "./constants";

import { convertTokenToDecimal, bigDecimalAbs } from "./utils";
import {
  sqrtPriceX96ToTokenPrices,
  getEthPriceInUSD,
  findEthPerToken,
  getTrackedAmountUSD,
} from "./pricing";
import {
  updateUniswapDayData,
  updatePoolDayData,
  updatePoolHourData,
  updateTokenDayData,
  updateTokenHourData,
} from "./intervalUpdates";
import { createTick } from "./tick";
import { BigDecimal } from "generated";

// Helper to load or create transaction
async function loadTransaction(
  context: any,
  txHash: string,
  blockNumber: number,
  timestamp: number,
  gasPrice: bigint
): Promise<any> {
  let transaction = await context.Transaction.get(txHash);
  if (!transaction) {
    transaction = {
      id: txHash,
      blockNumber: BigInt(blockNumber),
      timestamp: BigInt(timestamp),
      gasUsed: 0n,
      gasPrice: gasPrice,
    };
  } else {
    transaction = {
      ...transaction,
      blockNumber: BigInt(blockNumber),
      timestamp: BigInt(timestamp),
      gasPrice: gasPrice,
    };
  }
  context.Transaction.set(transaction);
  return transaction;
}

// Helper to get static token definition
function getStaticDefinition(tokenAddress: string): any | null {
  const tokenAddressLower = tokenAddress.toLowerCase();
  for (const staticDef of STATIC_TOKEN_DEFINITIONS) {
    if (staticDef.address.toLowerCase() === tokenAddressLower) {
      return staticDef;
    }
  }
  return null;
}

// ============================================
// FACTORY CONTRACT HANDLERS
// ============================================

// Register Pool contract dynamically when a new pool is created
Factory.PoolCreated.contractRegister(({ event, context }) => {
  context.addPool(event.params.pool);
});

Factory.PoolCreated.handler(async ({ event, context }) => {
  const poolAddress = event.params.pool.toLowerCase();

  // Skip pools in skip list
  if (SKIP_POOLS.includes(poolAddress)) {
    return;
  }

  // Load or create factory
  let factory = await context.Factory.get(FACTORY_ADDRESS);
  if (!factory) {
    factory = {
      id: FACTORY_ADDRESS,
      poolCount: ZERO_BI,
      totalVolumeETH: ZERO_BD,
      totalVolumeUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      totalFeesUSD: ZERO_BD,
      totalFeesETH: ZERO_BD,
      totalValueLockedETH: ZERO_BD,
      totalValueLockedUSD: ZERO_BD,
      totalValueLockedUSDUntracked: ZERO_BD,
      totalValueLockedETHUntracked: ZERO_BD,
      txCount: ZERO_BI,
      owner: ADDRESS_ZERO,
    };

    // Create bundle for tracking ETH price
    context.Bundle.set({
      id: "1",
      ethPriceUSD: ZERO_BD,
    });
  }

  factory = {
    ...factory,
    poolCount: factory.poolCount + ONE_BI,
  };

  const token0Address = event.params.token0.toLowerCase();
  const token1Address = event.params.token1.toLowerCase();

  // Load or create token0
  let token0 = await context.Token.get(token0Address);
  if (!token0) {
    const staticDef = getStaticDefinition(token0Address);
    token0 = {
      id: token0Address,
      symbol: staticDef?.symbol || "unknown",
      name: staticDef?.name || "unknown",
      totalSupply: ZERO_BI,
      decimals: staticDef?.decimals || 18n,
      derivedETH: ZERO_BD,
      volume: ZERO_BD,
      volumeUSD: ZERO_BD,
      feesUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      totalValueLocked: ZERO_BD,
      totalValueLockedUSD: ZERO_BD,
      totalValueLockedUSDUntracked: ZERO_BD,
      txCount: ZERO_BI,
      poolCount: ZERO_BI,
      whitelistPools: [],
    };
  }

  // Load or create token1
  let token1 = await context.Token.get(token1Address);
  if (!token1) {
    const staticDef = getStaticDefinition(token1Address);
    token1 = {
      id: token1Address,
      symbol: staticDef?.symbol || "unknown",
      name: staticDef?.name || "unknown",
      totalSupply: ZERO_BI,
      decimals: staticDef?.decimals || 18n,
      derivedETH: ZERO_BD,
      volume: ZERO_BD,
      volumeUSD: ZERO_BD,
      feesUSD: ZERO_BD,
      untrackedVolumeUSD: ZERO_BD,
      totalValueLocked: ZERO_BD,
      totalValueLockedUSD: ZERO_BD,
      totalValueLockedUSDUntracked: ZERO_BD,
      txCount: ZERO_BI,
      poolCount: ZERO_BI,
      whitelistPools: [],
    };
  }

  // Update whitelist pools
  if (WHITELIST_TOKENS.includes(token0Address)) {
    const newPools = [...token1.whitelistPools, poolAddress];
    token1 = { ...token1, whitelistPools: newPools };
  }
  if (WHITELIST_TOKENS.includes(token1Address)) {
    const newPools = [...token0.whitelistPools, poolAddress];
    token0 = { ...token0, whitelistPools: newPools };
  }

  // Create pool
  const pool = {
    id: poolAddress,
    token0_id: token0Address,
    token1_id: token1Address,
    feeTier: BigInt(event.params.fee),
    createdAtTimestamp: BigInt(event.block.timestamp),
    createdAtBlockNumber: BigInt(event.block.number),
    liquidityProviderCount: ZERO_BI,
    txCount: ZERO_BI,
    liquidity: ZERO_BI,
    sqrtPrice: ZERO_BI,
    token0Price: ZERO_BD,
    token1Price: ZERO_BD,
    observationIndex: ZERO_BI,
    totalValueLockedToken0: ZERO_BD,
    totalValueLockedToken1: ZERO_BD,
    totalValueLockedUSD: ZERO_BD,
    totalValueLockedETH: ZERO_BD,
    totalValueLockedUSDUntracked: ZERO_BD,
    volumeToken0: ZERO_BD,
    volumeToken1: ZERO_BD,
    volumeUSD: ZERO_BD,
    feesUSD: ZERO_BD,
    untrackedVolumeUSD: ZERO_BD,
    collectedFeesToken0: ZERO_BD,
    collectedFeesToken1: ZERO_BD,
    collectedFeesUSD: ZERO_BD,
    tick: null,
  };

  context.Pool.set(pool);
  context.Token.set(token0);
  context.Token.set(token1);
  context.Factory.set(factory);
});

// ============================================
// POOL CONTRACT HANDLERS
// ============================================

Pool.Initialize.handler(async ({ event, context }) => {
  const poolAddress = event.srcAddress.toLowerCase();

  let pool = await context.Pool.get(poolAddress);
  if (!pool) return;

  pool = {
    ...pool,
    sqrtPrice: event.params.sqrtPriceX96,
    tick: BigInt(event.params.tick),
  };
  context.Pool.set(pool);

  const token0 = await context.Token.get(pool.token0_id);
  const token1 = await context.Token.get(pool.token1_id);

  // Update ETH price
  let bundle = await context.Bundle.get("1");
  if (bundle) {
    const ethPrice = await getEthPriceInUSD(context);
    bundle = { ...bundle, ethPriceUSD: ethPrice };
    context.Bundle.set(bundle);
  }

  await updatePoolDayData(context, poolAddress, BigInt(event.block.timestamp));
  await updatePoolHourData(context, poolAddress, BigInt(event.block.timestamp));

  // Update token prices
  if (token0 && token1) {
    const derivedETH0 = await findEthPerToken(token0, context);
    const derivedETH1 = await findEthPerToken(token1, context);
    context.Token.set({ ...token0, derivedETH: derivedETH0 });
    context.Token.set({ ...token1, derivedETH: derivedETH1 });
  }
});

Pool.Swap.handler(async ({ event, context }) => {
  const poolAddress = event.srcAddress.toLowerCase();

  let bundle = await context.Bundle.get("1");
  if (!bundle) return;

  let factory = await context.Factory.get(FACTORY_ADDRESS);
  if (!factory) return;

  let pool = await context.Pool.get(poolAddress);
  if (!pool) return;

  // Hot fix for bad pricing
  if (poolAddress === "0x9663f2ca0454accad3e094448ea6f77443880454") {
    return;
  }

  let token0 = await context.Token.get(pool.token0_id);
  let token1 = await context.Token.get(pool.token1_id);

  if (!token0 || !token1) return;

  // Calculate amounts
  const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
  const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

  const amount0Abs = bigDecimalAbs(amount0);
  const amount1Abs = bigDecimalAbs(amount1);

  const amount0ETH = amount0Abs.times(token0.derivedETH);
  const amount1ETH = amount1Abs.times(token1.derivedETH);
  const amount0USD = amount0ETH.times(bundle.ethPriceUSD);
  const amount1USD = amount1ETH.times(bundle.ethPriceUSD);

  // Get tracked amount
  const amountTotalUSDTracked = getTrackedAmountUSD(
    amount0Abs,
    token0,
    amount1Abs,
    token1,
    bundle.ethPriceUSD
  ).div(new BigDecimal("2"));

  const amountTotalETHTracked = bundle.ethPriceUSD.gt(ZERO_BD)
    ? amountTotalUSDTracked.div(bundle.ethPriceUSD)
    : ZERO_BD;

  const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(new BigDecimal("2"));

  const feesETH = amountTotalETHTracked
    .times(new BigDecimal(pool.feeTier.toString()))
    .div(new BigDecimal("1000000"));
  const feesUSD = amountTotalUSDTracked
    .times(new BigDecimal(pool.feeTier.toString()))
    .div(new BigDecimal("1000000"));

  // Reset aggregate TVL before individual pool TVL updates
  const currentPoolTvlETH = pool.totalValueLockedETH;

  // Update factory
  factory = {
    ...factory,
    txCount: factory.txCount + ONE_BI,
    totalVolumeETH: factory.totalVolumeETH.plus(amountTotalETHTracked),
    totalVolumeUSD: factory.totalVolumeUSD.plus(amountTotalUSDTracked),
    untrackedVolumeUSD: factory.untrackedVolumeUSD.plus(amountTotalUSDUntracked),
    totalFeesETH: factory.totalFeesETH.plus(feesETH),
    totalFeesUSD: factory.totalFeesUSD.plus(feesUSD),
    totalValueLockedETH: factory.totalValueLockedETH.minus(currentPoolTvlETH),
  };

  // Update pool
  pool = {
    ...pool,
    volumeToken0: pool.volumeToken0.plus(amount0Abs),
    volumeToken1: pool.volumeToken1.plus(amount1Abs),
    volumeUSD: pool.volumeUSD.plus(amountTotalUSDTracked),
    untrackedVolumeUSD: pool.untrackedVolumeUSD.plus(amountTotalUSDUntracked),
    feesUSD: pool.feesUSD.plus(feesUSD),
    txCount: pool.txCount + ONE_BI,
    liquidity: event.params.liquidity,
    tick: BigInt(event.params.tick),
    sqrtPrice: event.params.sqrtPriceX96,
    totalValueLockedToken0: pool.totalValueLockedToken0.plus(amount0),
    totalValueLockedToken1: pool.totalValueLockedToken1.plus(amount1),
  };

  // Update token0 data
  token0 = {
    ...token0,
    volume: token0.volume.plus(amount0Abs),
    totalValueLocked: token0.totalValueLocked.plus(amount0),
    volumeUSD: token0.volumeUSD.plus(amountTotalUSDTracked),
    untrackedVolumeUSD: token0.untrackedVolumeUSD.plus(amountTotalUSDUntracked),
    feesUSD: token0.feesUSD.plus(feesUSD),
    txCount: token0.txCount + ONE_BI,
  };

  // Update token1 data
  token1 = {
    ...token1,
    volume: token1.volume.plus(amount1Abs),
    totalValueLocked: token1.totalValueLocked.plus(amount1),
    volumeUSD: token1.volumeUSD.plus(amountTotalUSDTracked),
    untrackedVolumeUSD: token1.untrackedVolumeUSD.plus(amountTotalUSDUntracked),
    feesUSD: token1.feesUSD.plus(feesUSD),
    txCount: token1.txCount + ONE_BI,
  };

  // Update pool rates
  const prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0.decimals, token1.decimals);
  pool = {
    ...pool,
    token0Price: prices[0],
    token1Price: prices[1],
  };

  // Update USD pricing
  const newEthPrice = await getEthPriceInUSD(context);
  bundle = { ...bundle, ethPriceUSD: newEthPrice };

  const derivedETH0 = await findEthPerToken(token0, context);
  const derivedETH1 = await findEthPerToken(token1, context);
  token0 = { ...token0, derivedETH: derivedETH0 };
  token1 = { ...token1, derivedETH: derivedETH1 };

  // Update pool TVL with new prices
  pool = {
    ...pool,
    totalValueLockedETH: pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH)),
  };
  pool = {
    ...pool,
    totalValueLockedUSD: pool.totalValueLockedETH.times(bundle.ethPriceUSD),
  };

  factory = {
    ...factory,
    totalValueLockedETH: factory.totalValueLockedETH.plus(pool.totalValueLockedETH),
  };
  factory = {
    ...factory,
    totalValueLockedUSD: factory.totalValueLockedETH.times(bundle.ethPriceUSD),
  };

  token0 = {
    ...token0,
    totalValueLockedUSD: token0.totalValueLocked.times(token0.derivedETH).times(bundle.ethPriceUSD),
  };
  token1 = {
    ...token1,
    totalValueLockedUSD: token1.totalValueLocked.times(token1.derivedETH).times(bundle.ethPriceUSD),
  };

  // Create swap event
  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n // gasPrice not available in Envio
  );

  const swapId = `${transaction.id}-${event.logIndex}`;
  const swap = {
    id: swapId,
    transaction_id: transaction.id,
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolAddress,
    token0_id: pool.token0_id,
    token1_id: pool.token1_id,
    sender: event.params.sender.toLowerCase(),
    origin: event.transaction.from?.toLowerCase() || ADDRESS_ZERO,
    recipient: event.params.recipient.toLowerCase(),
    amount0: amount0,
    amount1: amount1,
    amountUSD: amountTotalUSDTracked,
    tick: BigInt(event.params.tick),
    sqrtPriceX96: event.params.sqrtPriceX96,
    logIndex: BigInt(event.logIndex),
  };

  // Update interval data
  const uniswapDayData = await updateUniswapDayData(context, FACTORY_ADDRESS, BigInt(event.block.timestamp));
  const poolDayData = await updatePoolDayData(context, poolAddress, BigInt(event.block.timestamp));
  const poolHourData = await updatePoolHourData(context, poolAddress, BigInt(event.block.timestamp));
  const token0DayData = await updateTokenDayData(context, token0, BigInt(event.block.timestamp));
  const token1DayData = await updateTokenDayData(context, token1, BigInt(event.block.timestamp));
  const token0HourData = await updateTokenHourData(context, token0, BigInt(event.block.timestamp));
  const token1HourData = await updateTokenHourData(context, token1, BigInt(event.block.timestamp));

  // Update volume metrics on interval data
  if (uniswapDayData) {
    context.UniswapDayData.set({
      ...uniswapDayData,
      volumeETH: uniswapDayData.volumeETH.plus(amountTotalETHTracked),
      volumeUSD: uniswapDayData.volumeUSD.plus(amountTotalUSDTracked),
      feesUSD: uniswapDayData.feesUSD.plus(feesUSD),
    });
  }

  if (poolDayData) {
    context.PoolDayData.set({
      ...poolDayData,
      volumeUSD: poolDayData.volumeUSD.plus(amountTotalUSDTracked),
      volumeToken0: poolDayData.volumeToken0.plus(amount0Abs),
      volumeToken1: poolDayData.volumeToken1.plus(amount1Abs),
      feesUSD: poolDayData.feesUSD.plus(feesUSD),
    });
  }

  if (poolHourData) {
    context.PoolHourData.set({
      ...poolHourData,
      volumeUSD: poolHourData.volumeUSD.plus(amountTotalUSDTracked),
      volumeToken0: poolHourData.volumeToken0.plus(amount0Abs),
      volumeToken1: poolHourData.volumeToken1.plus(amount1Abs),
      feesUSD: poolHourData.feesUSD.plus(feesUSD),
    });
  }

  if (token0DayData) {
    context.TokenDayData.set({
      ...token0DayData,
      volume: token0DayData.volume.plus(amount0Abs),
      volumeUSD: token0DayData.volumeUSD.plus(amountTotalUSDTracked),
      untrackedVolumeUSD: token0DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked),
      feesUSD: token0DayData.feesUSD.plus(feesUSD),
    });
  }

  if (token0HourData) {
    context.TokenHourData.set({
      ...token0HourData,
      volume: token0HourData.volume.plus(amount0Abs),
      volumeUSD: token0HourData.volumeUSD.plus(amountTotalUSDTracked),
      untrackedVolumeUSD: token0HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked),
      feesUSD: token0HourData.feesUSD.plus(feesUSD),
    });
  }

  if (token1DayData) {
    context.TokenDayData.set({
      ...token1DayData,
      volume: token1DayData.volume.plus(amount1Abs),
      volumeUSD: token1DayData.volumeUSD.plus(amountTotalUSDTracked),
      untrackedVolumeUSD: token1DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked),
      feesUSD: token1DayData.feesUSD.plus(feesUSD),
    });
  }

  if (token1HourData) {
    context.TokenHourData.set({
      ...token1HourData,
      volume: token1HourData.volume.plus(amount1Abs),
      volumeUSD: token1HourData.volumeUSD.plus(amountTotalUSDTracked),
      untrackedVolumeUSD: token1HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked),
      feesUSD: token1HourData.feesUSD.plus(feesUSD),
    });
  }

  context.Swap.set(swap);
  context.Bundle.set(bundle);
  context.Factory.set(factory);
  context.Pool.set(pool);
  context.Token.set(token0);
  context.Token.set(token1);
});

Pool.Mint.handler(async ({ event, context }) => {
  const poolAddress = event.srcAddress.toLowerCase();

  let bundle = await context.Bundle.get("1");
  if (!bundle) return;

  let pool = await context.Pool.get(poolAddress);
  if (!pool) return;

  let factory = await context.Factory.get(FACTORY_ADDRESS);
  if (!factory) return;

  let token0 = await context.Token.get(pool.token0_id);
  let token1 = await context.Token.get(pool.token1_id);

  if (!token0 || !token1) return;

  const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
  const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

  const amountUSD = amount0
    .times(token0.derivedETH.times(bundle.ethPriceUSD))
    .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

  // Reset TVL aggregates until new amounts calculated
  factory = {
    ...factory,
    totalValueLockedETH: factory.totalValueLockedETH.minus(pool.totalValueLockedETH),
    txCount: factory.txCount + ONE_BI,
  };

  // Update token0 data
  token0 = {
    ...token0,
    txCount: token0.txCount + ONE_BI,
    totalValueLocked: token0.totalValueLocked.plus(amount0),
    totalValueLockedUSD: token0.totalValueLocked.plus(amount0).times(token0.derivedETH.times(bundle.ethPriceUSD)),
  };

  // Update token1 data
  token1 = {
    ...token1,
    txCount: token1.txCount + ONE_BI,
    totalValueLocked: token1.totalValueLocked.plus(amount1),
    totalValueLockedUSD: token1.totalValueLocked.plus(amount1).times(token1.derivedETH.times(bundle.ethPriceUSD)),
  };

  // Pool data
  pool = {
    ...pool,
    txCount: pool.txCount + ONE_BI,
  };

  // Update pool liquidity if position includes current tick
  if (
    pool.tick !== null &&
    BigInt(event.params.tickLower) <= pool.tick &&
    BigInt(event.params.tickUpper) > pool.tick
  ) {
    pool = {
      ...pool,
      liquidity: pool.liquidity + event.params.amount,
    };
  }

  pool = {
    ...pool,
    totalValueLockedToken0: pool.totalValueLockedToken0.plus(amount0),
    totalValueLockedToken1: pool.totalValueLockedToken1.plus(amount1),
  };

  pool = {
    ...pool,
    totalValueLockedETH: pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH)),
  };
  pool = {
    ...pool,
    totalValueLockedUSD: pool.totalValueLockedETH.times(bundle.ethPriceUSD),
  };

  // Reset aggregates with new amounts
  factory = {
    ...factory,
    totalValueLockedETH: factory.totalValueLockedETH.plus(pool.totalValueLockedETH),
  };
  factory = {
    ...factory,
    totalValueLockedUSD: factory.totalValueLockedETH.times(bundle.ethPriceUSD),
  };

  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n
  );

  const mintId = `${transaction.id}-${event.logIndex}`;
  const mint = {
    id: mintId,
    transaction_id: transaction.id,
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolAddress,
    token0_id: pool.token0_id,
    token1_id: pool.token1_id,
    owner: event.params.owner.toLowerCase(),
    sender: event.params.sender.toLowerCase(),
    origin: event.transaction.from?.toLowerCase() || ADDRESS_ZERO,
    amount: event.params.amount,
    amount0: amount0,
    amount1: amount1,
    amountUSD: amountUSD,
    tickLower: BigInt(event.params.tickLower),
    tickUpper: BigInt(event.params.tickUpper),
    logIndex: BigInt(event.logIndex),
  };

  // Tick entities
  const lowerTickIdx = event.params.tickLower;
  const upperTickIdx = event.params.tickUpper;
  const lowerTickId = `${poolAddress}#${lowerTickIdx}`;
  const upperTickId = `${poolAddress}#${upperTickIdx}`;

  let lowerTick = await context.Tick.get(lowerTickId);
  let upperTick = await context.Tick.get(upperTickId);

  if (!lowerTick) {
    lowerTick = createTick(lowerTickId, BigInt(lowerTickIdx), poolAddress, BigInt(event.block.timestamp), BigInt(event.block.number));
  }

  if (!upperTick) {
    upperTick = createTick(upperTickId, BigInt(upperTickIdx), poolAddress, BigInt(event.block.timestamp), BigInt(event.block.number));
  }

  const amount = event.params.amount;
  lowerTick = {
    ...lowerTick,
    liquidityGross: lowerTick.liquidityGross + amount,
    liquidityNet: lowerTick.liquidityNet + amount,
  };
  upperTick = {
    ...upperTick,
    liquidityGross: upperTick.liquidityGross + amount,
    liquidityNet: upperTick.liquidityNet - amount,
  };

  context.Tick.set(lowerTick);
  context.Tick.set(upperTick);

  await updateUniswapDayData(context, FACTORY_ADDRESS, BigInt(event.block.timestamp));
  await updatePoolDayData(context, poolAddress, BigInt(event.block.timestamp));
  await updatePoolHourData(context, poolAddress, BigInt(event.block.timestamp));
  await updateTokenDayData(context, token0, BigInt(event.block.timestamp));
  await updateTokenDayData(context, token1, BigInt(event.block.timestamp));
  await updateTokenHourData(context, token0, BigInt(event.block.timestamp));
  await updateTokenHourData(context, token1, BigInt(event.block.timestamp));

  context.Token.set(token0);
  context.Token.set(token1);
  context.Pool.set(pool);
  context.Factory.set(factory);
  context.Mint.set(mint);
});

Pool.Burn.handler(async ({ event, context }) => {
  const poolAddress = event.srcAddress.toLowerCase();

  let bundle = await context.Bundle.get("1");
  if (!bundle) return;

  let pool = await context.Pool.get(poolAddress);
  if (!pool) return;

  let factory = await context.Factory.get(FACTORY_ADDRESS);
  if (!factory) return;

  let token0 = await context.Token.get(pool.token0_id);
  let token1 = await context.Token.get(pool.token1_id);

  if (!token0 || !token1) return;

  const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
  const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

  const amountUSD = amount0
    .times(token0.derivedETH.times(bundle.ethPriceUSD))
    .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

  // Update globals
  factory = {
    ...factory,
    txCount: factory.txCount + ONE_BI,
  };

  // Update token data
  token0 = { ...token0, txCount: token0.txCount + ONE_BI };
  token1 = { ...token1, txCount: token1.txCount + ONE_BI };

  // Pool data
  pool = { ...pool, txCount: pool.txCount + ONE_BI };

  // Update pool liquidity if position includes current tick
  if (
    pool.tick !== null &&
    BigInt(event.params.tickLower) <= pool.tick &&
    BigInt(event.params.tickUpper) > pool.tick
  ) {
    pool = {
      ...pool,
      liquidity: pool.liquidity - event.params.amount,
    };
  }

  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n
  );

  const burnId = `${transaction.id}-${event.logIndex}`;
  const burn = {
    id: burnId,
    transaction_id: transaction.id,
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolAddress,
    token0_id: pool.token0_id,
    token1_id: pool.token1_id,
    owner: event.params.owner.toLowerCase(),
    origin: event.transaction.from?.toLowerCase() || ADDRESS_ZERO,
    amount: event.params.amount,
    amount0: amount0,
    amount1: amount1,
    amountUSD: amountUSD,
    tickLower: BigInt(event.params.tickLower),
    tickUpper: BigInt(event.params.tickUpper),
    logIndex: BigInt(event.logIndex),
  };

  // Tick entities
  const lowerTickId = `${poolAddress}#${event.params.tickLower}`;
  const upperTickId = `${poolAddress}#${event.params.tickUpper}`;
  const lowerTick = await context.Tick.get(lowerTickId);
  const upperTick = await context.Tick.get(upperTickId);

  if (lowerTick && upperTick) {
    const amount = event.params.amount;
    context.Tick.set({
      ...lowerTick,
      liquidityGross: lowerTick.liquidityGross - amount,
      liquidityNet: lowerTick.liquidityNet - amount,
    });
    context.Tick.set({
      ...upperTick,
      liquidityGross: upperTick.liquidityGross - amount,
      liquidityNet: upperTick.liquidityNet + amount,
    });
  }

  await updateUniswapDayData(context, FACTORY_ADDRESS, BigInt(event.block.timestamp));
  await updatePoolDayData(context, poolAddress, BigInt(event.block.timestamp));
  await updatePoolHourData(context, poolAddress, BigInt(event.block.timestamp));
  await updateTokenDayData(context, token0, BigInt(event.block.timestamp));
  await updateTokenDayData(context, token1, BigInt(event.block.timestamp));
  await updateTokenHourData(context, token0, BigInt(event.block.timestamp));
  await updateTokenHourData(context, token1, BigInt(event.block.timestamp));

  context.Token.set(token0);
  context.Token.set(token1);
  context.Pool.set(pool);
  context.Factory.set(factory);
  context.Burn.set(burn);
});

Pool.Collect.handler(async ({ event, context }) => {
  const poolAddress = event.srcAddress.toLowerCase();

  let bundle = await context.Bundle.get("1");
  if (!bundle) return;

  let pool = await context.Pool.get(poolAddress);
  if (!pool) return;

  let factory = await context.Factory.get(FACTORY_ADDRESS);
  if (!factory) return;

  let token0 = await context.Token.get(pool.token0_id);
  let token1 = await context.Token.get(pool.token1_id);

  if (!token0 || !token1) return;

  // Get formatted amounts collected
  const collectedAmountToken0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
  const collectedAmountToken1 = convertTokenToDecimal(event.params.amount1, token1.decimals);
  const trackedCollectedAmountUSD = getTrackedAmountUSD(
    collectedAmountToken0,
    token0,
    collectedAmountToken1,
    token1,
    bundle.ethPriceUSD
  );

  // Reset TVL aggregates until new amounts calculated
  factory = {
    ...factory,
    totalValueLockedETH: factory.totalValueLockedETH.minus(pool.totalValueLockedETH),
    txCount: factory.txCount + ONE_BI,
  };

  // Update token data
  token0 = {
    ...token0,
    txCount: token0.txCount + ONE_BI,
    totalValueLocked: token0.totalValueLocked.minus(collectedAmountToken0),
  };
  token0 = {
    ...token0,
    totalValueLockedUSD: token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD)),
  };

  token1 = {
    ...token1,
    txCount: token1.txCount + ONE_BI,
    totalValueLocked: token1.totalValueLocked.minus(collectedAmountToken1),
  };
  token1 = {
    ...token1,
    totalValueLockedUSD: token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD)),
  };

  // Adjust pool TVL based on amount collected
  pool = {
    ...pool,
    txCount: pool.txCount + ONE_BI,
    totalValueLockedToken0: pool.totalValueLockedToken0.minus(collectedAmountToken0),
    totalValueLockedToken1: pool.totalValueLockedToken1.minus(collectedAmountToken1),
  };

  pool = {
    ...pool,
    totalValueLockedETH: pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH)),
  };
  pool = {
    ...pool,
    totalValueLockedUSD: pool.totalValueLockedETH.times(bundle.ethPriceUSD),
  };

  // Update aggregate fee collection values
  pool = {
    ...pool,
    collectedFeesToken0: pool.collectedFeesToken0.plus(collectedAmountToken0),
    collectedFeesToken1: pool.collectedFeesToken1.plus(collectedAmountToken1),
    collectedFeesUSD: pool.collectedFeesUSD.plus(trackedCollectedAmountUSD),
  };

  // Reset aggregates with new amounts
  factory = {
    ...factory,
    totalValueLockedETH: factory.totalValueLockedETH.plus(pool.totalValueLockedETH),
  };
  factory = {
    ...factory,
    totalValueLockedUSD: factory.totalValueLockedETH.times(bundle.ethPriceUSD),
  };

  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n
  );

  const collectId = `${transaction.id}-${event.logIndex}`;
  const collect = {
    id: collectId,
    transaction_id: transaction.id,
    timestamp: BigInt(event.block.timestamp),
    pool_id: poolAddress,
    owner: event.params.owner.toLowerCase(),
    amount0: collectedAmountToken0,
    amount1: collectedAmountToken1,
    amountUSD: trackedCollectedAmountUSD,
    tickLower: BigInt(event.params.tickLower),
    tickUpper: BigInt(event.params.tickUpper),
    logIndex: BigInt(event.logIndex),
  };

  await updateUniswapDayData(context, FACTORY_ADDRESS, BigInt(event.block.timestamp));
  await updatePoolDayData(context, poolAddress, BigInt(event.block.timestamp));
  await updatePoolHourData(context, poolAddress, BigInt(event.block.timestamp));
  await updateTokenDayData(context, token0, BigInt(event.block.timestamp));
  await updateTokenDayData(context, token1, BigInt(event.block.timestamp));
  await updateTokenHourData(context, token0, BigInt(event.block.timestamp));
  await updateTokenHourData(context, token1, BigInt(event.block.timestamp));

  context.Token.set(token0);
  context.Token.set(token1);
  context.Factory.set(factory);
  context.Pool.set(pool);
  context.Collect.set(collect);
});

// ============================================
// NONFUNGIBLE POSITION MANAGER HANDLERS
// ============================================

NonfungiblePositionManager.IncreaseLiquidity.handler(async ({ event, context }) => {
  const tokenId = event.params.tokenId.toString();

  let position = await context.Position.get(tokenId);

  // If position doesn't exist, we cannot process this event without contract calls
  // In Envio, we'd need to set up an effect to fetch position data
  if (!position) {
    context.log.warn(`Position ${tokenId} not found for IncreaseLiquidity event`);
    return;
  }

  const token0 = await context.Token.get(position.token0_id);
  const token1 = await context.Token.get(position.token1_id);

  if (!token0 || !token1) return;

  const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
  const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

  position = {
    ...position,
    liquidity: position.liquidity + event.params.liquidity,
    depositedToken0: position.depositedToken0.plus(amount0),
    depositedToken1: position.depositedToken1.plus(amount1),
  };

  context.Position.set(position);

  // Save position snapshot
  const snapshotId = `${position.id}#${event.block.number}`;
  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n
  );

  const snapshot = {
    id: snapshotId,
    owner: position.owner,
    pool_id: position.pool_id,
    position_id: position.id,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    liquidity: position.liquidity,
    depositedToken0: position.depositedToken0,
    depositedToken1: position.depositedToken1,
    withdrawnToken0: position.withdrawnToken0,
    withdrawnToken1: position.withdrawnToken1,
    collectedFeesToken0: position.collectedFeesToken0,
    collectedFeesToken1: position.collectedFeesToken1,
    transaction_id: transaction.id,
    feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
    feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
  };

  context.PositionSnapshot.set(snapshot);
});

NonfungiblePositionManager.DecreaseLiquidity.handler(async ({ event, context }) => {
  const tokenId = event.params.tokenId.toString();

  let position = await context.Position.get(tokenId);
  if (!position) {
    context.log.warn(`Position ${tokenId} not found for DecreaseLiquidity event`);
    return;
  }

  const token0 = await context.Token.get(position.token0_id);
  const token1 = await context.Token.get(position.token1_id);

  if (!token0 || !token1) return;

  const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
  const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

  position = {
    ...position,
    liquidity: position.liquidity - event.params.liquidity,
    withdrawnToken0: position.withdrawnToken0.plus(amount0),
    withdrawnToken1: position.withdrawnToken1.plus(amount1),
  };

  context.Position.set(position);

  // Save position snapshot
  const snapshotId = `${position.id}#${event.block.number}`;
  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n
  );

  const snapshot = {
    id: snapshotId,
    owner: position.owner,
    pool_id: position.pool_id,
    position_id: position.id,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    liquidity: position.liquidity,
    depositedToken0: position.depositedToken0,
    depositedToken1: position.depositedToken1,
    withdrawnToken0: position.withdrawnToken0,
    withdrawnToken1: position.withdrawnToken1,
    collectedFeesToken0: position.collectedFeesToken0,
    collectedFeesToken1: position.collectedFeesToken1,
    transaction_id: transaction.id,
    feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
    feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
  };

  context.PositionSnapshot.set(snapshot);
});

NonfungiblePositionManager.Collect.handler(async ({ event, context }) => {
  const tokenId = event.params.tokenId.toString();

  let position = await context.Position.get(tokenId);
  if (!position) {
    context.log.warn(`Position ${tokenId} not found for Collect event`);
    return;
  }

  const token0 = await context.Token.get(position.token0_id);
  const token1 = await context.Token.get(position.token1_id);

  if (!token0 || !token1) return;

  const amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals);
  const amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals);

  position = {
    ...position,
    collectedToken0: position.collectedToken0.plus(amount0),
    collectedToken1: position.collectedToken1.plus(amount1),
    collectedFeesToken0: position.collectedToken0.plus(amount0).minus(position.withdrawnToken0),
    collectedFeesToken1: position.collectedToken1.plus(amount1).minus(position.withdrawnToken1),
  };

  context.Position.set(position);

  // Save position snapshot
  const snapshotId = `${position.id}#${event.block.number}`;
  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n
  );

  const snapshot = {
    id: snapshotId,
    owner: position.owner,
    pool_id: position.pool_id,
    position_id: position.id,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    liquidity: position.liquidity,
    depositedToken0: position.depositedToken0,
    depositedToken1: position.depositedToken1,
    withdrawnToken0: position.withdrawnToken0,
    withdrawnToken1: position.withdrawnToken1,
    collectedFeesToken0: position.collectedFeesToken0,
    collectedFeesToken1: position.collectedFeesToken1,
    transaction_id: transaction.id,
    feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
    feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
  };

  context.PositionSnapshot.set(snapshot);
});

NonfungiblePositionManager.Transfer.handler(async ({ event, context }) => {
  const tokenId = event.params.tokenId.toString();

  let position = await context.Position.get(tokenId);

  // If position doesn't exist, create a new one (this happens on mint)
  if (!position) {
    // On first transfer (minting), we need to create the position
    // In the subgraph this is done via contract call, but in Envio we'll create a placeholder
    // The position data will be filled in when IncreaseLiquidity is called

    const transaction = await loadTransaction(
      context,
      event.transaction.hash,
      event.block.number,
      event.block.timestamp,
      0n
    );

    position = {
      id: tokenId,
      owner: event.params.to.toLowerCase(),
      pool_id: "", // Will be updated when we can determine the pool
      token0_id: "",
      token1_id: "",
      tickLower_id: "",
      tickUpper_id: "",
      liquidity: ZERO_BI,
      depositedToken0: ZERO_BD,
      depositedToken1: ZERO_BD,
      withdrawnToken0: ZERO_BD,
      withdrawnToken1: ZERO_BD,
      collectedToken0: ZERO_BD,
      collectedToken1: ZERO_BD,
      collectedFeesToken0: ZERO_BD,
      collectedFeesToken1: ZERO_BD,
      transaction_id: transaction.id,
      feeGrowthInside0LastX128: ZERO_BI,
      feeGrowthInside1LastX128: ZERO_BI,
    };
  } else {
    position = {
      ...position,
      owner: event.params.to.toLowerCase(),
    };
  }

  context.Position.set(position);

  // Save position snapshot
  const snapshotId = `${position.id}#${event.block.number}`;
  const transaction = await loadTransaction(
    context,
    event.transaction.hash,
    event.block.number,
    event.block.timestamp,
    0n
  );

  const snapshot = {
    id: snapshotId,
    owner: position.owner,
    pool_id: position.pool_id,
    position_id: position.id,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    liquidity: position.liquidity,
    depositedToken0: position.depositedToken0,
    depositedToken1: position.depositedToken1,
    withdrawnToken0: position.withdrawnToken0,
    withdrawnToken1: position.withdrawnToken1,
    collectedFeesToken0: position.collectedFeesToken0,
    collectedFeesToken1: position.collectedFeesToken1,
    transaction_id: transaction.id,
    feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
    feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
  };

  context.PositionSnapshot.set(snapshot);
});
