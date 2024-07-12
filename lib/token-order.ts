import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { HexString, TokenOrderFees, ZERO_ADDRESS } from './public-types';
import { ActionType, _HasOrder, _TokenOrder, _TokenOrderData } from './internal-types';
import { addFees, buildOrderStruct, normalize, removeFees, safeMult, wrap } from './utils';
import { DexAggregator } from './dex-aggregator-types';

type QChangeResult = 'changed' | 'unchanged' | 'race';

export class TokenOrderImpl implements _TokenOrder {
    private qtySetter: PromiseLike<QChangeResult> | null = null;
    _pendingQuotation: PromiseLike<boolean> | null = null;
    private debouncer?: { timeout: any; resolver: (value: boolean) => void };
    fixedAmount: 'output' | 'input' = 'input';
    inputQty: BigNumber = BigNumber.from(0);
    outputQty = BigNumber.from(0);
    _contractOrder: _TokenOrderData | null = null;
    price!: number;
    guaranteedPrice!: number;
    fees!: TokenOrderFees;
    estimatedPriceImpact: number = 0;
    operator: DexAggregator | null = null;
    private feesRate!: BigNumber;

    constructor(
        private parent: _HasOrder,
        readonly inputToken: HexString,
        readonly outputToken: HexString,
        public slippage: number,
        readonly feesOn: 'input' | 'output',
        readonly actionType: ActionType,
        readonly flatOnError = false,
    ) {
        this.inputToken = normalize(this.inputToken);
        this.outputToken = normalize(this.outputToken);
        this.setFees(BigNumber.from(0));
    }

    private setFees(amount: BigNumber) {
        this.fees = {
            amount,
            onToken: this.feesOn === 'input' ? this.inputToken : this.outputToken,
            on: this.feesOn,
        };
    }

    private reset() {
        this.inputQty = BigNumber.from(0);
        this.outputQty = BigNumber.from(0);
        this.price = 0;
        this.guaranteedPrice = 0;
        this._contractOrder = null!;
        this._pendingQuotation = null;
        this.setFees(BigNumber.from(0));
    }

    private isZero(budget: BigNumberish) {
        if (!budget || typeof budget === 'number') {
            return !budget;
        }
        if (typeof budget === 'string' && budget.includes('.')) {
            return !parseFloat(budget);
        }
        return BigNumber.from(budget).isZero();
    }

    async setInputAmount(forBudgetAmount: BigNumberish): Promise<boolean> {
        if (this.isZero(forBudgetAmount)) {
            this.reset();
            return true;
        }

        switch (await this._changeSpentQty(forBudgetAmount)) {
            case 'race':
                return Promise.resolve(false);
            case 'unchanged':
                return this._pendingQuotation ?? Promise.resolve(true);
            case 'changed':
                return await this.refresh();
        }
    }

    async setOutputAmount(boughtAmount: BigNumberish): Promise<boolean> {
        if (this.isZero(boughtAmount)) {
            this.reset();
            return true;
        }

        switch (await this._changeBoughtQty(boughtAmount)) {
            case 'race':
                return Promise.resolve(false);
            case 'unchanged':
                return Promise.resolve(true);
            case 'changed':
                return await this.refresh();
        }
    }

    private _changeSpentQty(forBudgetAmount: BigNumberish): PromiseLike<QChangeResult> {
        const tokenFetch: PromiseLike<QChangeResult> = this.parent.tools
            .toTokenAmount(this.inputToken, forBudgetAmount)
            .then<QChangeResult>(amt => {
                if (this.qtySetter !== tokenFetch) {
                    // concurrency issue: a newer quote is being requested
                    return 'race';
                }
                this.qtySetter = null;
                if (this.inputQty.eq(amt) && this.fixedAmount === 'input') {
                    // budget has not changed
                    return 'unchanged';
                }
                this.inputQty = amt;
                this.outputQty = BigNumber.from(0);
                this.setFees(BigNumber.from(0));
                this.fixedAmount = 'input';
                return 'changed';
            });
        return (this.qtySetter = tokenFetch);
    }

    private _changeBoughtQty(forOutputAmt: BigNumberish): PromiseLike<QChangeResult> {
        const tokenFetch: PromiseLike<QChangeResult> = this.parent.tools
            .toTokenAmount(this.inputToken, forOutputAmt)
            .then<QChangeResult>(amt => {
                if (this.qtySetter !== tokenFetch) {
                    // concurrency issue: a newer quote is being requested
                    return 'race';
                }
                this.qtySetter = null;
                if (this.outputQty.eq(amt) && this.fixedAmount === 'output') {
                    // budget has not changed
                    return 'unchanged';
                }
                this.outputQty = amt;
                this.inputQty = BigNumber.from(0);
                this.setFees(BigNumber.from(0));
                this.fixedAmount = 'output';
                return 'changed';
            });
        return (this.qtySetter = tokenFetch);
    }

    private async _getFeesRate(): Promise<BigNumber> {
        const feesRates = await this.parent.tools.feesRates();
        return this.actionType === 'entry' ? feesRates.entryExact : feesRates.exitExact;
    }

    async changeSlippage(slippage: number): Promise<boolean> {
        if (this.slippage === slippage) {
            return Promise.resolve(true);
        }
        this.slippage = slippage;
        // wait for a parallel quantity setting before starting a slippage refresh
        await this.qtySetter;
        // refresh quote
        return await this.refresh();
    }

