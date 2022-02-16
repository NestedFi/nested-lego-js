import { BigNumber } from 'ethers';
import { _HasOrder, _TokenOrder } from './internal-types';
import { INestedContracts, TokenOrder } from './public-types';
import { NestedOrder, notNil, sumBn } from './utils';

export class HasOrdersImpl implements _HasOrder {
    _contractOrder!: NestedOrder;

    protected get _ordersData(): NestedOrder[] {
        return notNil(this._orders.map(x => x._contractOrder));
    }

    get orders(): readonly TokenOrder[] {
        return this._orders;
    }

    get totalBudget(): BigNumber {
        return sumBn(this.orders.map(b => b.inputQty));
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
