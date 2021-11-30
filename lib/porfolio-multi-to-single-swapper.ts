import { BigNumberish } from '@ethersproject/bignumber';
import { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { INestedContracts, MultiToSingleSwapper } from '.';
import { HasOrdersImpl } from './has-horders';
import { CallData, HexString, SingleToMultiSwapper, TokenOrder } from './public-types';
import { TokenOrderImpl } from './token-order';
import { normalize, wrap } from './utils';

export class MultiToSingleSwapperImpl extends HasOrdersImpl implements MultiToSingleSwapper {
    constructor(parent: INestedContracts, private nftId: BigNumberish, readonly toToken: HexString) {
        super(parent);
    }

    async swapFrom(sellToken: HexString, sellTokenAmount: BigNumberish, slippage: number): Promise<TokenOrder> {
        sellToken = wrap(this.parent.chain, sellToken);
        if (sellToken === this.toToken) {
            throw new Error('You cannot swap a token to itself');
        }
        const ret = new TokenOrderImpl(this, sellToken, this.toToken, slippage, false);
        await ret.changeBudgetAmount(sellTokenAmount);
        this._orders.push(ret);
        return ret;
    }

    buildCallData(): CallData {
        const soldAmounts = this._orders.map(x => x.spendQty);
        if (!soldAmounts.length) {
            throw new Error('Nothing to swap');
        }
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('sellTokensToNft', [
                this.nftId,
                this.toToken,
                soldAmounts,
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
