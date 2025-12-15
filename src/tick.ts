import { BigDecimal } from "generated";
import { ZERO_BI, ONE_BD } from "./constants";
import { fastExponentiation, safeDiv } from "./utils";

export function createTick(
  tickId: string,
  tickIdx: bigint,
  poolId: string,
  timestamp: bigint,
  blockNumber: bigint
): any {
  const tickIdxNum = Number(tickIdx);
  const price0 = fastExponentiation(new BigDecimal("1.0001"), tickIdxNum);
  const price1 = safeDiv(ONE_BD, price0);

  return {
    id: tickId,
    tickIdx: tickIdx,
    pool_id: poolId,
    poolAddress: poolId,
    createdAtTimestamp: timestamp,
    createdAtBlockNumber: blockNumber,
    liquidityGross: ZERO_BI,
    liquidityNet: ZERO_BI,
    price0: price0,
    price1: price1,
  };
}
