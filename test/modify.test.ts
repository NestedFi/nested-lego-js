import 'mocha';
import { expect, assert } from 'chai';
import { Chain, connect, HexString, INestedContracts } from '../lib';
import { native_token, poly_sushi, poly_usdc, testConfig, TEST_SLIPPAGE } from './test-utils';

describe('Modify', () => {
    let instance: INestedContracts;
    let id: HexString;
    before(async () => {
        instance = connect(await testConfig());
        if (!(await instance.isApproved(poly_usdc.contract, poly_usdc.makeAmount(1000).toHexString() as HexString))) {
            console.log('🔃 Approving USDC...');
            await instance.approve(poly_usdc.contract);
            console.log('✅ Approved USDC.');
        }

        // Create a porfolio with 2 tokens in it
        const sushi = await instance.prepareSwap({
            spendToken: poly_usdc.contract,
            buyToken: poly_sushi.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: poly_usdc.smallAmount,
        });
        const matic = await instance.prepareSwap({
            spendToken: poly_usdc.contract,
            buyToken: native_token.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: poly_usdc.smallAmount,
        });

        const { idInChain } = await instance.createPortfolio([sushi, matic]);
        assert.isString(idInChain);
        id = idInChain;
    });

    it('can add token from wallet', async () => {
        const usdc = await instance.prepareSwap({
            spendToken: native_token.contract,
            buyToken: poly_usdc.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: native_token.smallAmount,
        });
        await instance.addTokenToPortfolio(id, [usdc]);
    });
});
