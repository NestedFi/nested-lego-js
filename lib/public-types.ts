import type {
    BigNumber,
    BigNumberish,
    Contract,
    ContractReceipt,
    ContractTransaction,
    providers,
    Signer,
    utils,
} from 'ethers';
import type { ZeroExRequest, ZeroXAnswer } from './0x-types';
import type { AggregatorQuoteResponse, AggregatorRequest, DexAggregator } from './dex-aggregator-types';
import type { ParaSwapAnswer } from './paraswap-types';

export type { AggregatorRequest, AggregatorQuoteResponse, DexAggregator };

export enum Chain {
    eth = 'eth',
    bsc = 'bsc',
    avax = 'avax',
    poly = 'poly',
    opti = 'opti',
    arbi = 'arbi',
    ftm = 'ftm',
    celo = 'celo',
}
export type HexString = `0x${string}`;
export type HexNumber = `${'' | '-'}${HexString}`;
export type ChainAndId = `${Chain}:${number}`;

export interface PorfolioMetadata {
    /** Provide a name for the underlying NFT */
    name?: string;
    /** Provide some tags for the underlying NFT  (ex: ['defi'])*/
    tags?: string[];
    /**
     * If this is set, then this NFT was created for a trading competition (but it's
     * NOT guaranteed to meet the requirements to be eligible for the competition)
     */
    tradingCompId?: string;
}

export interface CreatePortfolioMetadata extends PorfolioMetadata {
    /** Original portfolio ID.
     * Provide it with its chain-qualified name (ex: 'avax:123'), or its raw ID on the current chain (ex: 123)
     */
    originalPortfolioId?: PortfolioIdIsh;
}

export interface GenericCallData {
    /** Contract to call (= address of the NestedFactory contract) */
    to: HexString;
    /** Call data to send */
    data?: HexString;
    /** Value that must be sent as native token */
    value?: BigNumber;
    /** Gas limit to use */
    gasLimit?: BigNumber;
    /** Gas limit to use */
    gasPrice?: BigNumber;
}

export interface CallData extends GenericCallData {
    /** Call data to send */
    data: HexString;
}

export interface TokenOrderFees {
    /** Tells if fees will be taken on input, or output */
    readonly on: 'input' | 'output';
    /** Token on which those fees are computed */
    readonly onToken: HexString;
    /** Amount of fees */
    readonly amount: BigNumber;
}

/**
 * Represents a token operation.
 * nb: All method calls behave nicely when called in parallel
 * (async operations are debounced, and the latest call always wins, even if it finishes before a call started earlier)
 */
export interface TokenOrder {
    /** Token you'd like to spend */
    readonly inputToken: HexString;

    /** Token you'd like to receive */
    readonly outputToken: HexString;

    /** Which swap amount has been fixed ? Budget amount ? Or output amount ? */
    readonly fixedAmount: 'output' | 'input';

    /**
     * Accepted slippage (ex: '0.03' means 3% slippage accepted).
     * Applicable if this order is a swap (if spent & buy token are different) - ignored otherwise.
     */
    readonly slippage: number;

    /** Total spent quantity, including fees when any (in spendToken - this is an extimation if you specified an output budget) */
    readonly inputQty: BigNumber;

    /** Received quantity, including fees when any (in bought token - this is an estimation if you specified an input budget) */
    readonly outputQty: BigNumber;

    /** Price given by the AMM */
    readonly price: number;

    /** Guaranteed price given the AMM */
    readonly guaranteedPrice: number;

    /** Total fees that will be paid back to the Nested protocol */
    readonly fees: TokenOrderFees;

    /** Estimated price impact of the current swap on the liquidity pool */
    readonly estimatedPriceImpact: number;

    /** Operator that will execute the trade (0x or ParaSwap) */
    readonly operator: DexAggregator | null;

