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
export async function waitOrders(orders: readonly _TokenOrder[]) {
    let i = 0;
    while (true) {
        if (++i > 5) {
            throw new Error('Your order seems to change too fast, cannot compute its budget.');
        }
        const promises = notNil(orders.map(x => x._pendingQuotation));
        if (!promises.length) {
            break;
        }
        await Promise.allSettled(promises);
    }
    return ensureSettledOrders(orders);
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

    async waitTotalBudget(): Promise<BigNumber> {
        const orders = await waitOrders(this._orders);
        return sumBn(orders.map(b => b.inputQty));
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
