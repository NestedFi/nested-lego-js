import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { HexString } from '.';
import { _HasOrder, _TokenOrder } from './internal-types';
import { buildOrderStruct, NestedOrder, normalize, removeFees, wrap } from './utils';

export class TokenOrderImpl implements _TokenOrder {
    private pendingOp: PromiseLike<boolean> | null = null;
    private debouncer?: { timeout: any; resolver: (result: boolean) => void };
    spendQty: BigNumber = BigNumber.from(0);
    _contractOrder: NestedOrder | null = null;

    /** Price given by the AMM */
    price!: number;
    /** Guaranteed price given the AMM */
    guaranteedPrice!: number;
    /** Estimated received quantity */
    estimatedBoughtQty!: BigNumber;

    constructor(
        private parent: _HasOrder,
        readonly spendToken: HexString,
        readonly buyToken: HexString,
        public slippage: number,
        private readonly inputHasFees: boolean,
    ) {
        this.spendToken = normalize(this.spendToken);
        this.buyToken = normalize(this.buyToken);
    }

    changeBudgetAmount(forBudgetAmount: BigNumberish): PromiseLike<boolean> {
        if (BigNumber.from(forBudgetAmount).isZero()) {
            this.spendQty = BigNumber.from(0);
            this.estimatedBoughtQty = BigNumber.from(0);
            this.price = 0;
            this.guaranteedPrice = 0;
            this._contractOrder = null!;
            this.pendingOp = null;
            return Promise.resolve(true);
        }
        const tokenFetch: PromiseLike<boolean> = this.parent.tools
            .toTokenAmount(this.spendToken, forBudgetAmount)
            .then(amt => {
                if (this.pendingOp !== tokenFetch) {
                    // concurrency issue: a newer quote is being requested
                    return this.pendingOp ?? Promise.resolve(false);
                }
                if (this.spendQty.eq(amt)) {
                    // budget has not changed
                    return Promise.resolve(false);
                }
                this.spendQty = amt;

                // trigger a refresh
                return this.refresh();
            });
        return (this.pendingOp = tokenFetch);
    }

    changeSlippage(slippage: number): PromiseLike<boolean> {
        if (this.slippage === slippage) {
            return Promise.resolve(true);
        }
        this.slippage = slippage;
        return this.refresh();
    }

    refresh(): PromiseLike<boolean> {
        if (this.buyToken === this.spendToken) {
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

    private get spendQtyWithoutFees() {
        return this.inputHasFees ? removeFees(this.spendQty) : this.spendQty;
    }

    private get orderToken() {
        return wrap(this.chain, this.inputHasFees ? this.buyToken : this.spendToken);
    }

    private _prepareFlat() {
        this.pendingOp = null;
        this._contractOrder = buildOrderStruct(
            // specify that we're using the flat operator
            'Flat',
            // specify output token for fees computation
            this.orderToken,
            // see Flat operator implementation:
            [
                ['address', wrap(this.chain, this.spendToken)],
                ['uint256', this.spendQtyWithoutFees],
            ],
        );

        this.price = 1;
        this.guaranteedPrice = 1;
        this.estimatedBoughtQty = this.spendQtyWithoutFees;
    }

    private _prepare0xSwap(): Promise<boolean> {
        // debounce 30ms to avoid too many calls to the 0x API
        if (this.debouncer) {
            clearTimeout(this.debouncer.timeout);
            this.debouncer.resolver(false);
            this.debouncer = undefined;
        }
        const op = (this.pendingOp = new Promise<boolean>((resolve, reject) => {
            this.debouncer = {
                resolver: resolve,
                timeout: setTimeout(async () => {
                    try {
                        // build the 0x swap order
                        const zxQuote = await this.parent.tools.fetch0xSwap({
                            chain: this.chain,
                            slippage: this.slippage,
                            spendToken: wrap(this.chain, this.spendToken),
                            buyToken: wrap(this.chain, this.buyToken),
                            // remove fee from the input amount
                            spendQty: this.spendQtyWithoutFees,
                        });

                        if (op !== this.pendingOp) {
                            // concurrency issue: a newer quote is being requested
                            return Promise.resolve(false);
                        }
                        // 👈 do not await after this line

                        this.estimatedBoughtQty = BigNumber.from(zxQuote.buyAmount);
                        this.pendingOp = null;
                        this.price = parseFloat(zxQuote.price);
                        this.guaranteedPrice = parseFloat(zxQuote.guaranteedPrice);
                        this._contractOrder = buildOrderStruct(
                            // specify that we're using the 0x operator
                            'ZeroEx',
                            // specify output token
                            this.orderToken,
                            // see ZeroEx operator implementation:
                            [
                                ['address', wrap(this.chain, this.spendToken)],
                                ['address', wrap(this.chain, this.buyToken)],
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
