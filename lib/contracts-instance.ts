import { Chain, CreatePortfolioMetadata, FeesClaimer, INestedContracts, NestedTools } from './public-types';
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
import { checkHasSigner, inferNftId, normalize, unwrap, wrap } from './utils';
import { BigNumber, BigNumberish, Signer } from 'ethers';
import { PortfolioCreatorImpl } from './porfolio-creator';
import { PortfolioTokenAdderImpl } from './porfolio-token-adder';
import { SingleToMultiSwapperImpl } from './porfolio-single-to-multi-swapper';
import { MultiToSingleSwapperImpl } from './porfolio-multi-to-single-swapper';
import { PortfolioLiquidatorImpl } from './porfolio-liquidator';
import { PortfolioSellerImpl } from './porfolio-seller';
import { FeesClaimerImpl } from './fees-claimer';

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
        const [tokens, amounts]: [tokens: HexString[], amounts: BigNumberish[]] = await records.tokenHoldings(nftId);
        return tokens.map<Holding>((t, i) => ({
            // only select the properties we'd like to have
            token: unwrap(this.chain, t),
            tokenErc20: normalize(t),
            amount: BigNumber.from(amounts[i]),
        }));
    }

    /** Infer the related NFT id, and throw an error if not on the right chain */
    _inferNftId(portfolioId: PortfolioIdIsh): BigNumber {
        return inferNftId(portfolioId, this.chain);
    }

    async getClaimableFees(token: HexString, ofOwner?: HexString): Promise<BigNumber> {
        const feeSplitter = await this.tools.feeSplitterContract();
        ofOwner ??= (await this.signer.getAddress()) as HexString;
        const ret = await feeSplitter.getAmountDue(ofOwner, token);
        return ret;
    }

    claimFees(tokens: HexString[]): FeesClaimer {
        return new FeesClaimerImpl(this, tokens);
    }
}
