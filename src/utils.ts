import { BigDecimal } from "generated";
import { ZERO_BD, ONE_BD, ZERO_BI } from "./constants";

export function exponentToBigDecimal(decimals: bigint): BigDecimal {
  if (decimals < 255n) {
    const base = 10n ** decimals;
    return new BigDecimal(base.toString());
  }
  return ONE_BD;
}

export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
  if (amount1.eq(ZERO_BD)) {
    return ZERO_BD;
  }
  return amount0.div(amount1);
}

export function safeDivBigInt(amount0: bigint, amount1: bigint): bigint {
  if (amount1 === ZERO_BI) {
    return ZERO_BI;
  }
  return amount0 / amount1;
}

export function convertTokenToDecimal(tokenAmount: bigint, exchangeDecimals: bigint): BigDecimal {
  if (exchangeDecimals === ZERO_BI) {
    return new BigDecimal(tokenAmount.toString());
  }
  return new BigDecimal(tokenAmount.toString()).div(exponentToBigDecimal(exchangeDecimals));
}

export function convertEthToDecimal(eth: bigint): BigDecimal {
  return new BigDecimal(eth.toString()).div(exponentToBigDecimal(18n));
}

export function bigDecimalAbs(value: BigDecimal): BigDecimal {
  if (value.lt(ZERO_BD)) {
    return value.times(new BigDecimal("-1"));
  }
  return value;
}

export function fastExponentiation(value: BigDecimal, power: number): BigDecimal {
  if (power < 0) {
    const result = fastExponentiation(value, -power);
    return safeDiv(ONE_BD, result);
  }

  if (power === 0) {
    return ONE_BD;
  }

  if (power === 1) {
    return value;
  }

  const halfPower = Math.floor(power / 2);
  const halfResult = fastExponentiation(value, halfPower);

  let result = halfResult.times(halfResult);

  if (power % 2 === 1) {
    result = result.times(value);
  }
  return result;
}

export function isNullEthValue(value: string): boolean {
  return value === "0x0000000000000000000000000000000000000000000000000000000000000001";
}
