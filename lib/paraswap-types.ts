import { OptimalRate } from 'paraswap-core';
import { TransactionParams } from '@paraswap/sdk';
import { AggregatorRequest } from './dex-aggregator-types';

export type ParaSwapFetcher = (request: AggregatorRequest) => Promise<ParaSwapAnswer | null>;

export interface ParaSwapAnswer {
    priceRoute: OptimalRate;
    transaction: TransactionParams;
}
