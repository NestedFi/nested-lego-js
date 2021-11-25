import { Chain, CreatePortfolioMetadata, HexNumber, INestedContracts, NATIVE_TOKEN } from '.';
import { ChainAndId, CreatePortfolioResult, HexString, OrderCreationArg, Order } from './public-types';
import { fetchZxSwap } from './0x';
import { buildOrderStruct, hexToObject, objectToHex, removeFees, safeMult, wrap } from './utils';
import { BigNumber, constants, Contract, ContractReceipt, ContractTransaction, Signer, utils } from 'ethers';
import { FIXED_FEE } from './default-contracts';

interface InternalSwapOrder extends Order {
    _internal: string;
}

export class NestedContractsInstance implements INestedContracts {
    constructor(
        readonly chain: Chain,
        private factory: Contract,
        private nestedFactoryInterface: utils.Interface,
        private _signer: Signer | undefined,
    ) {}

    private tokenContract(token: HexString): Contract {
        const abi = [
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function allowance(address owner, address spender) external view returns (uint256)',
            'function balanceOf(address _owner) external view returns (uint256)',
        ];
        return new Contract(token, abi, this.signer);
    }

    get signer() {
        if (!this._signer) {
            throw new Error('No signer available. Please provide a signer when calling connect()');
        }
        return this._signer!;
    }

    async isApproved(spentToken: HexString, amount: HexNumber): Promise<boolean> {
        const token = this.tokenContract(spentToken);
        const user = await this.signer.getAddress();
        const allowance = await token.allowance(user, this.factory.address);
        return allowance.gte(BigNumber.from(amount));
    }

    /** Approve the Nested contracts to spent the given input budget  */
    async approve(spentToken: HexString, amount?: HexNumber): Promise<void> {
        const token = this.tokenContract(spentToken);
        const amt = amount ? BigNumber.from(amount) : constants.MaxUint256;
        await token.approve(this.factory.address, amt);
    }

    async balanceOf(tokenAddress: HexString): Promise<HexNumber> {
        const token = this.tokenContract(tokenAddress);
        const user = await this.signer.getAddress();
        const balance = (await token.balanceOf(user)) as BigNumber;
        return balance.toHexString() as HexNumber;
    }

    prepareOrder(arg: OrderCreationArg): Promise<InternalSwapOrder> {
        if (arg.buyToken.toLowerCase() === arg.spendToken.toLowerCase()) {
            // when the input is the same as the output, use the flat operator
            return this._prepareFlat(arg);
        } else {
            // else, use 0x to perform a swpa
            return this._prepare0xSwap(arg);
        }
    }

    private async _prepareFlat(arg: OrderCreationArg): Promise<InternalSwapOrder> {
        const order = buildOrderStruct(
            // specify that we're using the flat operator
            'Flat',
            // specify output token for fees computation
            wrap(this.chain, arg.buyToken),
            // see Flat operator implementation:
            [
                ['address', wrap(this.chain, arg.spendToken)],
                ['uint256', removeFees(arg.spendQty)],
            ],
        );

        return {
            arg,
            price: 1,
            guaranteedPrice: 1,
            spentQty: BigNumber.from(arg.spendQty).toHexString() as HexNumber,
            // hide call data in an opaque string to avoid the user to mess with it
            _internal: objectToHex(order),
        };
    }

    private async _prepare0xSwap(arg: OrderCreationArg): Promise<InternalSwapOrder> {
        // build the 0x swap order
        const zxQuote = await fetchZxSwap(this.chain, {
            ...arg,
            // remove fee from the input amount
            spendQty: removeFees(arg.spendQty),
        });

        const order = buildOrderStruct(
            // specify that we're using the 0x operator
            'ZeroEx',
            // specify output token
            wrap(this.chain, arg.buyToken),
            // see ZeroEx operator implementation:
            [
                ['address', wrap(this.chain, arg.spendToken)],
                ['address', wrap(this.chain, arg.buyToken)],
                ['bytes', zxQuote.data],
            ],
        );

        return {
            arg,
            price: parseFloat(zxQuote.price),
            guaranteedPrice: parseFloat(zxQuote.guaranteedPrice),
            spentQty: BigNumber.from(arg.spendQty).toHexString() as HexNumber,
            // hide call data in an opaque string to avoid the user to mess with it
            _internal: objectToHex(order),
        };
    }

    async addTokenToPortfolio(portfolioId: HexString | ChainAndId, orders: Order[]): Promise<ContractReceipt> {
        // infer spent token
        const { spentToken, total } = this._singleSpentToken(orders);
        const ordersData = this._extractOrders(orders);

        // infer the token ID
        let nftId: BigNumber = this._inferNftId(portfolioId);

        // actual transaction
        const tx: ContractTransaction = await this.factory.addTokens(nftId, spentToken, total, ordersData, {
            // compute how much native token we need as input:
            value: spentToken === NATIVE_TOKEN ? total : 0,
        });
        const receipt = await tx.wait();
        return receipt;
    }

