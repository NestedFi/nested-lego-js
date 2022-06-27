import { assert } from 'chai';
import 'mocha';
import { Chain } from '../lib';
import { defaultParaSwapFetcher } from '../lib/paraswap';
import { poly_sushi, poly_usdc } from './test-utils';

describe('Paraswap SDK', () => {
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
});
