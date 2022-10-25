import { BigNumber, ethers, Signer, utils } from 'ethers';
import w3utils, { isBigNumber } from 'web3-utils';
import { defaultContracts } from './default-contracts';
import { Chain, HexNumber, HexString, NATIVE_TOKEN, PortfolioIdIsh } from './public-types';
import { promisify, callbackify } from 'util';
// @ts-ignore
import limit from 'simple-rate-limiter';

type nil = null | undefined;

export function unreachable(value: never, message?: string): Error {
    return new Error(message ? message : 'Value was supposed to be unreachable' + value);
}

export function toBytes32(data: string) {
    return w3utils.rightPad(w3utils.asciiToHex(data), 64);
}

export function objectToHex(data: any): string {
    return w3utils.stringToHex(JSON.stringify(data));
}

export function hexToObject<T>(data: string): T {
    return JSON.parse(w3utils.hexToString(data));
}

// see https://github.com/NestedFinance/nested-core-lego/blob/d937f6aa782c3453784e3d58cedaee012eda4273/contracts/interfaces/INestedFactory.sol#L73-L78
export interface BatchedOutputOrders {
    outputToken: HexString;
    amounts: BigNumber[];
    orders: NestedOrder[];
    toReserve: boolean;
}

// see https://github.com/NestedFinance/nested-core-lego/blob/d937f6aa782c3453784e3d58cedaee012eda4273/contracts/interfaces/INestedFactory.sol#L60-L65
export interface BatchedInputOrders {
    inputToken: HexString;
    amount: BigNumber;
    orders: NestedOrder[];
    fromReserve: boolean;
}

// see https://github.com/NestedFinance/nested-core-lego/blob/d937f6aa782c3453784e3d58cedaee012eda4273/contracts/interfaces/INestedFactory.sol#L48-L52
export interface NestedOrder {
    operator: string;
    token: HexString;
    callData: string;
}

type RawDataType = 'address' | 'bytes4' | 'bytes' | 'uint256';
export function buildOrderStruct(operator: string, outToken: HexString, data: [RawDataType, any][]): NestedOrder {
    const abiCoder = new utils.AbiCoder();
    const coded = abiCoder.encode(
        data.map(x => x[0]),
        data.map(x => x[1]),
    );

    // 👉 Building the struct, as defined in Solidity:
    // struct Order {
    //     bytes32 operator;
    //     address token;
    //     bytes callData;
    // }
    return {
        // specify which operator?
        operator: toBytes32(operator),
        // specify the token that this order will output
        token: outToken,
        // encode the given data
        callData: coded,
    };
}

export function toNumber(num: ethers.BigNumber | HexNumber, decimals: number): number;
export function toNumber(num: ethers.BigNumber | HexNumber | nil, decimals: number | nil): number | nil;
export function toNumber(num: ethers.BigNumber | HexNumber | nil, decimals: number | nil): number | nil {
    if (nullish(num) || nullish(decimals)) {
        return null;
    }
    const str = ethers.utils.formatUnits(num, decimals);
    return parseFloat(str);
}

/**
 * Multiplies a bignumber by a non integer ratio
 *
 * When n is bignumber = 1000 * 10 ** 18
 * formatEther(mulRatio(n, 1.00))) 👉 '10000'
 * formatEther(mulRatio(n, 1.00002))) 👉 '10000.02'
 * formatEther(mulRatio(n, 0.0000003))) 👉 '0.0003'
 * formatEther(mulRatio(n, 398392))) 👉 '3983922000'
 *
 */
export function safeMult(bn: BigNumber, ratio: number): BigNumber {
    if (!bn || ratio === 1) {
        return bn;
    }

    // Math.log10(0) will be infinity, ratio of 0 will be 0.
    if (ratio <= 0) {
        return BigNumber.from(0);
    }

    // try to keep 10 significant decimals in the multiplicator ratio
    let precision = 10 - Math.round(Math.log10(ratio));

    // at least try to keep 2 decimals (if ratio is large)
    if (precision < 2) {
        precision = 2;
    }

    // the ratio, raised to the precision we want
    const largeRatio = ratio * 10 ** precision;

    // the factor it must be divided by to be correct
    const factor = BigNumber.from(10).pow(precision);

    const ratioWithPrecision = BigNumber.from(Math.floor(largeRatio));

    return bn.mul(ratioWithPrecision).div(factor);
}

export function divideBigNumbers(a: BigNumber, b: BigNumber, precision = 18): number {
    const bigResult = a.mul(BigNumber.from(10).pow(precision)).div(b);
    return toNumber(bigResult, precision);
}

