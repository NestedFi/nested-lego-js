import { assert, expect } from 'chai';
import 'mocha';
import { CanAddTokensOperation, Chain, connect } from '../lib';
import { DexAggregator } from '../lib/dex-aggregator-types';
import { defaultParaSwapFetcher } from '../lib/paraswap';
import { poly_sushi, poly_usdc, testConfig, TEST_SLIPPAGE } from './test-utils';

describe('Paraswap SDK', () => {
    async function approve(add: CanAddTokensOperation) {
        if (!(await add.isApproved())) {
            console.log('🔃 Approving USDC...');
            await add.approve();
            console.log('✅ Approved USDC.');
        }
    }

    async function getTestConfig() {
        return { ...(await testConfig()), excludeDexAggregators: ['ZeroEx' as DexAggregator] };
    }

    it('Request a quote from ParaSwap', async () => {
        const resp = await defaultParaSwapFetcher({
            chain: Chain.poly,
            buyToken: poly_sushi.contract,
            spendToken: poly_usdc.contract,
            spendQty: poly_usdc.makeAmount(1),
            slippage: 0.03,
        });
        assert.isString(resp?.transaction.to);
        assert.lengthOf(resp!.transaction.to, 42);
        assert.isArray(resp?.priceRoute.bestRoute);
    });

    it('Uses ParaSwap to buy an exact amount of a token', async () => {
        const instance = await connect({ chain: Chain.poly, excludeDexAggregators: ['ZeroEx'] });
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setOutputAmount(poly_sushi.makeAmount(42));
        expect(ptf.orders.length).to.be.greaterThan(0);
    });

    it('Can create a simple portfolio with input budget', async () => {
        const instance = await connect(await getTestConfig());
        const beforeSpent = await instance.tools.balanceOf(poly_usdc.contract);

        // swap USDC for SUSHI
        const ptf = instance.createPortfolio(poly_usdc.contract, {
            name: 'Test Portfolio',
            tags: ['test'],
        });
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
        const instance = await connect(await getTestConfig());
        const beforeSpent = await instance.tools.balanceOf(poly_usdc.contract);

        // swap USDC for SUSHI
        const ptf = instance.createPortfolio(poly_usdc.contract, {
            name: 'Test Portfolio',
            tags: ['test'],
        });
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setOutputAmount(poly_sushi.smallAmount);
        await approve(ptf);
        const { idInChain, id } = await ptf.execute();
        assert.isString(id);
        assert.isString(idInChain);

        // check that USDC has been spent
        const afterSpent = await instance.tools.balanceOf(poly_usdc.contract);
        expect(beforeSpent.toHexString()).not.to.be.equal(afterSpent.toHexString(), 'Should have spent USDC');
    });
});
