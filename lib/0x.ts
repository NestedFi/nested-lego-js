import { BigNumber } from 'ethers';
import { Chain, HexString, SwapArgument } from './public-types';
import { unreachable, wrap } from './utils';
import fetch from 'node-fetch';

/** 0x answer will have this shape */
interface ZeroXAnswer {
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

function zxQuoteUrl(chain: Chain, config: SwapArgument): string {
    const endpoint = zxEndpoint(chain);

    // Wana enrich this api with a buy amount instead of sell ?
    //   👉  `&buyAmount=${BigNumber.from(config.buyQty)}`;
    const op = `&sellAmount=${BigNumber.from(config.spendQty)}`;
    return `${endpoint}swap/v1/quote?sellToken=${wrap(chain, config.spendToken)}&buyToken=${wrap(
        chain,
        config.buyToken,
    )}${op}&slippagePercentage=${config.slippage}`;
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

export async function fetchZxSwap(chain: Chain, config: SwapArgument): Promise<ZeroXAnswer> {
    const url = zxQuoteUrl(chain, config);
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
    }
    return json;
}
