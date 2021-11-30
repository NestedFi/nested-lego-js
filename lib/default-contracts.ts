import { Networkish } from '@ethersproject/networks';
import { Chain, HexString } from './public-types';

export interface ConnectionConfig {
    providerConfig: Networkish;
    wrappedToken: HexString | null;
    factoryAddress: HexString | null;
    chainId: number | null;
}

export const FIXED_FEE = 0.01;

/** Last version of the nested factory that has been deployed */
export const defaultContracts: { [key in keyof typeof Chain]: ConnectionConfig } = {
    eth: {
        providerConfig: 'homestead',
        factoryAddress: null,
        wrappedToken: null,
        chainId: null,
    },
    bsc: {
        providerConfig: 'https://bsc-dataseed.binance.org/',
        factoryAddress: null,
        wrappedToken: null,
        chainId: null,
    },
    avax: {
        providerConfig: 'https://api.avax.network/ext/bc/C/rpc', // chain 43114
        factoryAddress: null,
        wrappedToken: null,
        chainId: null,
    },
    poly: {
        providerConfig: 'https://polygon-rpc.com', // chain 137
        factoryAddress: '0xfEDc04397A9cd49f48815DF2D3b991C0c6398A96',
        wrappedToken: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
        chainId: 137,
    },
    // Ropsten config
    rop: {
        providerConfig: 'ropsten',
        factoryAddress: null,
        wrappedToken: null,
        chainId: null,
    },
};

export const chainByChainId: Record<number, Chain> = Object.fromEntries(
    Object.entries(defaultContracts)
        .filter(([_, { chainId }]) => !!chainId)
        .map(([chain, { chainId }]) => [chainId, chain]),
);

export const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address _owner) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];
