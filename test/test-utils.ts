import 'mocha';
import { utils, Wallet } from 'ethers';
import { Chain, HexNumber, HexString, NATIVE_TOKEN, NestedConnection } from '../lib';

export async function testConfig(): Promise<NestedConnection> {
    if (!process.env.MNEMONIC || !process.env.CHAIN) {
        throw new Error('Please set MNEMONIC environment variable');
    }
    return {
        chain: process.env.CHAIN as Chain,
        signer: Wallet.fromMnemonic(process.env.MNEMONIC),
        contract: '0x53b89BAb5a8D589E5c3bE4642A7128C3F27da790',
        defaultGasPrice: process.env.GAS_PRICE,
        // excludeDexAggregators: ['ZeroEx'],
    };
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

// adjust small amounts if the market changes too much to avoid costly tests :)

export const poly_usdc = makeToken('0x2791bca1f2de4661ed88a30c99a7a9449aa84174', 6, 0.01);
export const poly_sushi = makeToken('0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a', 18, 0.01);
export const native_token = makeToken(NATIVE_TOKEN, 18, 0.01);

/** Allow 10% slippage when running tests */
export const TEST_SLIPPAGE = 0.1;
