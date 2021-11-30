import { BigNumber } from 'ethers';
import { Chain, HexString } from './public-types';
import { rateLimit, unreachable, wrap } from './utils';
import fetch from 'node-fetch';

export type ZeroExFetcher = (request: ZeroExRequest) => Promise<ZeroXAnswer>;

/** 0x answer will have this shape */
export interface ZeroXAnswer {
    chainId: number;
    price: string;
    guaranteedPrice: string;
    to: HexString;
    data: HexString;
    value: string;
    gas: string;
    estimatedGas: string;
    gasPrice: string;
    protocolFee: string;
    minimumProtocolFee: string;
    buyTokenAddress: HexString;
    sellTokenAddress: HexString;
    buyAmount: string;
    sellAmount: string;
    sources: [
        {
            name: HexString;
            proportion: string;
        },
    ];
    orders: [
        {
            makerToken: HexString;
            takerToken: HexString;
            makerAmount: string;
            takerAmount: string;
            fillData: {
                tokenAddressPath: HexString[];
                router: HexString;
            };
            source: string;
            sourcePathId: HexString;
            type: number;
        },
    ];
    allowanceTarget: HexString;
    sellTokenToEthRate: 1;
    buyTokenToEthRate: string;
}

function zxQuoteUrl(config: ZeroExRequest): string {
    const endpoint = zxEndpoint(config.chain);

    // Wana enrich this api with a buy amount instead of sell ?
    //   👉  `&buyAmount=${BigNumber.from(config.buyQty)}`;
    const op = `&sellAmount=${BigNumber.from(config.spendQty)}`;
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

export interface ZeroExRequest {
    readonly chain: Chain;
    /** Token you'd like to spend */
    readonly spendToken: HexString;
    /** Token you'd like to receive */
    readonly buyToken: HexString;
    /**
     * Accepted slippage (ex: '0.03' means 3% slippage accepted).
     * Applicable if this order is a swap (if spent & buy token are different) - ignored otherwise.
     */
    readonly slippage: number;
    /** Spent quantity */
    readonly spendQty: BigNumber;
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
