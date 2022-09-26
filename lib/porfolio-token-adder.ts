import { BigNumber, BigNumberish, Contract, ContractTransaction, ethers } from 'ethers';
import { HasOrdersImpl } from './has-horders';
import { _HasOrder, _TokenOrder } from './internal-types';
import {
    CallData,
    CanAddTokensOperation,
    ExecOptions,
    HexString,
    INestedContracts,
    NATIVE_TOKEN,
    PortfolioTokenAdder,
    TokenOrder,
} from './public-types';
import { TokenOrderImpl } from './token-order';
import { as, BatchedInputOrders, lazySync, normalize, safeMult } from './utils';

export abstract class PortfolioTokenAdderBase extends HasOrdersImpl implements CanAddTokensOperation, _HasOrder {
    constructor(readonly parent: INestedContracts, readonly spentToken: HexString) {
        super(parent);
    }

    async isApproved(): Promise<boolean> {
        if (this.spentToken === NATIVE_TOKEN) {
            return true;
        }
        const user = (await this.parent.signer.getAddress()) as HexString;
        const allowance = await this.tools.factoryAllowance(user, this.spentToken);
        const budget = await this.waitTotalBudget();
        return allowance.gte(BigNumber.from(budget));
    }

    async approve(amount?: BigNumberish): Promise<void> {
        if (this.spentToken === NATIVE_TOKEN) {
            return;
        }
        const tx: ContractTransaction = await this.tools.approve(this.spentToken, amount);
        await tx.wait();
    }

    addToken(token: HexString, slippage: number): TokenOrder {
        token = normalize(token);
        if (this._orders.some(x => x.outputToken === token)) {
            throw new Error(`An order already exists in this operation for token ${token}`);
        }
        const ret = new TokenOrderImpl(this, this.spentToken, token, slippage, 'input', 'entry');
        this._orders.push(ret);
        return ret;
    }
}

export class PortfolioTokenAdderImpl extends PortfolioTokenAdderBase implements PortfolioTokenAdder {
    nftId!: BigNumber;

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
                        fromReserve: false,
                    }),
                ],
            ]) as HexString,
            // compute how much native token we need as input:
            value: this.spentToken === NATIVE_TOKEN ? total : BigNumber.from(0),
        };
    }

    async execute(options?: ExecOptions): Promise<ethers.ContractReceipt> {
        // actual transaction
        const callData = this.buildCallData();
        await this.parent.tools.prepareCalldata(callData, options);
        const tx = await this.parent.signer.sendTransaction(callData);
        const receipt = await tx.wait();
        return receipt;
    }
}
