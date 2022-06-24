import { OptimalRate } from 'paraswap-core';
import { Transaction } from 'paraswap';
import { AggregatorQuoteResponse, AggregatorRequest } from './dex-aggregator-types';

export type ParaSwapFetcher = (request: AggregatorRequest) => Promise<ParaSwapAnswer>;

export interface ParaSwapAnswer {
    priceRoute: OptimalRate;
    transaction: Transaction;
}
