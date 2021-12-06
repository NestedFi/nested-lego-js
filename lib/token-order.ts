import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { HexString } from '.';
import { _HasOrder, _TokenOrder } from './internal-types';
import { buildOrderStruct, NestedOrder, normalize, removeFees, wrap } from './utils';
type QChangeResult = 'changed' | 'unchanged' | 'race';
export class TokenOrderImpl implements _TokenOrder {
    private pendingQtySet: PromiseLike<QChangeResult> | null = null;
    private pendingQuotation: PromiseLike<boolean> | null = null;
    private debouncer?: { timeout: any; resolver: (value: boolean) => void };
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

    private reset() {
        this.spendQty = BigNumber.from(0);
        this.estimatedBoughtQty = BigNumber.from(0);
        this.price = 0;
        this.guaranteedPrice = 0;
        this._contractOrder = null!;
        this.pendingQuotation = null;
    }

    async changeBudgetAmount(forBudgetAmount: BigNumberish): Promise<boolean> {
        if (BigNumber.from(forBudgetAmount).isZero()) {
            this.reset();
            return true;
        }

        switch (await this.changeSpentQty(forBudgetAmount)) {
            case 'race':
                return Promise.resolve(false);
            case 'unchanged':
                return Promise.resolve(true);
            case 'changed':
                return await this.refresh();
        }
    }

    private changeSpentQty(forBudgetAmount: BigNumberish): PromiseLike<QChangeResult> {
        const tokenFetch: PromiseLike<QChangeResult> = this.parent.tools
            .toTokenAmount(this.spendToken, forBudgetAmount)
            .then<QChangeResult>(amt => {
                if (this.pendingQtySet !== tokenFetch) {
                    // concurrency issue: a newer quote is being requested
                    return 'race';
                }
                this.pendingQtySet = null;
                if (this.spendQty.eq(amt)) {
                    // budget has not changed
                    return 'unchanged';
                }
                this.spendQty = amt;
                return 'changed';
            });
        return (this.pendingQtySet = tokenFetch);
    }

    async changeSlippage(slippage: number): Promise<boolean> {
        if (this.slippage === slippage) {
            return Promise.resolve(true);
        }
        this.slippage = slippage;
        // wait for a parallel quantity setting before starting a slippage refresh
        await this.pendingQtySet;
        // refresh quote
        return await this.refresh();
    }

    refresh(): PromiseLike<boolean> {
        if (this.spendQtyWithoutFees.isZero()) {
            this.reset();
            return Promise.resolve(true);
        }
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
        this.pendingQuotation = null;
        clearTimeout(this.debouncer?.timeout);
        this.debouncer = undefined;
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
        const op = (this.pendingQuotation = new Promise<boolean>((resolve, reject) => {
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

                        if (op !== this.pendingQuotation) {
                            // concurrency issue: a newer quote is being requested
                            return resolve(false);
                        }
                        // 👈 do not await after this line

                        this.estimatedBoughtQty = BigNumber.from(zxQuote.buyAmount);
                        this.pendingQuotation = null;
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
