import 'mocha';
import { BigNumber, utils, Wallet } from 'ethers';
import { Chain, DexAggregator, HexNumber, HexString, NATIVE_TOKEN, NestedConnection } from '../lib';
import { TestProvider } from './test-provider';
import { defaultZeroExFetcher } from '../lib/0x';
import { defaultParaSwapFetcher } from '../lib/paraswap';
import objectHash from 'object-hash';
import { getNodejsLibs } from 'evm-js-emulator/src/utils';
import { as, lazy } from '../lib/utils';

export function testConfig(anonymous?: boolean): NestedConnection {
    // if (!process.env.MNEMONIC) {
    //     throw new Error('Please set MNEMONIC environment variable');
    // }
    // const userAddress = Wallet.fromMnemonic(process.env.MNEMONIC).address as HexString;

    if (!/^0x[a-fA-F\d+]{40}$/.test(process.env.USER_ADDRESS ?? '')) {
        throw new Error('Please set MNEMONIC environment variable');
    }
    const userAddress = process.env.USER_ADDRESS as HexString;
    const contract = '0x53b89BAb5a8D589E5c3bE4642A7128C3F27da790';
    const provider = new TestProvider(userAddress, contract);
    const init = lazy(() => provider.fetchNames());
    return {
        contract,
        ...(anonymous
            ? {
                  provider,
                  userAddress,
              }
            : {
                  signer: {
                      provider,
                      async getAddress() {
                          return userAddress;
                      },
                      async sendTransaction(data: any) {
                          await init();
                          return await provider.sendTransaction(data);
                      },
                      async call(a: any, b: any) {
                          await init();
                          return await provider.call(a, b);
                      },
                      estimateGas: () => Promise.resolve(BigNumber.from(0x123)),
                      _isSigner: true,
                  } as any,
                  // signer: Wallet.fromMnemonic(process.env.MNEMONIC)
              }),
        zeroExFetcher: cache('0x', x => defaultZeroExFetcher(x, undefined)),
        paraSwapFetcher: cache('paraswap', defaultParaSwapFetcher),
    };
}

function cache<T extends (...args: any[]) => Promise<any>>(name: string, fn: T): T {
    const { writeCache, readCache } = getNodejsLibs();
    return (async (...args) => {
        const hash = `${name}/${objectHash(args)}.json`;
        const cached = readCache?.(hash);
        if (cached) {
            console.log(args, cached);
            return JSON.parse(cached);
        }
        const value = await fn(...args);
        writeCache?.(hash, JSON.stringify(value));
        return value;
    }) as T;
}

function makeToken(contract: HexString, decimals: number, smallAmount: number) {
    return {
        contract,
        decimals,
        /** Build an amount which can be considered as "small" (to avoid costly tests) */
        smallAmount: utils.parseUnits(smallAmount.toString(), decimals).toHexString() as HexNumber,
        makeAmount(amount: number) {
            return utils.parseUnits(amount.toString(), decimals);
        },
    } as const;
}

// export const TEST_AGGREGATORS = as<(DexAggregator | null)[]>(['Paraswap', 'ZeroEx', null]);
export const TEST_AGGREGATORS = as<(DexAggregator | null)[]>(['Paraswap']); // TODO fix simulator for 0x (tests passes on Tenderly, but not on simulator)

// adjust small amounts if the market changes too much to avoid costly tests :)

export const poly_usdc = makeToken('0x2791bca1f2de4661ed88a30c99a7a9449aa84174', 6, 0.01);
export const native_token = makeToken(NATIVE_TOKEN, 18, 0.01);
export const poly_sushi = makeToken('0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a', 18, 0.01);
export const poly_dai = makeToken('0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', 18, 0.01);
export const poly_usdt = makeToken('0xc2132d05d31c914a87c6611c10748aeb04b58e8f', 6, 0.01);

/** Allow 10% slippage when running tests */
export const TEST_SLIPPAGE = 0.1;
