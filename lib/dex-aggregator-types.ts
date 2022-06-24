import { BigNumber } from 'ethers';
import { Chain, HexString } from './public-types';

export type DexAggregator = 'ZeroEx' | 'ParaSwap';

export type AggregatorRequest = {
    readonly userAddress?: HexString;
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

export interface AggregatorQuoteResponse {
    aggregator: DexAggregator;
    chainId: number;
    price: string;
    guaranteedPrice: string;
    to: HexString;
    data: HexString;
    value: string;
    gas?: string;
    estimatedGas?: string;
    gasPrice?: string;
    protocolFee?: string;
    minimumProtocolFee?: string;
    buyTokenAddress: HexString;
    sellTokenAddress: HexString;
    buyAmount: string;
    sellAmount: string;
    allowanceTarget: HexString;
    estimatedPriceImpact: string;
}
