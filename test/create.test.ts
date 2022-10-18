import 'mocha';
import { expect, assert } from 'chai';
import { CanAddTokensOperation, connect, INestedContracts } from '../lib';
import {
    native_token,
    poly_dai,
    poly_sushi,
    poly_usdc,
    poly_usdt,
    testConfig,
    TEST_AGGREGATORS,
    TEST_SLIPPAGE,
} from './test-utils';
import { logExec } from './test-provider';

for (const aggregator of TEST_AGGREGATORS) {
    describe(`Create (using ${aggregator ?? 'all'})`, () => {
        let instance: INestedContracts;
        beforeEach(async () => {
            instance = await connect({
                ...testConfig(),
                onlyUseAggregators: aggregator ? [aggregator] : undefined,
            });
        });
        async function approve(add: CanAddTokensOperation) {
            if (!(await add.isApproved())) {
                console.log('🔃 Approving USDC...');
                await add.approve();
                console.log('✅ Approved USDC.');
            }
        }

        it('Can create a simple portfolio with input budget', async () => {
            const beforeSpent = await instance.tools.balanceOf(poly_usdc.contract);
            assert.isTrue(beforeSpent.gt(poly_usdc.smallAmount), 'not enough usdc');

            // swap USDC for SUSHI
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await approve(ptf);
            const { idInChain, id } = await ptf.execute();
            assert.isString(id);
            assert.isString(idInChain);

            // check that USDC has been spent
            const afterSpent = await instance.tools.balanceOf(poly_usdc.contract);
            expect(beforeSpent.toHexString()).not.to.be.equal(afterSpent.toHexString(), 'Should have spent USDC');
        });

        it('Can create a simple portfolio with output budget', async () => {
            const beforeSpent = await instance.tools.balanceOf(poly_usdc.contract);

            // swap USDC for SUSHI
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setOutputAmount(poly_sushi.smallAmount);
            await approve(ptf);
            const { idInChain, id } = await ptf.execute();
            assert.isString(id);
            assert.isString(idInChain);

            // check that USDC has been spent
            const afterSpent = await instance.tools.balanceOf(poly_usdc.contract);
            expect(beforeSpent.toHexString()).not.to.be.equal(afterSpent.toHexString(), 'Should have spent USDC');
        });

        it('porfolio without swap', async () => {
            // buy USDC with USDC => should use the flat operator (= no swap)
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(poly_usdc.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await approve(ptf);
            const { idInChain } = await ptf.execute();
            assert.isString(idInChain);
        });

        it('pay swap in a portfolio using native token', async () => {
            // wrap + swap MATIC for SUSHI
            const ptf = instance.createPortfolio(native_token.contract);
            await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(native_token.smallAmount);
            await approve(ptf);
            const { idInChain } = await ptf.execute();
            assert.isString(idInChain);
        });

        it('portfolio containing native token with native token', async () => {
            // build a portfolio with matic
            const ptf = instance.createPortfolio(native_token.contract);
            await ptf.addToken(native_token.contract, TEST_SLIPPAGE).setInputAmount(native_token.smallAmount);
            await approve(ptf);
            const { idInChain } = await ptf.execute();
            assert.isString(idInChain);
        });

        it('create portfolio with an ERC20 budget', async () => {
            // build a matic portfolio using usdc
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await approve(ptf);
            const { idInChain } = await ptf.execute();
            assert.isString(idInChain);
        });

        it('create portfolio with multiple assets from an ERC20 budget', async () => {
            // build a matic portfolio using usdc
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await ptf.addToken(poly_usdt.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await ptf.addToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await approve(ptf);
            const { idInChain } = await ptf.execute();
            assert.isString(idInChain);
        });

        it('create portfolio with assets and itself from an ERC20 budget', async () => {
            // build a matic portfolio using usdc
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await ptf.addToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await ptf.addToken(poly_usdc.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await approve(ptf);
            const { idInChain } = await ptf.execute();
            assert.isString(idInChain);
        });

        it('pay native token portfolio with another token', async () => {
            // build a matic portfolio using usdc
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(native_token.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await approve(ptf);
            const { idInChain } = await ptf.execute();
            assert.isString(idInChain);
        });
    });
}
