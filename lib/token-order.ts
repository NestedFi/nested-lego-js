import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { HexString } from '.';
import { _HasOrder, _TokenOrder } from './internal-types';
import { buildOrderStruct, NestedOrder, normalize, removeFees, wrap } from './utils';

export class TokenOrderImpl implements _TokenOrder {
    spendQty: BigNumber = BigNumber.from(0);
    _contractOrder!: NestedOrder;

    /** Price given by the AMM */
    price!: number;
    /** Guaranteed price given the AMM */
    guaranteedPrice!: number;

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

    async changeBudgetAmount(forBudgetAmount: BigNumberish): Promise<void> {
        this.spendQty = await this.parent.tools.toTokenAmount(this.spendToken, forBudgetAmount);
        await this.refresh();
    }

    async changeSlippage(slippage: number): Promise<void> {
        this.slippage = slippage;
        await this.refresh();
    }

    refresh(): Promise<void> {
        if (this.buyToken === this.spendToken) {
            // when the input is the same as the output, use the flat operator
            return this._prepareFlat();
        } else {
            // else, use 0x to perform a swpa
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

    private async _prepareFlat(): Promise<void> {
        this._contractOrder = buildOrderStruct(
            // specify that we're using the flat operator
            'Flat',
            // specify output token for fees computation
            wrap(this.chain, this.buyToken),
            // see Flat operator implementation:
            [
                ['address', wrap(this.chain, this.spendToken)],
                ['uint256', this.spendQtyWithoutFees],
            ],
        );

        this.price = 1;
        this.guaranteedPrice = 1;
    }

    private async _prepare0xSwap(): Promise<void> {
        // build the 0x swap order
        const zxQuote = await this.parent.tools.fetch0xSwap({
            chain: this.chain,
            slippage: this.slippage,
            spendToken: wrap(this.chain, this.spendToken),
            buyToken: wrap(this.chain, this.buyToken),
            // remove fee from the input amount
            spendQty: this.spendQtyWithoutFees,
        });

        this.price = parseFloat(zxQuote.price);
        this.guaranteedPrice = parseFloat(zxQuote.guaranteedPrice);
        this._contractOrder = buildOrderStruct(
            // specify that we're using the 0x operator
            'ZeroEx',
            // specify output token
            wrap(this.chain, this.buyToken),
            // see ZeroEx operator implementation:
            [
                ['address', wrap(this.chain, this.spendToken)],
                ['address', wrap(this.chain, this.buyToken)],
                ['bytes', zxQuote.data],
            ],
        );
    }
}
