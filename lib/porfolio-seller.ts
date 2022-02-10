import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ContractReceipt } from '@ethersproject/contracts';
import { HasOrdersImpl } from './has-horders';
import { CallData, HexString, INestedContracts, PortfolioSeller, TokenOrder } from './public-types';
import { TokenOrderImpl } from './token-order';
import { as, BatchedOutputOrders, normalize, wrap } from './utils';

export class PortfolioSellerImpl extends HasOrdersImpl implements PortfolioSeller {
    constructor(parent: INestedContracts, private nftId: BigNumber, readonly receivedToken: HexString) {
        super(parent);
        this.receivedToken = wrap(this.parent.chain, this.receivedToken);
    }

    sellToken(token: HexString, slippage: number): TokenOrder {
        token = wrap(this.parent.chain, token);
        const ret = new TokenOrderImpl(this, token, this.receivedToken, slippage, 'output');
        this._orders.push(ret);
        return ret;
    }

    buildCallData(): CallData {
        const soldAmounts = this._orders.map(x => x.inputQty);
        if (!soldAmounts.length) {
            throw new Error('Nothing to sell');
        }
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('processOutputOrders', [
                this.nftId,
                [
                    as<BatchedOutputOrders>({
                        outputToken: this.receivedToken,
                        amounts: soldAmounts,
                        orders: this._ordersData,
                        toReserve: false,
                    }),
                ],
            ]) as HexString,
        };
    }

    async execute(): Promise<ContractReceipt> {
        // actual transaction
        const callData = this.buildCallData();
        const tx = await this.parent.signer.sendTransaction(callData);
        const receipt = await tx.wait();
        return receipt;
    }
}
