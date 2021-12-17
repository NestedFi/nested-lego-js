import { Chain, CreatePortfolioMetadata, INestedContracts, NestedTools } from './public-types';
import {
    HexString,
    MultiToSingleSwapper,
    Holding,
    PortfolioCreator,
    PortfolioIdIsh,
    PortfolioLiquidator,
    PortfolioSeller,
    PortfolioTokenAdder,
    SingleToMultiSwapper,
} from './public-types';
import { checkHasSigner, isBigNumberTyped, normalize, unwrap, wrap } from './utils';
import { BigNumber, Signer } from 'ethers';
import { PortfolioCreatorImpl } from './porfolio-creator';
import { PortfolioTokenAdderImpl } from './porfolio-token-adder';
import { SingleToMultiSwapperImpl } from './porfolio-single-to-multi-swapper';
import { MultiToSingleSwapperImpl } from './porfolio-multi-to-single-swapper';
import { PortfolioLiquidatorImpl } from './porfolio-liquidator';
import { PortfolioSellerImpl } from './porfolio-seller';

export class NestedContractsInstance implements INestedContracts {
    constructor(readonly chain: Chain, readonly tools: NestedTools, private _signer: Signer | undefined) {}

    get signer() {
        return checkHasSigner(this._signer);
    }

    createPortfolio(budgetToken: HexString, metadata?: CreatePortfolioMetadata): PortfolioCreator {
        const ret = new PortfolioCreatorImpl(this, normalize(budgetToken));
        if (metadata) {
            ret.metadata = metadata; // for typing
            ret.setMetadata(metadata); // just to check constraints
        }
        return ret;
    }

    addTokensToPortfolio(portfolioId: PortfolioIdIsh, budgetToken: HexString): PortfolioTokenAdder {
        const ret = new PortfolioTokenAdderImpl(this, normalize(budgetToken));
        // infer the token ID
        ret.nftId = this._inferNftId(portfolioId);
        return ret;
    }

    swapSingleToMulti(portfolioId: PortfolioIdIsh, tokenToSpend: HexString): SingleToMultiSwapper {
        // infer the token ID
        const nftId: BigNumber = this._inferNftId(portfolioId);
        return new SingleToMultiSwapperImpl(this, nftId, wrap(this.chain, tokenToSpend));
    }

    swapMultiToSingle(portfolioId: PortfolioIdIsh, tokenToBuy: HexString): MultiToSingleSwapper {
        // infer the token ID
        const nftId: BigNumber = this._inferNftId(portfolioId);
        return new MultiToSingleSwapperImpl(this, nftId, wrap(this.chain, tokenToBuy));
    }

    liquidateToWalletAndDestroy(
        portfolioId: PortfolioIdIsh,
        tokenToReceive: HexString,
        slippage: number,
    ): PortfolioLiquidator {
        const nftId = this._inferNftId(portfolioId);
        return new PortfolioLiquidatorImpl(this, nftId, tokenToReceive, slippage);
    }

    /** Sell some tokens in portfolio to wallet */
    sellTokensToWallet(portfolioId: PortfolioIdIsh, tokenToReceive: HexString): PortfolioSeller {
        const nftId = this._inferNftId(portfolioId);
        return new PortfolioSellerImpl(this, nftId, tokenToReceive);
    }

    /** Get assets in portfolio */
    async getAssets(portfolioId: PortfolioIdIsh): Promise<Holding[]> {
        if (!portfolioId) {
            return [];
        }
        const nftId = this._inferNftId(portfolioId);
        const records = await this.tools.recordsContract();
        const ret: any[] = await records.tokenHoldings(nftId);
        return ret.map<Holding>(x => ({
            // only select the properties we'd like to have
            token: unwrap(this.chain, x.token),
            tokenErc20: x.token,
            amount: BigNumber.from(x.amount),
        }));
    }

    /** Infer the related NFT id, and throw an error if not on the right chain */
    private _inferNftId(portfolioId: PortfolioIdIsh): BigNumber {
        if (isBigNumberTyped(portfolioId)) {
            return portfolioId;
        }
        if (/^0x[a-f\d]+$/i.test(portfolioId)) {
            return BigNumber.from(portfolioId);
        }
        const [_, idChain, id] = /^(\w+):(\d+)$/.exec(portfolioId) ?? [];
        if (idChain !== this.chain) {
            throw new Error(
                `The given portfolio ID "${portfolioId}" cannot be processed on this chain (${this.chain})`,
            );
        }
        return BigNumber.from(parseInt(id));
    }
}
