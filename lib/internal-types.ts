import { BigNumber } from '@ethersproject/bignumber';
import { HasOrders, NestedTools, TokenOrder } from './public-types';
import { NestedOrder } from './utils';

export interface _HasOrder extends HasOrders {
    readonly tools: NestedTools;
    _removeOrder(order: _TokenOrder): void;
}

export interface _TokenOrder extends TokenOrder {
    readonly _contractOrder: _TokenOrderData | null;
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
