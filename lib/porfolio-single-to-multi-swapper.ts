import { BigNumberish } from '@ethersproject/bignumber';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { INestedContracts } from '.';
import { HasOrdersImpl } from './has-horders';
import { CallData, HexString, SingleToMultiSwapper, TokenOrder } from './public-types';
import { TokenOrderImpl } from './token-order';
import { normalize, wrap } from './utils';

export class SingleToMultiSwapperImpl extends HasOrdersImpl implements SingleToMultiSwapper {
    constructor(parent: INestedContracts, private nftId: BigNumberish, readonly spentToken: HexString) {
        super(parent);
    }

    async swapTo(token: HexString, forBudgetAmount: BigNumberish, slippage: number): Promise<TokenOrder> {
        token = wrap(this.parent.chain, token);
        if (token === this.spentToken) {
            throw new Error('You cannot swap a token to itself');
        }
        const ret = new TokenOrderImpl(this, this.spentToken, token, slippage, true);
        await ret.changeBudgetAmount(forBudgetAmount);
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
            data: this.parent.tools.factoryInterface.encodeFunctionData('swapTokenForTokens', [
                this.nftId,
                this.spentToken,
                total,
                this._ordersData,
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
