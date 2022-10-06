import { OptimalRate } from 'paraswap-core';
import { Transaction } from 'paraswap';
import { AggregatorRequest } from './dex-aggregator-types';

export type ParaSwapFetcher = (request: AggregatorRequest) => Promise<ParaSwapAnswer | null>;

export interface ParaSwapAnswer {
    priceRoute: OptimalRate;
    transaction: Transaction;
}
