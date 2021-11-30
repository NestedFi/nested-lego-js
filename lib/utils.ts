import { BigNumber, Signer, utils } from 'ethers';
import w3utils, { isBigNumber } from 'web3-utils';
import { defaultContracts, FIXED_FEE } from './default-contracts';
import { Chain, HexNumber, HexString, NATIVE_TOKEN, ZERO_ADDRESS } from './public-types';
import { promisify, callbackify } from 'util';
// @ts-ignore
import limit from 'simple-rate-limiter';

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

export interface NestedOrder {
    operator: string;
    token: HexString;
    callData: string;
    commit: boolean;
}

type RawDataType = 'address' | 'bytes4' | 'bytes' | 'uint256';
export function buildOrderStruct(operator: string, outToken: HexString, data: [RawDataType, any][]): NestedOrder {
    const abiCoder = new utils.AbiCoder();
    //  👉 The contract will prepend an address to the call data we have built.
    // ... given that dynamic length parameters are stored in place as pointers
    //   (the actual data being appended to the encoded data, and a pointer to that data is stored in place of the actual argument)
    //  ... then we must somehow recreate that offset here, by writing a dummy address, that will be removed from the data we're sending.
    //  that way, the pointers will be OK once the address is prepended contract-side.
    const coded = abiCoder.encode(['address', ...data.map(x => x[0])], [ZERO_ADDRESS, ...data.map(x => x[1])]);

    // 👉 Building the struct, as defined in Solidity:
    // struct Order {
    //     bytes32 operator;
    //     address token;
    //     bytes callData;
    //     bool commit;
    // }
    return {
        // specify which operator?
        operator: toBytes32(operator),
        // specify the token that this order will output
        token: outToken,
        // encode the given data
        callData: '0x' + coded.slice(64 + 2), // remove the leading 32 bytes (one address) and the leading 0x
        // callData,
        commit: true, // to remove on next contract update (commit)
    };
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
    if (!bn) {
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

export function removeFees(amt: BigNumber) {
    return safeMult(amt, 1 - FIXED_FEE);
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
