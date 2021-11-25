import type { ContractReceipt } from 'ethers';

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

export type OrderCreationArg = {
    /** Token you'd like to spend */
    readonly spendToken: HexString;
    /** Token you'd like to receive */
    readonly buyToken: HexString;
    /**
     * Accepted slippage (ex: '0.03' means 3% slippage accepted).
     * Applicable if this order is a swap (if spent & buy token are different) - ignored otherwise.
     */
    readonly slippage: number;
    /** Spent quantity */
    readonly spendQty: HexNumber;
};

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

export interface INestedContracts {
    readonly chain: Chain;

    /**
     * Prepare a swap, or an order to transfer a token.
     * Returns a data structure that you will have to pass to various other methods, like `createPortfolio()`.
     */
    prepareOrder(swap: OrderCreationArg): Promise<Order>;

    /**
     * Creates a portfolio.
     * 👉 Only one budget token allowed for all swap orders
     * 👉 The nested contracts must have an allowance on budget token (see .approve() & .requiresApproval() methods)
     */
    createPortfolio(orders: Order[], metadata?: CreatePortfolioMetadata): Promise<CreatePortfolioResult>;

    /**
     * Updates a porfolio, by adding tokens in it.
     * 👉 Same behaviour as `createPortfolio`, but on an existing porfolio.
     */
    addTokenToPortfolio(portfolioId: HexString | ChainAndId, orders: Order[]): Promise<ContractReceipt>;

    /**
     * Swap a single token in portfolio, to multiple tokens (that will stay in porfolio).
     * 👉 All orders must have the same `spendToken`.
     * 👉 The portfolio must contain enough budget to perform the given swaps.
     */
    swapSingleToMulti(portfolioId: HexString | ChainAndId, orders: Order[]): Promise<ContractReceipt>;

    /**
     * Swap multiple tokens in portfolio, to a single token (that will stay in porfolio).
     * 👉 All orders must have the same `buyToken`.
     * 👉 The portfolio must contain enough budget to perform the given swaps.
     */
    swapMultiToSingle(portfolioId: HexString | ChainAndId, orders: Order[]): Promise<ContractReceipt>;

    /** Returns your balance of the given ERC20 token (helper function) */
    balanceOf(tokenAddress: HexString): Promise<HexNumber>;

    /** Tells if the Nested contracts have an allowance to use the given token as an input budget */
    isApproved(spentToken: HexString, amount: HexNumber): Promise<boolean>;

    /** Approve the Nested contracts to spent the given input budget  */
    approve(spentToken: HexString, amount?: HexNumber): Promise<void>;
}

export interface CreatePortfolioResult {
    /** A porfolio identifier, unique accross all chains (identifier used by Nested.finance to identify porfolios)  */
    id: ChainAndId;
    /** The portfolio ID (unique in the given chain) */
    idInChain: HexString;
    /** The chain this porfolio is on (just as a reminder) */
    chain: Chain;
    /** A private URL that can be used to display this porfolio on Nested.finance (requires to be connected with the owner's wallet) */
    privateUrl: string;
    /** A public URL that can be used to show off this porfolio on Nested.finance */
    publicUrl: string;
    /** Transaction receipt */
    receipt: ContractReceipt;
}

export interface Order {
    /** Argument that created this order */
    readonly arg: OrderCreationArg;
    /** Price given by the AMM */
    readonly price: number;
    /** Guaranteed price given the AMM */
    readonly guaranteedPrice: number;
    /** How much of the spent token will be spent */
    readonly spentQty: HexNumber;
}

export const ZERO_ADDRESS: HexString = '0x0000000000000000000000000000000000000000';
export const NATIVE_TOKEN: HexString = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
