import { BigNumber } from 'ethers';
import { Chain, QuoteErrorReasons, QuoteFailedError } from './public-types';
import { rateLimit, unreachable, wrap } from './utils';
import fetch from 'node-fetch';
import { ZeroExRequest, ZeroXAnswer } from './0x-types';

export enum ZeroXErrorCodes {
    'INSUFFICIENT_ASSET_LIQUIDITY' = 1004,
}

function zxQuoteUrl(config: ZeroExRequest, _zeroExUrl: ((chain: Chain) => string) | undefined): string {
    const endpoint = (_zeroExUrl ?? zxEndpoint)(config.chain);

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

export async function defaultZeroExFetcher(
    config: ZeroExRequest,
    _zeroExUrl: ((chain: Chain) => string) | undefined,
): Promise<ZeroXAnswer> {
    const url = zxQuoteUrl(config, _zeroExUrl);
    let retry = 0;
    while (true) {
        const response = await fetchLimited(url);

        // 429: too many requests => retry 10 times, over 5 seconds
        if (response.status === 429) {
            if (++retry > 10) {
                throw new Error(`Failed to fetch 0x quote because you are over-quota (tried 10 times).`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
        }

        let json: any;
        try {
            json = await response.json();
        } catch (e) {
            // nop !
        }

        // 400: validation failed. A problem with our inputs
        if (response.status === 400) {
            try {
                const errs = json?.validationErrors as { field: string; code: number; reason: string }[];
                if (errs.find(e => e?.code === ZeroXErrorCodes[QuoteErrorReasons.INSUFFICIENT_ASSET_LIQUIDITY])) {
                    throw new QuoteFailedError(QuoteErrorReasons.INSUFFICIENT_ASSET_LIQUIDITY);
                }
            } catch (e) {
                if (e instanceof QuoteFailedError) {
                    throw e;
                }
                // else do nothing, will be handled below
            }
        }

        // other rerror
        if (!response.ok) {
            const error = json?.validationErrors?.[0].reason || QuoteErrorReasons.UNKNOWN_ERROR;
            throw new Error(`Failed to fetch 0x quote: ${error} while fetching ${url} (${response.status})`);
        }
        if (!json) {
            throw new Error(
                `Failed to fetch 0x quote: invalid json returned while fetching ${url} (${response.status})`,
            );
        }
        return json;
    }
}
