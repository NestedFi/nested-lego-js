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
import { checkHasSigner, normalize, wrap } from './utils';
import { BigNumber, ContractReceipt, ContractTransaction, Signer } from 'ethers';
import { PorfolioCreatorImpl } from './porfolio-creator';
import { PorfolioTokenAdderImpl } from './porfolio-token-adder';
import { SingleToMultiSwapperImpl } from './porfolio-single-to-multi-swapper';
import { MultiToSingleSwapperImpl } from './porfolio-multi-to-single-swapper';

export class NestedContractsInstance implements INestedContracts {
    constructor(readonly chain: Chain, readonly tools: NestedTools, private _signer: Signer | undefined) {}

    get signer() {
        return checkHasSigner(this._signer);
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
        // infer the token ID
        const nftId: BigNumber = this._inferNftId(portfolioId);
        return new SingleToMultiSwapperImpl(this, nftId, normalize(tokenToSpend));
    }

    swapMultiToSingle(portfolioId: HexString | ChainAndId, tokenToBuy: HexString): MultiToSingleSwapper {
        // infer the token ID
        const nftId: BigNumber = this._inferNftId(portfolioId);
        return new MultiToSingleSwapperImpl(this, nftId, normalize(tokenToBuy));
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