    /**
     * Change the budget allocated to buying this token
     * @returns true if change was successful, false if it will be overridden by a later call that has been performed concurrently
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    setInputAmount(forBudgetAmount: BigNumberish): PromiseLike<boolean>;

    /**
     * Change the amount we want to receive of this token.
     * @returns true if change was successful, false if it will be overridden by a later call that has been performed concurrently
     *
     * @remark When setting this, fees might be deduced from this amount.
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    setOutputAmount(boughtAmount: BigNumberish): PromiseLike<boolean>;

    /**
     * Change the accepted slippage
     * @returns true if change was successful, false if it will be overridden by a later call that has been performed concurrently
     *  */
    changeSlippage(slippage: number): PromiseLike<boolean>;

    /**
     * Refresh quotes
     * @returns true if change was successful, false if it will be overridden by a later call that has been performed concurrently
     */
    refresh(): PromiseLike<boolean>;

    /** Remove this token from parent operation */
    remove(): void;
}

export interface HasOrders {
    /** Instance that has created this */
    readonly parent: INestedContracts;
    /** Orders already added to this operation */
    readonly orders: readonly TokenOrder[];
}

export interface CanAddTokensOperation extends HasOrders {
    /** Budget token that will be spent from your wallet */
    readonly spentToken: HexString;

    /** Total required budget */
    readonly totalBudget: BigNumber;

    /**
     * Add a new token to this portfolio.
     * @argument token The token we want to add to this portfolio.
     * @argument slippage Allowed price slippage (ex: 0.03 means 3% slippage allowed slippage)
     */
    addToken(token: HexString, slippage: number): TokenOrder;

    /** Tells if the Nested contracts have enough allowance to spend the required budget token in your name */
    isApproved(): PromiseLike<boolean>;

    /**
     * Approve the Nested contracts to spent the given input budget
     * @argument amount (optional) If provided, then only the given amount will be approved (must be >= this.total)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    approve(amount?: BigNumberish): PromiseLike<void>;
}

/** Configure an operation aiming to create a new portfolio */
export interface PortfolioCreator extends CanAddTokensOperation {
    /** Changes the porfolio metadata */
    setMetadata(metadata: PorfolioMetadata): void;

    /**
     * Build call data that can be used to send the transaction to the NestedFacotry contract manually.
     *
     * ⚠️ If you plan to send a transaction manually, then you will have to call `.attachMetadataToTransaction()` as soon as you have a transaction hash.
     * Otherwise, the metadata you gave will be ignored.
     */
    buildCallData(): CallData;

    /**
     * Attach the metdata that were given to this transaction hash.
     * To be executed as soon as you have a transaction hash (BEFORE the transaction is fully processed)
     */
    attachMetadataToTransaction(transactionHash: HexString, from: HexString, nonce: number): PromiseLike<void>;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<CreatePortfolioResult>;
}

export interface ExecOptions {
    gasPrice?: BigNumber;
    gasLimit?: BigNumber;
}

export interface CreatePortfolioResult {
    /** A portfolio identifier, unique accross all chains (identifier used by Nested.finance to identify portfolios)  */
    id: ChainAndId;
    /** The portfolio ID (unique in the given chain) */
    idInChain: HexString;
    /** The chain this portfolio is on (just as a reminder) */
    chain: Chain;
    /** A private URL that can be used to display this portfolio on Nested.finance (requires to be connected with the owner's wallet) */
    privateUrl: string;
    /** A public URL that can be used to show off this portfolio on Nested.finance */
    publicUrl: string;
    /** Transaction receipt */
    receipt: ContractReceipt;
}

/** Configure an operation aiming to add tokens to an existing portfolio, using a budget from your wallet */
export interface PortfolioTokenAdder extends CanAddTokensOperation {
    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export type TokenLiquidator = Omit<TokenOrder, 'changeBudgetAmount' | 'remove'>;

export interface PortfolioLiquidator {
    /** List of current orders in this liquidation */
    readonly orders: readonly TokenLiquidator[];

    /** Budget token that will be spent from your wallet */
    readonly receivedToken: HexString;

