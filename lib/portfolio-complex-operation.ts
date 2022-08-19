import { BigNumber } from '@ethersproject/bignumber';
import { ContractReceipt } from '@ethersproject/contracts';
import { ensureSettledOrders, HasOrdersImpl } from './has-horders';
import { _TokenOrder } from './internal-types';
import {
    CallData,
    ExecOptions,
    HexString,
    INestedContracts,
    NATIVE_TOKEN,
    PortfolioComplexOperation,
    TokenOrder,
} from './public-types';
import { TokenOrderImpl } from './token-order';
import { as, BatchedInputOrders, BatchedOutputOrders, groupBy, normalize, safeMult, sumBn, wrap } from './utils';

export class PortfolioComplexOperationImpl implements PortfolioComplexOperation {
    readonly deposits: _TokenOrder[] = [];
    private _deposits: HasOrdersImpl;
    readonly withdrawals: _TokenOrder[] = [];
    private _withdrawals: HasOrdersImpl;
    readonly swaps: _TokenOrder[] = [];
    private _swapsImpl: HasOrdersImpl;

    constructor(readonly parent: INestedContracts, private nftId: BigNumber) {
        this._deposits = new HasOrdersImpl(parent, this.deposits);
        this._withdrawals = new HasOrdersImpl(parent, this.withdrawals);
        this._swapsImpl = new HasOrdersImpl(parent, this.swaps);
    }

    async tokensToApprove(): Promise<{ token: HexString; amount: BigNumber }[]> {
        // compute how much we're spending of each token
        const byInput = this.deposits
            .filter(x => x.inputToken !== NATIVE_TOKEN && x.inputQty.gt(0))
            .reduce<{ [key: HexString]: BigNumber }>(
                (tot, o) => ({
                    ...tot,
                    [o.inputToken]: (tot[o.inputToken] ?? BigNumber.from(0)).add(o.inputQty),
                }),
                {},
            );

        // get allowances, and filter those which are not enough
        const user = (await this.parent.signer.getAddress()) as HexString;
        const okays = await Promise.all(
            Object.entries(byInput).map(async ([token, amount]) => {
                this.parent.tools.balanceOf;
                const allowance = await this.parent.tools.factoryAllowance(user, token as HexString);
                return { ok: allowance.gte(amount), token: token as HexString, amount };
            }),
        );
        return okays
            .filter(o => o.ok)
            .map(o => ({
                token: o.token,
                amount: o.amount,
            }));
    }

    async approveAll(exactAmounts?: boolean): Promise<void> {
        const toApprove = await this.tokensToApprove();
        for (const { token, amount } of toApprove) {
            await this.parent.tools.approve(token, exactAmounts ? amount : undefined);
        }
    }

    addFromWallet(tokenToAdd: HexString): TokenOrder;
    addFromWallet(tokenToAdd: HexString, payWithToken: HexString, slippage: number): TokenOrder;
    addFromWallet(tokenToAdd: HexString, payWithToken?: HexString, slippage?: number): TokenOrder {
        // does the same job as a porfolio token adder
        tokenToAdd = normalize(tokenToAdd);
        payWithToken = normalize(payWithToken ?? tokenToAdd);
        if (this.deposits.some(x => x.outputToken === tokenToAdd && x.inputToken === payWithToken)) {
            throw new Error(`An input order already exists in this operation: ${tokenToAdd} -> ${payWithToken}`);
        }
        const ret = new TokenOrderImpl(this._deposits, payWithToken, tokenToAdd, slippage ?? 0, 'input', 'entry');
        this.deposits.push(ret);
        return ret;
    }

