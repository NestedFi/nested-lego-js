import { Chain, CreatePortfolioMetadata, INestedContracts, NATIVE_TOKEN, NestedTools } from '.';
import {
    ChainAndId,
    CreatePortfolioResult,
    HexString,
    MultiToSingleSwapper,
    PorfolioCreator,
    PorfolioTokenAdder,
    SingleToMultiSwapper,
} from './public-types';
import { normalize, wrap } from './utils';
import { BigNumber, ContractReceipt, ContractTransaction, Signer } from 'ethers';
import { PorfolioCreatorImpl } from './porfolio-creator';
import { PorfolioTokenAdderImpl } from './porfolio-token-adder';

export class NestedContractsInstance implements INestedContracts {
    constructor(readonly chain: Chain, readonly tools: NestedTools, private _signer: Signer | undefined) {}

    get signer() {
        if (!this._signer) {
            throw new Error('No signer available. Please provide a signer when calling connect()');
        }
        return this._signer!;
    }

    createPortfolio(budgetToken: HexString, metadata?: CreatePortfolioMetadata): PorfolioCreator {
        const ret = new PorfolioCreatorImpl(this, normalize(budgetToken));
        ret.metadata = metadata;
        return ret;
    }

    addTokensToPortfolio(portfolioId: HexString | ChainAndId, budgetToken: HexString): PorfolioTokenAdder {
        const ret = new PorfolioTokenAdderImpl(this, normalize(budgetToken));
        // infer the token ID
        ret.nftId = this._inferNftId(portfolioId);
        return ret;
    }

    swapSingleToMulti(portfolioId: HexString | ChainAndId, tokenToSpend: HexString): SingleToMultiSwapper {
        // token transfers are not valid for this method => filter them out.
        orders = orders.filter(o => normalize(o.arg.buyToken) !== normalize(o.arg.spendToken));

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

    swapMultiToSingle(portfolioId: HexString | ChainAndId, tokenToBuy: HexString): MultiToSingleSwapper {
        // token transfers are not valid for this method => filter them out.
        orders = orders.filter(o => normalzie(o.arg.buyToken) !== normalize(o.arg.spendToken));

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
}
