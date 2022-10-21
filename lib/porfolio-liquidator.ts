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
    ExecOptions,
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
        const assets = await this.parent.getAssets(this.nftId, true);
        this._orders = await Promise.all(assets.map(a => this._sellToken(a)));
        return [...this._orders];
    }

    private async _sellToken({ token, amount: qty }: Holding) {
        const ret = new TokenOrderImpl(this, token, this.receivedToken, this.defaultSlippage, 'output', 'exit', true);
        await ret.setInputAmount(qty);
        return ret;
    }

    buildCallData(): CallData {
        // here, we ignore the orders that have failed to compute a swap
        // in order to be able to liquidate portfolios that contain illiquid assets
        //  ... smartcontracts will send all remaining assets after swaps to the wallet.
        const ordersData = notNil(this.orders.map(x => x._contractOrder?.order));
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('destroy', [
                this.nftId,
                this.receivedToken,
                ordersData,
            ]) as HexString,
        };
    }

    async execute(options?: ExecOptions): Promise<ContractReceipt> {
        // actual transaction
        const callData = this.buildCallData();
        await this.parent.tools.prepareCalldata(callData, options);
        const tx = await this.parent.signer.sendTransaction(callData);
        const receipt = await tx.wait();
        return receipt;
    }
}
