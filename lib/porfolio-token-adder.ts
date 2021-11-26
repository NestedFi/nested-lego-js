import { BigNumber, BigNumberish, Contract, ContractTransaction, ethers } from 'ethers';
import { ERC20_ABI } from './default-contracts';
import { _HasOrder, _TokenOrder } from './internal-types';
import {
    CanAddTokensOperation,
    HexString,
    INestedContracts,
    NATIVE_TOKEN,
    PorfolioTokenAdder,
    TokenOrder,
} from './public-types';
import { TokenOrderImpl } from './token-order';
import { lazySync, NestedOrder } from './utils';

export abstract class PorfolioTokenAdderBase implements CanAddTokensOperation, _HasOrder {
    protected _orders: _TokenOrder[] = [];
    _contractOrder!: NestedOrder;

    protected get _ordersData(): NestedOrder[] {
        return this._orders.map(x => x._contractOrder);
    }

    get orders(): readonly TokenOrder[] {
        return this._orders;
    }

    get totalBudget(): BigNumber {
        return this.orders.reduce((a, b) => a.add(BigNumber.from(b)), BigNumber.from(0));
    }

    private tokenContract = lazySync(() => new Contract(this.spentToken, ERC20_ABI, this.parent.signer));

    get tools() {
        return this.parent.tools;
    }

    constructor(protected parent: INestedContracts, readonly spentToken: HexString) {}

    _removeOrder(order: _TokenOrder) {
        const i = this._orders.indexOf(order);
        this._orders.splice(i, 1);
    }

    async isApproved(): Promise<boolean> {
        const user = await this.parent.signer.getAddress();
        const allowance = await this.tokenContract().allowance(user, this.tools.factoryContract.address);
        return allowance.gte(BigNumber.from(this.totalBudget));
    }

    async approve(amount?: BigNumberish): Promise<void> {
        const toApprove = amount ? await this.toBudget(amount) : ethers.constants.MaxUint256;
        await this.tokenContract().approve(this.tools.factoryContract.address, toApprove);
    }

    private toBudget(amt: BigNumberish) {
        return this.tools.toTokenAmount(this.spentToken, amt);
    }

    async addToken(token: HexString, forBudgetAmount: BigNumberish, slippage: number): Promise<TokenOrder> {
        const amt = new TokenOrderImpl(this, this.spentToken, token, slippage, true);
        await amt.changeBudgetAmount(forBudgetAmount);
        return amt;
    }
}

export class PorfolioTokenAdderImpl extends PorfolioTokenAdderBase implements PorfolioTokenAdder {
    nftId!: BigNumber;

    async execute(): Promise<ethers.ContractReceipt> {
        // actual transaction
        const total = this.totalBudget;
        const tx: ContractTransaction = await this.parent.tools.factoryContract.addTokens(
            this.nftId,
            this.spentToken,
            total,
            this._ordersData,
            {
                // compute how much native token we need as input:
                value: this.spentToken === NATIVE_TOKEN ? total : 0,
            },
        );
        const receipt = await tx.wait();
        return receipt;
    }
}
