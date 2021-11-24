import { Chain, CreatePortfolioMetadata, HexNumber, INestedContracts, NATIVE_TOKEN } from '.';
import { CreatePortfolioResult, HexString, SwapArgument, SwapOrder } from './public-types';
import { fetchZxSwap } from './0x';
import { buildOrderStruct, hexToObject, objectToHex, removeFees, safeMult, wrap } from './utils';
import { BigNumber, constants, Contract, ContractTransaction, Signer, utils } from 'ethers';
import { FIXED_FEE } from './default-contracts';

interface InternalSwapOrder extends SwapOrder {
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

    prepareSwap(arg: SwapArgument): Promise<InternalSwapOrder> {
        if (arg.buyToken.toLowerCase() === arg.spendToken.toLowerCase()) {
            // when the input is the same as the output, use the flat operator
            return this._prepareFlat(arg);
        } else {
            // else, use 0x to perform a swpa
            return this._prepare0xSwap(arg);
        }
    }

    private async _prepareFlat(arg: SwapArgument): Promise<InternalSwapOrder> {
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

    private async _prepare0xSwap(arg: SwapArgument): Promise<InternalSwapOrder> {
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

    async createPortfolio(swaps: SwapOrder[], meta?: CreatePortfolioMetadata): Promise<CreatePortfolioResult> {
        // check spent token
        const inputTokens = new Set(swaps.map(x => x.arg.spendToken));
        if (inputTokens.size !== 1) {
            throw new Error('All swaps must have the same spent token as input');
        }
        const spentToken = swaps[0].arg.spendToken.toLowerCase();

        // extract call data from swaps
        const internals = swaps.map(x => (x as InternalSwapOrder)._internal);
        if (internals.some(x => !x)) {
            throw new Error(
                'Swaps must be preppared via a call to .prepareSwap(). Do not try to mint swap orders yourself.',
            );
        }
        const orders = internals.map(s => hexToObject(s));

        // compute total input amount
        const total = swaps.map(s => BigNumber.from(s.spentQty)).reduce((a, b) => a.add(b), BigNumber.from(0));

        // check that we know the NftCreated event
        const int = this.nestedFactoryInterface;
        const createdTopic = int.getEventTopic(int.getEvent('NftCreated'));

        // perform the actual transaction
        const portfolio = (await this.factory.create(meta?.originalPortfolioId ?? 0, spentToken, total, orders, {
            // compute how much native token we need as input:
            value: spentToken === NATIVE_TOKEN ? total : 0,
        })) as ContractTransaction;
        const receipt = await portfolio.wait();

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
}
