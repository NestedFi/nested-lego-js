import {
    Chain,
    PortfolioComplexOperation,
    CreatePortfolioMetadata,
    FeesClaimer,
    INestedContracts,
    NestedTools,
    PorfolioSender,
} from './public-types';
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
import { PorfolioSenderImpl } from './porfolio-sender';
import { computeDeposit, computeWithdrawal } from './budget-computer';
import { PortfolioComplexOperationImpl } from './portfolio-complex-operation';

const DUST_QTY = '0x30';
export class NestedContractsInstance implements INestedContracts {
    constructor(readonly chain: Chain, readonly tools: NestedTools, private _signer: Signer | undefined) {}

    get signer() {
        return checkHasSigner(this._signer);
    }

    get maybeSigner() {
        return this._signer ?? null;
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

    async depositToPorfolio(
        portfolioId: PortfolioIdIsh,
        token: HexString,
        budget: BigNumberish,
        slippage: number,
    ): Promise<PortfolioTokenAdder> {
        const assets = await this.getAssets(portfolioId);
        const adder = this.addTokensToPortfolio(portfolioId, token);
        await computeDeposit(this.tools, adder, assets, token, budget, slippage);
        return adder;
    }

    async withdrawFromPortfolio(
        portfolioId: PortfolioIdIsh,
        withdrawToken: HexString,
        withdrawAmount: BigNumberish,
        slippage: number,
    ): Promise<PortfolioSeller> {
        const assets = await this.getAssets(portfolioId);
        const seller = this.sellTokensToWallet(portfolioId, withdrawToken);
        await computeWithdrawal(this.tools, seller, assets, withdrawToken, withdrawAmount, slippage);
        return seller;
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
    async getAssets(portfolioId: PortfolioIdIsh, getDusts = false): Promise<Holding[]> {
        if (!portfolioId) {
            return [];
        }
        const nftId = this._inferNftId(portfolioId);
        const records = await this.tools.recordsContract();
        const [tokens, amounts]: [tokens: HexString[], amounts: BigNumberish[]] = await records.tokenHoldings(nftId);
        return tokens
            .map<Holding>((t, i) => ({
                // only select the properties we'd like to have
                token: unwrap(this.chain, t),
                tokenErc20: normalize(t),
                amount: BigNumber.from(amounts[i]),
            }))
            .filter(h => h.amount.gte(DUST_QTY) || getDusts);
    }

    /** Infer the related NFT id, and throw an error if not on the right chain */
    _inferNftId(portfolioId: PortfolioIdIsh): BigNumber {
        return inferNftId(portfolioId, this.chain);
    }

    async getClaimableFees(token: HexString, ofOwner?: HexString): Promise<BigNumber> {
        const feeSplitter = await this.tools.feeSplitterContract();
        ofOwner ??= (await this.signer.getAddress()) as HexString;
        const ret = await feeSplitter.getAmountDue(ofOwner, wrap(this.chain, token));
        return ret;
    }

    claimFees(tokens: HexString[]): FeesClaimer {
        return new FeesClaimerImpl(this, tokens);
    }

    transferPorfolioTo(portfolioId: PortfolioIdIsh, to: HexString, from?: HexString): PorfolioSender {
        const id = inferNftId(portfolioId, this.chain);
        return new PorfolioSenderImpl(this, from, to, id);
    }

    complexOperation(portfolioId: PortfolioIdIsh): PortfolioComplexOperation {
        const id = inferNftId(portfolioId, this.chain);
        return new PortfolioComplexOperationImpl(this, id);
    }
}