    async refresh(): Promise<boolean> {
        if (this.fixedQty.isZero()) {
            this.reset();
            return true;
        }

        this.feesRate = await this._getFeesRate();

        if (wrap(this.chain, this.outputToken) === wrap(this.chain, this.inputToken)) {
            // when the input is the same as the output, use the flat operator
            this._prepareFlat();
            return true;
        } else {
            // else, use dex aggregator to perform a swap
            return await this._prepareAggregatorSwap();
        }
    }

    remove(): void {
        this.parent._removeOrder(this);
    }

    get chain() {
        return this.parent.tools.chain;
    }

    private get feesToken() {
        return wrap(this.chain, this.feesOn === 'input' ? this.outputToken : this.inputToken);
    }

    private get fixedQty() {
        return this.fixedAmount === 'input' ? this.inputQty : this.outputQty;
    }

    private _prepareFlat() {
        let transfer: BigNumber;
        if (this.fixedAmount === 'input') {
            transfer = this.feesOn === 'input' ? removeFees(this.inputQty, this.feesRate) : this.inputQty;
            this.outputQty = this.inputQty;
        } else {
            transfer = this.feesOn === 'output' ? removeFees(this.outputQty, this.feesRate) : this.outputQty;
            this.inputQty = this.outputQty;
        }
        this.setFees(this.inputQty.sub(removeFees(this.inputQty, this.feesRate)));
        this._pendingQuotation = null;
        clearTimeout(this.debouncer?.timeout);
        this.debouncer = undefined;
        this._contractOrder = {
            inputQty: this.inputQty,
            order: buildOrderStruct(
                // specify that we're using the flat operator
                'Flat',
                // specify output token for fees computation
                this.feesToken,
                // see Flat operator implementation:
                [
                    ['address', wrap(this.chain, this.inputToken)],
                    ['uint256', transfer],
                ],
            ),
        };

        this.price = 1;
        this.guaranteedPrice = 1;
    }

    private async _prepareAggregatorSwap(): Promise<boolean> {
        // debounce 30ms to avoid too many calls to the 0x API
        if (this.debouncer) {
            clearTimeout(this.debouncer.timeout);
            this.debouncer.resolver(false);
            this.debouncer = undefined;
        }
        const op = (this._pendingQuotation = new Promise<boolean>((resolve, reject) => {
            this.debouncer = {
                resolver: resolve,
                timeout: setTimeout(async () => {
                    try {
                        // build the swap order
                        const spendQty =
                            this.feesOn === 'input' ? removeFees(this.inputQty, this.feesRate) : this.inputQty;
                        const aggregatorQuote = await this.parent.tools.fetchLowestQuote({
                            userAddress: this.parent.tools.userAddress,
                            chain: this.chain,
                            slippage: this.slippage,
                            spendToken: wrap(this.chain, this.inputToken),
                            buyToken: wrap(this.chain, this.outputToken),
                            ...(this.fixedAmount === 'input'
                                ? {
                                      // remove fee from the input amount if necessary
                                      //  (we dont want to swap fees)
                                      spendQty,
                                  }
                                : {
                                      boughtQty: this.outputQty,
                                  }),
                        });

                        if (op !== this._pendingQuotation) {
                            // concurrency issue: a newer quote is being requested
                            return resolve(false);
                        }
                        // 👈 do not await after this line

                        // === update the target amount
                        if (this.fixedAmount === 'input') {
                            this.outputQty = BigNumber.from(aggregatorQuote.buyAmount);
                        } else {
                            // this is how much we are expecting to sell
                            let input = BigNumber.from(aggregatorQuote.sellAmount);
                            // just add slippage to input amount
                            // this is necessary to avoid reverts in the swap if the slippage is too high
                            // ... but the extra funds will be sent back to the user.
                            input = safeMult(input, 1 / (1 - this.slippage));

                            // add fees on input if necessary
                            this.inputQty = this.feesOn === 'input' ? addFees(input, this.feesRate) : input;
                        }

                        // === compute fees that will be taken on this order
                        if (this.feesOn === 'input') {
                            this.setFees(this.inputQty.sub(removeFees(this.inputQty, this.feesRate)));
                        } else {
                            this.setFees(this.outputQty.sub(removeFees(this.outputQty, this.feesRate)));
                        }

                        this._pendingQuotation = null;
                        this.price = parseFloat(aggregatorQuote.price);
                        this.guaranteedPrice = parseFloat(aggregatorQuote.guaranteedPrice);
                        this._contractOrder = {
                            inputQty: this.inputQty,
                            order: buildOrderStruct(
                                // specify what operator we are using (0x or ParaSwap)
                                aggregatorQuote.aggregator,
                                // specify output token
                                this.feesToken,
                                // see ZeroEx operator implementation:
                                [
                                    ['address', wrap(this.chain, this.inputToken)],
                                    ['address', wrap(this.chain, this.outputToken)],
                                    ['bytes', aggregatorQuote.data],
                                ],
                            ),
                        };
                        this.estimatedPriceImpact = parseFloat(aggregatorQuote.estimatedPriceImpact);
                        this.operator = aggregatorQuote.aggregator;
                        resolve(true);
                    } catch (e) {
                        if (this.flatOnError) {
                            this._prepareFlat();
                            resolve(true);
                        } else {
                            reject(e);
                        }
                    }
                }, 30),
            };
        }));
        return op;
    }

    public getOrderOperator(): string | undefined {
        return this._contractOrder?.order.operator;
    }
}