    /** Refresh the assets to be liquidated, in order to have a preview of what you will receive */
    refreshAssets(): PromiseLike<readonly TokenLiquidator[]>;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export interface PortfolioSeller extends HasOrders {
    /** Budget token that will be spent from your wallet */
    readonly receivedToken: HexString;

    /**
     * Add a new token to this portfolio.
     * @argument token The token we want to add to this portfolio.
     * @argument slippage Allowed price slippage (ex: 0.03 means 3% slippage allowed slippage)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    sellToken(token: HexString, slippage: number): TokenOrder;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export interface PorfolioSender {
    /** Build call data that can be used to send the transaction to the NestedAsset contract manually  */
    buildCallData(): Promise<CallData>;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export interface FeesClaimer {
    /** Tokens that will be claimed */
    readonly tokens: readonly HexString[];

    /** Build call data that can be used to send the transaction to the FeeSplitter contract manually  */
    buildCallData(): Promise<CallData>;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export interface SingleToMultiSwapper extends HasOrders {
    /** Budget token in your portfolio that will be swapped to another token */
    readonly spentToken: HexString;

    /**
     * Add a new token to this portfolio.
     * @argument token The token we want to add to this portfolio.
     * @argument slippage Allowed price slippage (defaults to 0.03 = 3% slippage)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    swapTo(token: HexString, slippage: number): TokenOrder;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export interface MultiToSingleSwapper extends HasOrders {
    /**
     * Sell a given token.
     * @argument sellToken The token we want to sell in this portfolio.
     * @argument slippage Allowed price slippage (defaults to 0.03 = 3% slippage)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    swapFrom(sellToken: HexString, slippage: number): TokenOrder;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export interface PortfolioComplexOperation {
    /** Step 1: Deposits */
    readonly deposits: readonly TokenOrder[];
    /** Step 2: Intra-porfolio swaps */
    readonly swaps: readonly TokenOrder[];
    /** Step 3: Withdrawals */
    readonly withdrawals: readonly TokenOrder[];

    /**
     * Get all tokens that must be approved.
     * This list will be empty if you dont call `addFromWallet()`
     */
    tokensToApprove(): Promise<{ token: HexString; amount: BigNumber }[]>;

    /**
     * Approve all tokens that must be approved, one-by-one.
     * This will trigger one transaction for each token that must be approved (see tokensToApprove())
     *
     * @param exactAmounts Only approve the exact amounts that are required for this operation.
     */
    approveAll(exactAmounts?: boolean): Promise<void>;

    /** Add tokens from your wallet in your portfolio */
    addFromWallet(tokenToAdd: HexString): TokenOrder;
    /** Add tokens in your portfolio, by swapping them from tokens in your wallet */
    addFromWallet(tokenToAdd: HexString, payWithToken: HexString, slippage: number): TokenOrder;

    /** Withdraw tokens from your portfolio */
    withdrawToWallet(tokenToWithdraw: HexString): TokenOrder;
    /** Withdraw tokens from your portfolio, but receive them swapped to another tokens in your wallet */
    withdrawToWallet(tokenToWithdraw: HexString, receiveInToken: HexString, slippage: number): TokenOrder;

    /** Swap those tokens in your portfolio */
    swapInPortfolio(tokenToSell: HexString, tokenToBuy: HexString, slippage: number): TokenOrder;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(options?: ExecOptions): PromiseLike<ContractReceipt>;
}

export interface Holding {
    /** Token. Will be 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee... when the wrapped token is the chain's native token (ex: ETH, AVAX, MATIC, ...) */
    readonly token: HexString;
    /** Same as `token` for ERC20 tokens, but will contain the wrapped token when the the asset is the native token (ex: WETH, WAVAX, ...) */
    readonly tokenErc20: HexString;
    /** Token quantity */
    readonly amount: BigNumber;
}

export type NftEventType = 'NftCreated' | 'NftUpdated' | 'NftBurned';

export interface FeesRates {
    /** Approximate ratio of entry fees (entryExact / 10000) */
    entry: number;
    /** Exact ratio of entry fees (will be divided by 10000) */
    entryExact: BigNumber;
    /** Approximate ratio of exit fees (entryExact / 10000) */
    exit: number;
    /** Exact ratio of exit fees (will be divided by 10000) */
    exitExact: BigNumber;
}
export interface NestedTools {
    readonly chain: Chain;
    readonly factoryInterface: utils.Interface;
    readonly feeSplitterInterface: utils.Interface;
    readonly assetInterface: utils.Interface;
    readonly factoryContract: Contract;
    readonly provider: providers.Provider;
    readonly nestedFinanceApi: string;
    readonly nestedFinanceUi: string;
    /** Get user address */
    readonly userAddress: HexString;

    /** Gets the number of decimals of a given ERC20 token */
    getErc20Decimals(erc20: HexString): PromiseLike<number>;
    /** Computes a token amount, fetching token digits & converting it to the right BigNumber if the amount you gave is a number */
    toTokenAmount(token: HexString, amount: BigNumberish): PromiseLike<BigNumber>;
    /** Returns your balance of the given ERC20 token */
    balanceOf(tokenAddress: HexString): PromiseLike<BigNumber>;
    /** Reads a transaction receipt logs, to infer some info about the NFT that has been created in this transaction */
    readTransactionLogs(receipt: providers.TransactionReceipt, operationType: NftEventType): CreatePortfolioResult;
    /** Gets the NestedRecords contract */
    recordsContract(): PromiseLike<Contract>;
    /** Gets the NestedRecords contract */
    feeSplitterContract(): PromiseLike<Contract>;
    /** Gets the NestedAsset contract */
    assetContract(): PromiseLike<Contract>;
    /** Gets fees rate from Factory contract*/
    feesRates(): PromiseLike<FeesRates>;
    /** Fetch a quote from 0x */
    fetch0xSwap(request: ZeroExRequest): PromiseLike<ZeroXAnswer>;
    /** Fetch a quote from ParaSwap */
    fetchParaSwap(request: AggregatorRequest): PromiseLike<ParaSwapAnswer | null>;
    /** Get most competitive quote from multiple dex aggregators */
    fetchLowestQuote(request: AggregatorRequest): PromiseLike<AggregatorQuoteResponse>;
    /** Gets the factory allowance of a contract for an ERC20 token */
    factoryAllowance(ofUser: HexString, forToken: HexString): Promise<BigNumber>;
    /** Approve factory spending for an ERC20 token */
    approve(token: HexString, amount?: BigNumberish): Promise<ContractTransaction>;
    /** Prepare calldata to be executed (computes gas limit, ...)  */
    prepareCalldata(callData: CallData, options?: ExecOptions): Promise<void>;
    /** Get an ERC20 contract */
    tokenContract(token: HexString): Contract;
    /** Get the allowance of a contract for a given token */
    allowance(ofUser: HexString, forContract: HexString, forToken: HexString): Promise<BigNumber>;
    /** Get estimations for gasLimit and gasPrice, given generic call data */
    estimateGas(callData: GenericCallData, options?: ExecOptions): Promise<ExecOptions>;
}

export interface INestedContracts {
    readonly chain: Chain;

    /** Some tools to help you interact directly with Nested Finance contracts on this chain */
    readonly tools: NestedTools;

    /** Transaction signer (will throw an exception if you did not provide a signer when calling connect()) */
    readonly signer: Signer;
    readonly maybeSigner: Signer | null;

    /**
     * Creates a portfolio.
     * 👉 Only one budget token allowed for all swap orders
     * 👉 The nested contracts must have an allowance on budget token (see .approve() & .requiresApproval() methods)
     */
    createPortfolio(budgetToken: HexString, metadata?: CreatePortfolioMetadata): PortfolioCreator;

    /**
     * Updates a portfolio, by adding tokens in it, buying them with a single token in your wallet.
     * 👉 Same behaviour as `createPortfolio`, but on an existing portfolio.
     */
    addTokensToPortfolio(portfolioId: PortfolioIdIsh, budgetToken: HexString): PortfolioTokenAdder;

    /**
     * Swap a single token in portfolio, to multiple tokens (that will stay in portfolio).
     * 👉 All orders must have the same `spendToken`.
     * 👉 The portfolio must contain enough budget to perform the given swaps.
     */
    swapSingleToMulti(portfolioId: PortfolioIdIsh, tokenToSpend: HexString): SingleToMultiSwapper;

    /**
     * Swap multiple tokens in portfolio, to a single token (that will stay in portfolio).
     * 👉 All orders must have the same `buyToken`.
     * 👉 The portfolio must contain enough budget to perform the given swaps.
     */
    swapMultiToSingle(portfolioId: PortfolioIdIsh, tokenToBuy: HexString): MultiToSingleSwapper;

    /** Performs a complex operation */
    complexOperation(porfolioId: PortfolioIdIsh): PortfolioComplexOperation;

    /**
     * Smart helper that helps you to add some given budget to the given porfolio,
     * while trying to keep the porfolios current assets proportions unchanged.
     *
     * It is equivalent to multiple judicious calls to addToken() in a PorfolioTokenAdder,
     * after having computed asset value proportions against 0x.
     *
     * @argument portfolioId The portfolio to deposit to
     * @argument budgetToken The token to add as budget in the portfolio
     * @argument budgetAmount How much budget to add
     * @argument slippage Default slippage  (can be customized asset-by-asset, see setSlippage() on the returned type)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    depositToPorfolio(
        portfolioId: PortfolioIdIsh,
        budgetToken: HexString,
        budgetAmount: BigNumberish,
        slippage: number,
    ): Promise<PortfolioTokenAdder>;

    /**
     * Smart helper that helps you to withdraw a given amount of to the given token from a porfolio,
     * while trying to keep the porfolios current assets proportions unchanged.
     *
     * It is equivalent to multiple judicious calls to sellToken() in a PortfolioSeller,
     * after having computed asset value proportions against 0x.
     *
     * @argument portfolioId The portfolio to withdraw from
     * @argument withdrawToken The token to add as budget in the portfolio
     * @argument withdrawAmount How much budget to withdraw
     * @argument slippage Default slippage  (can be customized asset-by-asset, see setSlippage() on the returned type)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    withdrawFromPortfolio(
        portfolioId: PortfolioIdIsh,
        withdrawToken: HexString,
        withdrawAmount: BigNumberish,
        slippage: number,
    ): Promise<PortfolioSeller>;

    /**
     * Sell all assets in portfolio to wallet & burns the associated NFT
     * @argument portfolioId The portfolio to liquidate
     * @argument tokenToReceive The token you will receive on your wallet
     * @argument slippage Default slippage to sell all assets (can be customized asset-by-asset, see PortfolioLiquidator -> refreshAssets -> setSlippage)
     */
    liquidateToWalletAndDestroy(
        portfolioId: PortfolioIdIsh,
        tokenToReceive: HexString,
        slippage: number,
    ): PortfolioLiquidator;

    /** Sell some tokens in portfolio to wallet */
    sellTokensToWallet(portfolioId: PortfolioIdIsh, tokenToReceive: HexString): PortfolioSeller;

    /** Get assets in portfolio */
    getAssets(portfolioId: PortfolioIdIsh, getAssets?: boolean): PromiseLike<Holding[]>;

    /** Get claimable fees for the given token */
    getClaimableFees(token: HexString, ofOwner?: HexString): PromiseLike<BigNumber>;

    /** Claim fees earned in the given tokens */
    claimFees(tokens: HexString[]): FeesClaimer;

    /** Send NFT to another address */
    transferPorfolioTo(portfolioId: PortfolioIdIsh, to: HexString, from?: HexString): PorfolioSender;
}

export type PortfolioIdIsh = HexString | ChainAndId | BigNumber;

export const ZERO_ADDRESS: HexString = '0x0000000000000000000000000000000000000000';
export const NATIVE_TOKEN: HexString = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export enum QuoteErrorReasons {
    INSUFFICIENT_ASSET_LIQUIDITY = 'INSUFFICIENT_ASSET_LIQUIDITY',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class QuoteFailedError extends Error {
    reason: QuoteErrorReasons;

    constructor(message: QuoteErrorReasons) {
        super(message);
        this.reason = message ?? QuoteErrorReasons.UNKNOWN_ERROR;
    }
}
