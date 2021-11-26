import 'mocha';
import { expect, assert } from 'chai';
import { CanAddTokensOperation, Chain, connect, HexString, INestedContracts } from '../lib';
import { native_token, poly_sushi, poly_usdc, testConfig, TEST_SLIPPAGE } from './test-utils';

describe('Create', () => {
    let instance: INestedContracts;
    before(async () => {
        instance = connect(await testConfig());
    });
    async function approve(add: CanAddTokensOperation) {
        if (!(await add.isApproved())) {
            console.log('🔃 Approving USDC...');
            await add.approve();
            console.log('✅ Approved USDC.');
        }
    }

    it('Can create a simple portfolio', async () => {
        const beforeSpent = await instance.tools.balanceOf(poly_usdc.contract);

        // swap USDC for SUSHI
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, poly_usdc.smallAmount, TEST_SLIPPAGE);
        await approve(ptf);
        const { idInChain, id } = await ptf.execute();
        assert.isString(id);
        assert.isString(idInChain);

        // check that USDC has been spent
        const afterSpent = await instance.tools.balanceOf(poly_usdc.contract);
        assert.isString(beforeSpent);
        assert.isString(afterSpent);
        expect(beforeSpent).not.to.be.equal(afterSpent, 'Should have spent USDC');
    });

    it('porfolio without swap', async () => {
        // buy USDC with USDC => should use the flat operator (= no swap)
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_usdc.contract, poly_usdc.smallAmount, TEST_SLIPPAGE);
        await approve(ptf);
        const { idInChain } = await ptf.execute();
        assert.isString(idInChain);
    });

    it('pay swap in a portfolio using native token', async () => {
        // wrap + swap MATIC for SUSHI
        const ptf = instance.createPortfolio(native_token.contract);
        await ptf.addToken(poly_sushi.contract, native_token.smallAmount, TEST_SLIPPAGE);
        await approve(ptf);
        const { idInChain } = await ptf.execute();
        assert.isString(idInChain);
    });

    it('portfolio containing native token with native token', async () => {
        // build a portfolio with matic
        const ptf = instance.createPortfolio(native_token.contract);
        await ptf.addToken(native_token.contract, native_token.smallAmount, TEST_SLIPPAGE);
        await approve(ptf);
        const { idInChain } = await ptf.execute();
        assert.isString(idInChain);
    });

    it('pay native token portfolio with another token', async () => {
        // build a matic portfolio using usdc
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(native_token.contract, poly_usdc.smallAmount, TEST_SLIPPAGE);
        await approve(ptf);
        const { idInChain } = await ptf.execute();
        assert.isString(idInChain);
    });
});
