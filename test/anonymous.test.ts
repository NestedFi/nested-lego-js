import 'mocha';
import { expect, assert } from 'chai';
import { connect, DexAggregator, INestedContracts } from '../lib';
import { native_token, poly_sushi, poly_usdc, testConfig, TEST_SLIPPAGE } from './test-utils';
import { BigNumber } from '@ethersproject/bignumber';

describe('Anonymous user', () => {
    let instance: INestedContracts;
    async function setup(excludeDexAggregators: DexAggregator[]) {
        instance = await connect({
            ...testConfig(true),
            excludeDexAggregators,
        });
    }
    beforeEach(async () => {
        await setup(['Paraswap']);
    });

    it('builds a portfolio creation with 0x', async () => {
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.isString(ptf.buildCallData()?.data);
    });

    it('builds a portfolio creation with paraswap', async () => {
        await setup(['ZeroEx']);
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.isString(ptf.buildCallData()?.data);
    });

    it('builds an add token', async () => {
        const ptf = instance.addTokensToPortfolio('0x42', poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.isString(ptf.buildCallData()?.data);
    });

    it('builds a swap to multi', async () => {
        const ptf = instance.swapSingleToMulti('0x42', poly_usdc.contract);
        await ptf.swapTo(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.isString(ptf.buildCallData()?.data);
    });

    it('builds a swap to single', async () => {
        const ptf = instance.swapMultiToSingle('0x42', poly_usdc.contract);
        await ptf.swapFrom(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_sushi.smallAmount);
        assert.isString(ptf.buildCallData()?.data);
    });

    it('builds a portfolio liquidation', async () => {
        // portfolio 1 is not burnt, and hopefully never will
        const liquidator = instance.liquidateToWalletAndDestroy('0x1', poly_usdc.contract, 0.3);
        await liquidator.refreshAssets();
        assert.isString(liquidator.buildCallData()?.data);
    });

    it('can sell some token to portfolio', async () => {
        const seller = instance.sellTokensToWallet('0x42', poly_usdc.contract);
        await seller
            .sellToken(poly_sushi.contract, TEST_SLIPPAGE)
            .setInputAmount(BigNumber.from(poly_sushi.smallAmount).div(2));
        await seller
            .sellToken(native_token.contract, TEST_SLIPPAGE)
            .setInputAmount(BigNumber.from(native_token.smallAmount).div(2));
        assert.isString(seller.buildCallData()?.data);
    });

    it('can sell native token to wallet', async () => {
        const seller = instance.sellTokensToWallet('0x42', native_token.contract);
        await seller.sellToken(native_token.contract, TEST_SLIPPAGE).setInputAmount(native_token.smallAmount);
        assert.isString(seller.buildCallData()?.data);
    });

    it('excludes 0x from quote retrieval', async () => {
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.isString(ptf.buildCallData()?.data);
    });
});
