import { BigNumber } from 'ethers';
import { Chain } from './public-types';
import { rateLimit, unreachable, wrap } from './utils';
import fetch from 'node-fetch';
import { ZeroExRequest, ZeroXAnswer } from './0x-types';

function zxQuoteUrl(config: ZeroExRequest): string {
    const endpoint = zxEndpoint(config.chain);

    const op =
        'spendQty' in config
            ? `&sellAmount=${BigNumber.from(config.spendQty)}`
            : `&buyAmount=${BigNumber.from(config.boughtQty)}`;
    return `${endpoint}swap/v1/quote?sellToken=${config.spendToken}&buyToken=${config.buyToken}${op}&slippagePercentage=${config.slippage}`;
}

function zxEndpoint(chain: Chain) {
    switch (chain) {
        case Chain.eth:
            return 'https://api.0x.org/';
        case Chain.rop:
            return 'https://ropsten.api.0x.org/';
        case Chain.bsc:
            return 'https://bsc.api.0x.org/';
        case Chain.avax:
            return 'https://avalanche.api.0x.org/';
        case Chain.poly:
            return 'https://polygon.api.0x.org/';
        // case Chain.celo:
        //     return 'https://celo.api.0x.org/';
        default:
            throw unreachable(chain);
    }
}

// 0x api is limited to 6 requests per sec, and 120 per min
// => use a lower limit to avoid hitting it.
const fetchLimited = rateLimit(fetch, [
    { interval: 1000, limit: 5 },
    { interval: 60 * 1000, limit: 110 },
]);

export async function defaultZeroExFetcher(config: ZeroExRequest): Promise<ZeroXAnswer> {
    const url = zxQuoteUrl(config);
    const response = await fetchLimited(url);
    const json = await response.json();
    if (!response.ok) {
        const error = json?.validationErrors?.[0].reason || 'Unkonwn error';
        throw new Error(`Failed to fetch 0x quote: ${error} while fetching ${url} (${response.status})`);
    }
    return json;
}
