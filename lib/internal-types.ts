import type { BigNumber } from '@ethersproject/bignumber';
import type { HasOrders, NestedTools, TokenOrder } from './public-types';
import type { NestedOrder } from './utils';

export interface _HasOrder extends HasOrders {
    readonly tools: NestedTools;
    _removeOrder(order: _TokenOrder): void;
}

export interface _TokenOrder extends TokenOrder {
    readonly _contractOrder: _TokenOrderData | null;
    readonly _pendingQuotation: PromiseLike<boolean> | null;
}

export interface _TokenOrderData {
    /** The prepared order struct (as defined in smartcontracts) */
    readonly order: NestedOrder;
    /**
     * Input qty that has lead to this order
     * (not necessarily the one present on this order if another operation is pending)
     */
    readonly inputQty: BigNumber;
}

export type ActionType = 'entry' | 'exit';
