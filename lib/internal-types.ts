import { HasOrders, NestedTools, TokenOrder } from './public-types';
import { NestedOrder } from './utils';

export interface _HasOrder extends HasOrders {
    readonly tools: NestedTools;
    _removeOrder(order: _TokenOrder): void;
}

export interface _TokenOrder extends TokenOrder {
    readonly _contractOrder: NestedOrder | null;
}