    withdrawToWallet(tokenToWithdraw: HexString): TokenOrder;
    withdrawToWallet(tokenToWithdraw: HexString, receiveInToken: HexString, slippage: number): TokenOrder;
    withdrawToWallet(tokenToWithdraw: HexString, receiveInToken?: HexString, slippage?: number): TokenOrder {
        // does the same job as a porfolio token seller
        tokenToWithdraw = normalize(tokenToWithdraw);
        receiveInToken = normalize(receiveInToken ?? tokenToWithdraw);
        if (this.withdrawals.some(x => x.outputToken === receiveInToken && x.inputToken === tokenToWithdraw)) {
            throw new Error(
                `An output order already exists in this operation: ${tokenToWithdraw} -> ${receiveInToken}`,
            );
        }
        const ret = new TokenOrderImpl(
            this._withdrawals,
            tokenToWithdraw,
            receiveInToken,
            slippage ?? 0,
            'output',
            'exit',
        );
        this.withdrawals.push(ret);
        return ret;
    }

    swapInPortfolio(tokenToSell: HexString, tokenToBuy: HexString, slippage: number): TokenOrder {
        // We have a choice here: execute intra-porfolio swaps as input orders, or as output orders
        // Both works. The only difference will be if we'll take fees on input or on output token.
        // Lets assume that input amount will be fixed most of the time,
        //  so it will be simpler take fees on input token (thus, fees will be known in advance)
        //  => then, lets use input orders by default (same job as single-to-multi swapper)
        tokenToSell = wrap(this.parent.chain, tokenToSell);
        tokenToBuy = wrap(this.parent.chain, tokenToBuy);
        if (tokenToSell === tokenToBuy) {
            throw new Error('You cannot swap a token to itself');
        }
        const ret = new TokenOrderImpl(this._swapsImpl, tokenToSell, tokenToBuy, slippage, 'input', 'entry');
        this.swaps.push(ret);
        return ret;
    }

    buildCallData(): CallData {
        const deposits = [...groupBy(this.deposits, x => x.inputToken).entries()]
            .map(([token, orders]) => [token, ensureSettledOrders(orders)] as const)
            .map(([token, orders]) =>
                as<BatchedInputOrders>({
                    inputToken: token,
                    amount: sumBn(orders.map(x => x.inputQty)),
                    orders: orders.map(x => x.order),
                    fromReserve: false,
                }),
            );
        const swaps = [...groupBy(this.swaps, x => x.inputToken).entries()]
            .map(([token, orders]) => [token, ensureSettledOrders(orders)] as const)
            .map(([token, orders]) =>
                as<BatchedInputOrders>({
                    inputToken: token,
                    amount: sumBn(orders.map(x => x.inputQty)),
                    orders: orders.map(x => x.order),
                    fromReserve: true,
                }),
            );
        const withdrawals = [...groupBy(this.withdrawals, x => x.outputToken).entries()]
            .map(([token, orders]) => [token, ensureSettledOrders(orders)] as const)
            .map(([token, orders]) =>
                as<BatchedOutputOrders>({
                    outputToken: wrap(this.parent.chain, token),
                    amounts: orders.map(x => x.inputQty),
                    orders: orders.map(x => x.order),
                    toReserve: false,
                }),
            );

        if (!deposits.length && !swaps.length && !withdrawals.length) {
            throw new Error('Nothing to execute !');
        }

        const value = sumBn(this.deposits.filter(x => x.inputToken === NATIVE_TOKEN).map(x => x.inputQty));

        if (!withdrawals.length) {
            // if there are no withdrawals, then use the processInputOrders() method instead
            return {
                to: this.parent.tools.factoryContract.address as HexString,
                data: this.parent.tools.factoryInterface.encodeFunctionData('processInputOrders', [
                    this.nftId,
                    [...deposits, ...swaps],
                ]) as HexString,
                value,
            };
        }

        if (!deposits.length) {
            // if there are no inputs, then use the processOutputOrders() method instead
            return {
                to: this.parent.tools.factoryContract.address as HexString,
                data: this.parent.tools.factoryInterface.encodeFunctionData('processOutputOrders', [
                    this.nftId,
                    [...withdrawals],
                ]) as HexString,
                value,
            };
        }
        console.log('value', value.toString());

        // there are both inputs & withdrawals
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('processInputAndOutputOrders', [
                this.nftId,
                [...deposits, ...swaps],
                [...withdrawals],
            ]) as HexString,
            value,
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
