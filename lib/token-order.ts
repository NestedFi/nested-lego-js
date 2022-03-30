import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { HexString, TokenOrderFees } from './public-types';
import { _HasOrder, _TokenOrder } from './internal-types';
import { addFees, buildOrderStruct, NestedOrder, normalize, removeFees, safeMult, wrap } from './utils';

type QChangeResult = 'changed' | 'unchanged' | 'race';

export class TokenOrderImpl implements _TokenOrder {
    private qtySetter: PromiseLike<QChangeResult> | null = null;
    private pendingQuotation: PromiseLike<boolean> | null = null;
    private debouncer?: { timeout: any; resolver: (value: boolean) => void };
    fixedAmount: 'output' | 'input' = 'input';
    inputQty: BigNumber = BigNumber.from(0);
    outputQty = BigNumber.from(0);
    _contractOrder: NestedOrder | null = null;
    price!: number;
    guaranteedPrice!: number;
    fees!: TokenOrderFees;

    constructor(
        private parent: _HasOrder,
        readonly inputToken: HexString,
        readonly outputToken: HexString,
        public slippage: number,
        readonly feesOn: 'input' | 'output',
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
        this.pendingQuotation = null;
        this.setFees(BigNumber.from(0));
    }

    async setInputAmount(forBudgetAmount: BigNumberish): Promise<boolean> {
        if (BigNumber.from(forBudgetAmount).isZero()) {
            this.reset();
            return true;
        }

        switch (await this._changeSpentQty(forBudgetAmount)) {
            case 'race':
                return Promise.resolve(false);
            case 'unchanged':
                return Promise.resolve(true);
            case 'changed':
                return await this.refresh();
        }
    }

    async setOutputAmount(boughtAmount: BigNumberish): Promise<boolean> {
        if (BigNumber.from(boughtAmount).isZero()) {
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

    refresh(): PromiseLike<boolean> {
        if (this.fixedQty.isZero()) {
            this.reset();
            return Promise.resolve(true);
        }
        if (wrap(this.chain, this.outputToken) === wrap(this.chain, this.inputToken)) {
            // when the input is the same as the output, use the flat operator
            this._prepareFlat();
            return Promise.resolve(true);
        } else {
            // else, use 0x to perform a swap
            return this._prepare0xSwap();
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
            transfer = this.feesOn === 'input' ? removeFees(this.inputQty) : this.inputQty;
            this.outputQty = this.inputQty;
        } else {
            transfer = this.feesOn === 'output' ? removeFees(this.outputQty) : this.outputQty;
            this.inputQty = this.outputQty;
        }
        this.setFees(this.inputQty.sub(removeFees(this.inputQty)));
        this.pendingQuotation = null;
        clearTimeout(this.debouncer?.timeout);
        this.debouncer = undefined;
        this._contractOrder = buildOrderStruct(
            // specify that we're using the flat operator
            'Flat',
            // specify output token for fees computation
            this.feesToken,
            // see Flat operator implementation:
            [
                ['address', wrap(this.chain, this.inputToken)],
                ['uint256', transfer],
            ],
        );

        this.price = 1;
        this.guaranteedPrice = 1;
    }

    private _prepare0xSwap(): Promise<boolean> {
        // debounce 30ms to avoid too many calls to the 0x API
        if (this.debouncer) {
            clearTimeout(this.debouncer.timeout);
            this.debouncer.resolver(false);
            this.debouncer = undefined;
        }
        const op = (this.pendingQuotation = new Promise<boolean>((resolve, reject) => {
            this.debouncer = {
                resolver: resolve,
                timeout: setTimeout(async () => {
                    try {
                        // build the 0x swap order
                        const zxQuote = await this.parent.tools.fetch0xSwap({
                            chain: this.chain,
                            slippage: this.slippage,
                            spendToken: wrap(this.chain, this.inputToken),
                            buyToken: wrap(this.chain, this.outputToken),
                            ...(this.fixedAmount === 'input'
                                ? {
                                      // remove fee from the input amount if necessary
                                      //  (we dont want to swap fees)
                                      spendQty: this.feesOn === 'input' ? removeFees(this.inputQty) : this.inputQty,
                                  }
                                : {
                                      boughtQty: this.outputQty,
                                  }),
                        });

                        if (op !== this.pendingQuotation) {
                            // concurrency issue: a newer quote is being requested
                            return resolve(false);
                        }
                        // 👈 do not await after this line

                        // === update the target amount
                        if (this.fixedAmount === 'input') {
                            this.outputQty = BigNumber.from(zxQuote.buyAmount);
                        } else {
                            // this is how much we are expecting to sell
                            let input = BigNumber.from(zxQuote.sellAmount);
                            // just add slippage to input amount
                            // this is necessary to avoid reverts in the 0x swap if the slippage is too high
                            // ... but the extra funds will be sent back to the user.
                            input = safeMult(input, 1 / (1 - this.slippage));

                            // add fees on input if necessary
                            this.inputQty = this.feesOn === 'input' ? addFees(input) : input;
                        }

                        // === compute fees that will be taken on this order
                        if (this.feesOn === 'input') {
                            this.setFees(this.inputQty.sub(removeFees(this.inputQty)));
                        } else {
                            this.setFees(this.outputQty.sub(removeFees(this.outputQty)));
                        }

                        this.pendingQuotation = null;
                        this.price = parseFloat(zxQuote.price);
                        this.guaranteedPrice = parseFloat(zxQuote.guaranteedPrice);
                        this._contractOrder = buildOrderStruct(
                            // specify that we're using the 0x operator
                            'ZeroEx',
                            // specify output token
                            this.feesToken,
                            // see ZeroEx operator implementation:
                            [
                                ['address', wrap(this.chain, this.inputToken)],
                                ['address', wrap(this.chain, this.outputToken)],
                                ['bytes', zxQuote.data],
                            ],
                        );
                        resolve(true);
                    } catch (e) {
                        reject(e);
                    }
                }, 30),
            };
        }));
        return op;
    }
}
