import 'mocha';
import { BigNumber, utils, Wallet } from 'ethers';
import { HexNumber, HexString, NATIVE_TOKEN, NestedConnection } from '../lib';
import { TestProvider } from './test-provider';

export async function testConfig(): Promise<NestedConnection> {
    if (!process.env.MNEMONIC) {
        throw new Error('Please set MNEMONIC environment variable');
    }
    const addr = '0x8B09AB0612d4E1D44Cf0C1641b5d0be43a3aec9F';
    const provider = new TestProvider(addr);
    return {
        contract: '0x53b89BAb5a8D589E5c3bE4642A7128C3F27da790',
        signer: {
            provider,
            async getAddress() {
                return addr;
            },
            sendTransaction(data: any) {
                return provider.sendTransaction(data);
            },
            call(a: any, b: any) {
                return provider.call(a, b);
            },
            estimateGas: () => Promise.resolve(BigNumber.from(0x123)),
            _isSigner: true,
            // Wallet.fromMnemonic(process.env.MNEMONIC)
        } as any,
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