export function removeFees(amt: BigNumber, feesRate: BigNumber) {
    // this is the amount that corresponds to the given amount, without fees
    // ... but it will factor a rounding amount when re-adding fees on top of it.
    let spent = amt.mul(10000).div(feesRate.add(10000));

    // add as much as possible to the amount without fees so the rounding error
    // in fees computation will be embbeded in this amount
    // see _submitInOrders() implementation in contracts
    while (addFees(spent, feesRate).lt(amt)) {
        spent = spent.add(1);
    }

    // ... but there are some cases that cannot be compensated
    // for instance, there is no way to remove 0.8% fees from quantity 9953
    //  (nb: there is a UT for that, if you want to convince yourself)
    //  => we'll prefer a smaller spent amount (fees will be prioritary)
    //  => we will have 0x1 underspending
    while (addFees(spent, feesRate).gt(amt)) {
        spent = spent.sub(1);
    }
    return spent;
}

export function addFees(amt: BigNumber, feesRate: BigNumber) {
    return amt.add(feesFor(amt, feesRate));
}

export function feesFor(amt: BigNumber, feesRate: BigNumber) {
    return amt.mul(feesRate).div(10000);
}

export function wrap(chain: Chain, token: HexString): HexString {
    token = normalize(token);
    if (token === NATIVE_TOKEN) {
        const wrapped = defaultContracts[chain].wrappedToken;
        if (!wrapped) {
            throw new Error('Chain not supported: ' + chain);
        }
        return normalize(wrapped);
    }
    return token;
}

export function unwrap(chain: Chain, token: HexString): HexString {
    token = normalize(token);
    if (token === defaultContracts[chain].wrappedToken) {
        return NATIVE_TOKEN;
    }
    return token;
}

export type Lazy<T> = () => Promise<T>;

export function lazy<T>(ctor: () => Promise<T>): Lazy<T> {
    let cached: Promise<T>;
    let retreived = false;
    return async () => {
        if (retreived) {
            return await cached;
        }
        cached = ctor();
        retreived = true;
        return await cached;
    };
}

export type LazySync<T> = () => T;
export function lazySync<T>(ctor: () => T): LazySync<T> {
    let cached: T;
    let retreived = false;
    return () => {
        if (retreived) {
            return cached;
        }
        cached = ctor();
        retreived = true;
        return cached;
    };
}

export function normalize(str: HexString): HexString {
    return str.toLowerCase() as HexString;
}

export function checkHasSigner(signer: Signer | undefined): Signer {
    if (!signer) {
        throw new Error('No signer available. Please provide a signer when calling connect()');
    }
    return signer!;
}

export function isBigNumberTyped(value: any): value is BigNumber {
    return isBigNumber(value);
}

export function rateLimit<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    limits: { interval: number; limit: number }[],
): T {
    let callback = callbackify(fn);
    for (const l of limits) {
        callback = limit(callback).to(l.limit).per(l.interval);
    }
    return promisify(callback) as any;
}

export function notNil<T>(array: T[]): Exclude<T, null | undefined>[] {
    return array.filter(x => !nullish(x)) as any[];
}

export function nullish<T>(value: T | null | undefined): value is null | undefined {
    return value === null || value === undefined;
}

export function inferNftId(portfolioId: PortfolioIdIsh, expectedChain: Chain): BigNumber {
    if (isBigNumberTyped(portfolioId)) {
        return portfolioId;
    }
    if (/^0x[a-f\d]+$/i.test(portfolioId) || /^\d+$/.test(portfolioId)) {
        return BigNumber.from(portfolioId);
    }
    const [_, idChain, id] = /^(\w+):(\d+)$/.exec(portfolioId) ?? [];
    if (idChain !== expectedChain) {
        throw new Error(`The given portfolio ID "${portfolioId}" cannot be processed on this chain (${expectedChain})`);
    }
    return BigNumber.from(parseInt(id));
}

/** Just a user-friendly typing helper that ensures an object is of a given type */
export function as<T>(value: T): T {
    return value;
}

export function groupBy<T, K>(values: T[], getKey: (value: T) => K): Map<K, T[]> {
    const ret = new Map<K, T[]>();
    for (const v of values) {
        const k = getKey(v);
        let col = ret.get(k);
        if (!col) {
            ret.set(k, (col = []));
        }
        col.push(v);
    }
    return ret;
}

export function sumBn(values: BigNumber[]) {
    return values.reduce((acc, val) => acc.add(val), BigNumber.from(0));
}
