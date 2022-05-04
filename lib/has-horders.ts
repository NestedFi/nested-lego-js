import { BigNumber } from 'ethers';
import { _HasOrder, _TokenOrder } from './internal-types';
import { INestedContracts, TokenOrder } from './public-types';
import { NestedOrder, notNil, nullish, sumBn } from './utils';

export function ensureSettledOrders(orders: readonly _TokenOrder[]) {
    const ret = orders.map(x => x._contractOrder);
    if (ret.some(x => nullish(x))) {
        throw new Error('Operation is not yet ready (an order is still loading, or errored)');
    }
    return notNil(ret);
}

export class HasOrdersImpl implements _HasOrder {
    _contractOrder!: NestedOrder;

    protected get _ordersData(): NestedOrder[] {
        return ensureSettledOrders(this._orders).map(x => x.order);
    }

    get orders(): readonly TokenOrder[] {
        return this._orders;
    }

    get totalBudget(): BigNumber {
        return sumBn(ensureSettledOrders(this._orders).map(b => b.inputQty));
    }

    _removeOrder(order: _TokenOrder) {
        const i = this._orders.indexOf(order);
        this._orders.splice(i, 1);
    }

    get tools() {
        return this.parent.tools;
    }

    constructor(readonly parent: INestedContracts, protected _orders: _TokenOrder[] = []) {}
}
