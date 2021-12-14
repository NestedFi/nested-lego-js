import type { BigNumber } from 'ethers';
import type { Chain, HexString } from './public-types';

export type ZeroExRequest = {
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
} & (
    | {
          /** Spent quantity */
          readonly spendQty: BigNumber;
      }
    | {
          /** Bought quantity */
          readonly boughtQty: BigNumber;
      }
);

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
