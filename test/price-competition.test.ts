import 'mocha';
import { assert } from 'chai';
import { Chain, connect, HexString, ZeroXAnswer } from '../lib';
import { poly_sushi, poly_usdc, TEST_SLIPPAGE } from './test-utils';
import { AggregatorRequest, DexAggregator } from '../lib/dex-aggregator-types';
import { ParaSwapAnswer } from '../lib/paraswap-types';
import paraswapResponse from './fixtures/paraswap-response.json';
import zeroExResponse from './fixtures/zeroex-response.json';
import { BigNumber } from 'ethers';

describe('Price competition', () => {
    /*
    let instance: INestedContracts;
    beforeEach(async () => {
              instance = await connect({ chain: Chain.poly, excludeDexAggregators: });
    });
    */

    const addTokenExcludingDexAggregator = async (exclude: DexAggregator) => {
        const instance = await connect({ chain: Chain.poly, excludeDexAggregators: [exclude] });
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.isSealed(ptf.buildCallData()?.data);
    };

    it('Excludes 0x from quoting', () => {
        return addTokenExcludingDexAggregator('ZeroEx');
    });

    it('Excludes ParaSwap from quoting', () => {
        return addTokenExcludingDexAggregator('ParaSwap');
    });

    it('should pick ParaSwap as cheapest', async () => {
        const instance = await connect({
            chain: Chain.poly,
            paraSwapFetcher: fetchParaSwapMocked,
            zeroExFetcher: (_: AggregatorRequest) => fetch0xMocked(),
        });
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.equal(ptf.orders[0].operator, 'ParaSwap');
    });

    it('should pick 0x as cheapest', async () => {
        const instance = await connect({
            chain: Chain.poly,
            paraSwapFetcher: fetchParaSwapMocked,
            zeroExFetcher: (_: AggregatorRequest) => fetch0xMocked(BigNumber.from(700000)),
        });
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
        assert.equal(ptf.orders[0].operator, 'ZeroEx');
    });
});

function fetchParaSwapMocked(request: AggregatorRequest): Promise<ParaSwapAnswer> {
    return Promise.resolve({
        priceRoute: paraswapResponse.priceRoute as any,
        transaction: {
            from: '',
            to: '',
            value: '0',
            data: '0x',
            chainId: 0,
        },
    });
}

function fetch0xMocked(buyAmount?: BigNumber): Promise<ZeroXAnswer> {
    return Promise.resolve({
        ...zeroExResponse,
        buyAmount: buyAmount?.toString() ?? zeroExResponse.buyAmount,
    } as any);
}
