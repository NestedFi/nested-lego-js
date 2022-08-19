import { BigNumberish } from '@ethersproject/bignumber';
import { ContractReceipt } from '@ethersproject/contracts';
import { HasOrdersImpl } from './has-horders';
import { CallData, HexString, SingleToMultiSwapper, TokenOrder, INestedContracts, ExecOptions } from './public-types';
import { TokenOrderImpl } from './token-order';
import { as, BatchedInputOrders, safeMult, wrap } from './utils';

export class SingleToMultiSwapperImpl extends HasOrdersImpl implements SingleToMultiSwapper {
    constructor(parent: INestedContracts, private nftId: BigNumberish, readonly spentToken: HexString) {
        super(parent);
        this.spentToken = wrap(this.parent.chain, this.spentToken);
    }

    swapTo(token: HexString, slippage: number): TokenOrder {
        token = wrap(this.parent.chain, token);
        if (token === this.spentToken) {
            throw new Error('You cannot swap a token to itself');
        }
        const ret = new TokenOrderImpl(this, this.spentToken, token, slippage, 'input', 'entry');
        this._orders.push(ret);
        return ret;
    }

    buildCallData(): CallData {
        const total = this.totalBudget;
        if (total.isNegative() || total.isZero()) {
            throw new Error('No valid order in operation');
        }
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('processInputOrders', [
                this.nftId,
                [
                    as<BatchedInputOrders>({
                        inputToken: this.spentToken,
                        amount: total,
                        orders: this._ordersData,
                        fromReserve: true,
                    }),
                ],
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
