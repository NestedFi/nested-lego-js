import { BigNumber, BigNumberish, Contract, ContractReceipt, providers, Signer, utils } from 'ethers';
import { ZeroExRequest, ZeroXAnswer } from '.';

export enum Chain {
    eth = 'eth',
    bsc = 'bsc',
    rop = 'rop',
    avax = 'avax',
    poly = 'poly',
}
export type HexString = `0x${string}`;
export type HexNumber = `${'' | '-'}${HexString}`;
export type ChainAndId = `${Chain}:${number}`;

export interface CreatePortfolioMetadata {
    /** Provide a name for the underlying NFT */
    name?: string;
    /** Provide some tags for the underlying NFT  (ex: ['defi'])*/
    tags?: string[];
    /** Original portfolio ID.
     * Provide it with its chain-qualified name (ex: 'avax:123'), or its raw ID on the current chain (ex: 123)
     */
    originalPortfolioId?: string | number;
}

export interface CallData {
    /** Contract to call (= address of the NestedFactory contract) */
    to: HexString;
    /** Call data to send */
    data: HexString;
    /** Value that must be sent as native token */
    value?: BigNumber;
}

export interface TokenOrder {
    /** Token you'd like to spend */
    readonly spendToken: HexString;
    /** Token you'd like to receive */
    readonly buyToken: HexString;
    /**
     * Accepted slippage (ex: '0.03' means 3% slippage accepted).
     * Applicable if this order is a swap (if spent & buy token are different) - ignored otherwise.
     */
    readonly slippage: number;
    /** Spent quantity (in spendToken) */
    readonly spendQty: BigNumber;

    /** Price given by the AMM */
    readonly price: number;
    /** Guaranteed price given the AMM */
    readonly guaranteedPrice: number;

    /** Change the budget allocated to buying this token */
    changeBudgetAmount(forBudgetAmount: BigNumberish): PromiseLike<void>;

    /** Change the accepted slippage */
    changeSlippage(slippage: number): PromiseLike<void>;

    /** Refresh quotes */
    refresh(): PromiseLike<void>;

    /** Remove this token from parent operation */
    remove(): void;
}

export interface HasOrders {
    /** Orders already added to this operation */
    readonly orders: readonly TokenOrder[];
}

export interface CanAddTokensOperation extends HasOrders {
    /** Budget token that will be spent from your wallet */
    readonly spentToken: HexString;

    /** Total required budget */
    readonly totalBudget: BigNumber;

    /**
     * Add a new token to this portfolio, with the given budget.
     * @argument token The token we want to add to this portfolio.
     * @argument forBudgetAmount How much of the portfolio budget must be allocated to buying this token.
     * @argument slippage Allowed price slippage (ex: 0.03 means 3% slippage allowed slippage)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    addToken(token: HexString, forBudgetAmount: BigNumberish, slippage: number): PromiseLike<TokenOrder>;

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
    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(): PromiseLike<CreatePortfolioResult>;
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
    execute(): PromiseLike<ContractReceipt>;
}

export type TokenLiquidator = Omit<TokenOrder, 'changeBudgetAmount' | 'remove'>;

export interface PortfolioLiquidator {
    /** Budget token that will be spent from your wallet */
    readonly receivedToken: HexString;

    /** Refresh the assets to be liquidated, in order to have a preview of what you will receive */
    refreshAssets(): PromiseLike<readonly TokenLiquidator[]>;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(): PromiseLike<ContractReceipt>;
}

export interface PortfolioSeller extends HasOrders {
    /** Budget token that will be spent from your wallet */
    readonly receivedToken: HexString;

    /**
     * Add a new token to this portfolio, with the given budget.
     * @argument token The token we want to add to this portfolio.
     * @argument amountToSell How much of the given token must be sold to portfolio
     * @argument slippage Allowed price slippage (ex: 0.03 means 3% slippage allowed slippage)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    sellToken(token: HexString, amountToSell: BigNumberish, slippage: number): PromiseLike<TokenOrder>;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(): PromiseLike<ContractReceipt>;
}

export interface SingleToMultiSwapper extends HasOrders {
    /** Budget token in your portfolio that will be swapped to another token */
    readonly spentToken: HexString;

    /**
     * Add a new token to this portfolio, with the given budget.
     * @argument token The token we want to add to this portfolio.
     * @argument forBudgetAmount How much of the portfolio budget must be allocated to buying this token.
     * @argument slippage Allowed price slippage (defaults to 0.03 = 3% slippage)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    swapTo(token: HexString, forBudgetAmount: BigNumberish, slippage: number): PromiseLike<TokenOrder>;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(): PromiseLike<ContractReceipt>;
}

export interface MultiToSingleSwapper extends HasOrders {
    /**
     * Sell a given budget of the given token.
     * @argument sellToken The token we want to sell in this portfolio.
     * @argument sellTokenAmount How much of the portfolio budget must be allocated to buying this token.
     * @argument slippage Allowed price slippage (defaults to 0.03 = 3% slippage)
     *
     * @remark If the passed budget is a number, then this lib will take care of fetching the token digits, and converting it to the right BigNumber for you.
     */
    swapFrom(sellToken: HexString, sellTokenAmount: BigNumberish, slippage: number): PromiseLike<TokenOrder>;

    /** Build call data that can be used to send the transaction to the NestedFacotry contract manually  */
    buildCallData(): CallData;

    /** Perform the operation */
    execute(): PromiseLike<ContractReceipt>;
}

export interface Holding {
    readonly token: HexString;
    readonly amount: BigNumber;
}

export type NftEventType = 'NftCreated' | 'NftUpdated' | 'NftBurned';
export interface NestedTools {
    readonly chain: Chain;
    readonly factoryInterface: utils.Interface;
    readonly factoryContract: Contract;
    readonly provider: providers.Provider;
    /** Gets the number of decimals of a given ERC20 token */
    getErc20Decimals(erc20: HexString): PromiseLike<number>;
    /** Computes a token amount, fetching token digits & converting it to the right BigNumber if the amount you gave is a number */
    toTokenAmount(token: HexString, amount: BigNumberish): PromiseLike<BigNumber>;
    /** Returns your balance of the given ERC20 token */
    balanceOf(tokenAddress: HexString): PromiseLike<BigNumber>;
    /** Reads a transaction receipt logs, to infer some info about the NFT that has been created in this transaction */
    readTransactionLogs(receipt: providers.TransactionReceipt, operationType: NftEventType): CreatePortfolioResult;
    // /** Gets the NestedRecords contract */
    recordsContract(): Promise<Contract>;
    /** Fetch a quote from 0x */
    fetch0xSwap(request: ZeroExRequest): Promise<ZeroXAnswer>;
}

export interface INestedContracts {
    readonly chain: Chain;

    /** Some tools to help you interact directly with Nested Finance contracts on this chain */
    readonly tools: NestedTools;

    /** Transaction signer (will throw an exception if you did not provide a signer when calling connect()) */
    readonly signer: Signer;

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
    getAssets(portfolioId: PortfolioIdIsh): Promise<Holding[]>;
}

export type PortfolioIdIsh = HexString | ChainAndId | BigNumber;

export const ZERO_ADDRESS: HexString = '0x0000000000000000000000000000000000000000';
export const NATIVE_TOKEN: HexString = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
