export enum Chain {
    eth = 'eth',
    bsc = 'bsc',
    rop = 'rop',
    avax = 'avax',
    poly = 'poly',
}
export type HexString = `0x${string}`;
export type HexNumber = `${'' | '-'}${HexString}`;

export type SwapArgument = {
    readonly spendToken: HexString;
    readonly buyToken: HexString;
    /** Accepted slippage (ex: '0.03' means 3% slippage accepted) */
    readonly slippage: number;
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
     * Prepare a swap.
     * Returns a data structure that you will have to pass to various other methods, like `createPortfolio
     */
    prepareSwap(swap: SwapArgument): Promise<SwapOrder>;

    /**
     * Creates a portfolio.
     * - Only one budget token allowed for all swap orders
     * - The nested contracts must have an allowance on budget token (see .approve() & .requiresApproval() methods)
     */
    createPortfolio(swaps: SwapOrder[], metadata?: CreatePortfolioMetadata): Promise<CreatePortfolioResult>;

    /** Returns your balance of the given ERC20 token (helper function) */
    balanceOf(tokenAddress: HexString): Promise<HexNumber>;

    /** Tells if the Nested contracts have an allowance to use the given token as an input budget */
    isApproved(spentToken: HexString, amount: HexNumber): Promise<boolean>;

    /** Approve the Nested contracts to spent the given input budget  */
    approve(spentToken: HexString, amount?: HexNumber): Promise<void>;
}

export interface CreatePortfolioResult {
    /** A porfolio identifier, unique accross all chains (identifier used by Nested.finance to identify porfolios)  */
    id: `${Chain}:${number}`;
    /** The portfolio ID (unique in the given chain) */
    idInChain: HexString;
    /** The chain this porfolio is on (just as a reminder) */
    chain: Chain;
    /** A private URL that can be used to display this porfolio on Nested.finance (requires to be connected with the owner's wallet) */
    privateUrl: string;
    /** A public URL that can be used to show off this porfolio on Nested.finance */
    publicUrl: string;
}

export interface SwapOrder {
    /** Argument that created this swap order */
    readonly arg: SwapArgument;
    /** Price given by the AMM */
    readonly price: number;
    /** Guaranteed price given the AMM */
    readonly guaranteedPrice: number;
    /** How much of the spent token will be spent */
    readonly spentQty: HexNumber;
}

export const ZERO_ADDRESS: HexString = '0x0000000000000000000000000000000000000000';
export const NATIVE_TOKEN: HexString = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