    async swapSingleToMulti(portfolioId: HexString | ChainAndId, orders: Order[]): Promise<ContractReceipt> {
        // token transfers are not valid for this method => filter them out.
        orders = orders.filter(o => o.arg.buyToken.toLowerCase() !== o.arg.spendToken.toLowerCase());

        // infer spent token
        const { spentToken, total } = this._singleSpentToken(orders);
        const ordersData = this._extractOrders(orders);

        // infer the token ID
        let nftId: BigNumber = this._inferNftId(portfolioId);

        // actual transaction
        const tx: ContractTransaction = await this.factory.swapTokenForTokens(nftId, spentToken, total, ordersData);
        const receipt = await tx.wait();
        return receipt;
    }

    async swapMultiToSingle(portfolioId: HexString | ChainAndId, orders: Order[]): Promise<ContractReceipt> {
        // token transfers are not valid for this method => filter them out.
        orders = orders.filter(o => o.arg.buyToken.toLowerCase() !== o.arg.spendToken.toLowerCase());

        // infer bought token
        const boughtToken = wrap(this.chain, this._singleBoughtToken(orders));
        const ordersData = this._extractOrders(orders);
        const soldAmounts = orders.map(x => BigNumber.from(x.spentQty));

        // infer the token ID
        let nftId: BigNumber = this._inferNftId(portfolioId);

        // actual transaction
        const tx: ContractTransaction = await this.factory.sellTokensToNft(nftId, boughtToken, soldAmounts, ordersData);
        const receipt = await tx.wait();
        return receipt;
    }

    async createPortfolio(orders: Order[], meta?: CreatePortfolioMetadata): Promise<CreatePortfolioResult> {
        // infer spent token
        const { spentToken, total } = this._singleSpentToken(orders);
        const ordersData = this._extractOrders(orders);

        // check that we know the NftCreated event
        const int = this.nestedFactoryInterface;
        const createdTopic = int.getEventTopic(int.getEvent('NftCreated'));

        // perform the actual transaction
        const tx: ContractTransaction = await this.factory.create(
            meta?.originalPortfolioId ?? 0,
            spentToken,
            total,
            ordersData,
            {
                // compute how much native token we need as input:
                value: spentToken === NATIVE_TOKEN ? total : 0,
            },
        );
        const receipt = await tx.wait();

        // lookup for the NFT id by reading the transaction logs
        const createdEventLog = receipt.logs.find(x => x.topics.includes(createdTopic));
        const nftId = createdEventLog && (int.parseLog(createdEventLog).args.nftId as BigNumber);
        if (!nftId) {
            // should not happen, as long as the contract emits NftCreated event.
            throw new Error('The portfolio transaction has succeeded, but the resulting NFT id cannot be determined');
        }

        return {
            id: `${this.chain}:${nftId.toNumber()}`,
            idInChain: nftId.toHexString() as HexString,
            chain: this.chain,
            privateUrl: `https://app.nested.finance/portfolios/${this.chain}:${nftId.toNumber()}`,
            publicUrl: `https://app.nested.finance/explorer/${this.chain}:${nftId.toNumber()}`,
            receipt,
        };
    }

    /** Infer spent token, and throw an error if multiple spent tokens */
    private _singleSpentToken(orders: Order[]) {
        const inputTokens = new Set(orders.map(x => x.arg.spendToken));
        if (inputTokens.size !== 1) {
            throw new Error('All orders must have the same spent token as input');
        }
        const spentToken = orders[0].arg.spendToken.toLowerCase();
        // compute total amount
        const total = orders.map(s => BigNumber.from(s.spentQty)).reduce((a, b) => a.add(b), BigNumber.from(0));
        return { spentToken, total };
    }

    /** Infer bought token, and throw an error if multiple bought tokens */
    private _singleBoughtToken(orders: Order[]) {
        const inputTokens = new Set(orders.map(x => x.arg.buyToken));
        if (inputTokens.size !== 1) {
            throw new Error('All orders must have the same bought token as input');
        }
        return orders[0].arg.buyToken.toLowerCase() as HexString;
    }

    /** Infer the related NFT id, and throw an error if not on the right chain */
    private _inferNftId(portfolioId: HexString | ChainAndId): BigNumber {
        if (/^0x[a-f\d]+$/i.test(portfolioId)) {
            return BigNumber.from(portfolioId);
        }
        const [_, idChain, id] = /^(\w+):(\d+)$/.exec(portfolioId) ?? [];
        if (idChain !== this.chain) {
            throw new Error(`The given porfolio ID "${portfolioId}" cannot be processed on this chain (${this.chain})`);
        }
        return BigNumber.from(parseInt(id));
    }

    /** Extract swap orders from data structures given to the user */
    private _extractOrders(orders: Order[]) {
        if (!orders.length) {
            throw new Error('No valid orders provided');
        }

        // extract call data from orders
        const internals = orders.map(x => (x as InternalSwapOrder)._internal);
        if (internals.some(x => !x)) {
            throw new Error(
                'Swaps must be preppared via a call to .prepareSwap(). Do not try to mint swap orders yourself.',
            );
        }
        return internals.map(s => hexToObject(s));
    }
}
