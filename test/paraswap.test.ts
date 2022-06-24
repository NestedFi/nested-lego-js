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
        console.log(resp);
    });
});
