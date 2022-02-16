import { BigNumber, ContractReceipt } from 'ethers';
import { _HasOrder, _TokenOrder } from './internal-types';
import {
    CallData,
    HexString,
    INestedContracts,
    NestedTools,
    PortfolioLiquidator,
    Holding,
    TokenLiquidator,
} from './public-types';
import { TokenOrderImpl } from './token-order';
import { notNil, safeMult, wrap } from './utils';

export class PortfolioLiquidatorImpl implements PortfolioLiquidator, _HasOrder {
    private _orders?: _TokenOrder[];

    get orders(): readonly _TokenOrder[] {
        if (!this._orders) {
            throw new Error('You must call .refreshAssets() on your token liquidator first.');
        }
        return this._orders;
    }

    get tools(): NestedTools {
        return this.parent.tools;
    }

    constructor(
        readonly parent: INestedContracts,
        private nftId: BigNumber,
        readonly receivedToken: HexString,
        private defaultSlippage: number,
    ) {
        this.receivedToken = wrap(this.parent.chain, this.receivedToken);
    }

    _removeOrder(order: _TokenOrder): void {
        throw new Error('Cannot remove an order from a liquidation.');
    }

    async refreshAssets(): Promise<TokenLiquidator[]> {
        const assets = await this.parent.getAssets(this.nftId);
        this._orders = await Promise.all(assets.map(a => this._sellToken(a)));
        return [...this._orders];
    }

    private async _sellToken({ token, amount: qty }: Holding) {
        const ret = new TokenOrderImpl(this, token, this.receivedToken, this.defaultSlippage, 'output');
        await ret.setInputAmount(qty);
        return ret;
    }

    buildCallData(): CallData {
        const ordersData = notNil(this.orders.map(x => x._contractOrder));
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('destroy', [
                this.nftId,
                this.receivedToken,
                ordersData,
            ]) as HexString,
        };
    }

    async execute(): Promise<ContractReceipt> {
        // actual transaction
        const callData = this.buildCallData();
        callData.gasLimit = safeMult(await this.parent.signer.estimateGas(callData), 1.1);
        const tx = await this.parent.signer.sendTransaction(callData);
        const receipt = await tx.wait();
        return receipt;
    }
}
