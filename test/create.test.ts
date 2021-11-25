import 'mocha';
import { expect, assert } from 'chai';
import { Chain, connect, HexString, INestedContracts } from '../lib';
import { native_token, poly_sushi, poly_usdc, testConfig, TEST_SLIPPAGE } from './test-utils';

describe('Create', () => {
    let instance: INestedContracts;
    before(async () => {
        instance = connect(await testConfig());
        if (!(await instance.isApproved(poly_usdc.contract, poly_usdc.makeAmount(1000).toHexString() as HexString))) {
            console.log('🔃 Approving USDC...');
            await instance.approve(poly_usdc.contract);
            console.log('✅ Approved USDC.');
        }
    });

    it('Can create a simple portfolio', async () => {
        // swap USDC for SUSHI
        const swap = await instance.prepareOrder({
            spendToken: poly_usdc.contract,
            buyToken: poly_sushi.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: poly_usdc.smallAmount,
        });

        const beforeSpent = await instance.balanceOf(poly_usdc.contract);

        // create portfolio
        const { id, idInChain } = await instance.createPortfolio([swap]);
        assert.isString(id);
        assert.isString(idInChain);

        // check that USDC has been spent
        const afterSpent = await instance.balanceOf(poly_usdc.contract);
        assert.isString(beforeSpent);
        assert.isString(afterSpent);
        expect(beforeSpent).not.to.be.equal(afterSpent, 'Should have spent USDC');
    });

    it('porfolio without swap', async () => {
        // buy USDC with USDC => should use the flat operator (= no swap)
        const swap = await instance.prepareOrder({
            spendToken: poly_usdc.contract,
            buyToken: poly_usdc.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: poly_usdc.smallAmount,
        });

        const { idInChain } = await instance.createPortfolio([swap]);
        assert.isString(idInChain);
    });

    it('pay swap in a portfolio using native token', async () => {
        // wrap + swap MATIC for SUSHI
        const swap = await instance.prepareOrder({
            spendToken: native_token.contract,
            buyToken: poly_sushi.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: native_token.smallAmount,
        });

        const { idInChain } = await instance.createPortfolio([swap]);
        assert.isString(idInChain);
    });

    it('portfolio containing native token with native token', async () => {
        // build a portfolio with matic
        const swap = await instance.prepareOrder({
            spendToken: native_token.contract,
            buyToken: native_token.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: native_token.smallAmount,
        });

        const { idInChain } = await instance.createPortfolio([swap]);
        assert.isString(idInChain);
    });

    it('pay native token portfolio with another token', async () => {
        // build a matic portfolio using usdc
        const swap = await instance.prepareOrder({
            spendToken: poly_usdc.contract,
            buyToken: native_token.contract,
            slippage: TEST_SLIPPAGE,
            spendQty: poly_usdc.smallAmount,
        });

        const { idInChain } = await instance.createPortfolio([swap]);
        assert.isString(idInChain);
    });
});
