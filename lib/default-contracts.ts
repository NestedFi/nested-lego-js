import type { Networkish } from '@ethersproject/networks';
import type { Chain, HexString } from './public-types';

export interface ConnectionConfig {
    providerConfig: Networkish;
    wrappedToken: HexString | null;
    factoryAddress: HexString | null;
    chainId: number | null;
}

/** Last version of the nested factory that has been deployed */
export const defaultContracts: { [key in keyof typeof Chain]: ConnectionConfig } = {
    eth: {
        providerConfig: 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
        factoryAddress: '0xE24c8123c8054fB9E8C53496948C34Ea59914cdF',
        wrappedToken: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        chainId: 1,
    },
    bsc: {
        providerConfig: 'https://bsc-dataseed.binance.org/',
        factoryAddress: '0x9A065e500CDCd01c0a506B0EB1A8B060B0cE1379',
        wrappedToken: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
        chainId: 56,
    },
    avax: {
        providerConfig: 'https://api.avax.network/ext/bc/C/rpc',
        factoryAddress: '0x9A065e500CDCd01c0a506B0EB1A8B060B0cE1379',
        wrappedToken: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
        chainId: 43114,
    },
    poly: {
        providerConfig: 'https://polygon-rpc.com',
        factoryAddress: '0xFD896DB057f260aDCe7FD1fD48C6623E023406CD',
        wrappedToken: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
        chainId: 137,
    },
    opti: {
        providerConfig: 'https://mainnet.optimism.io',
        factoryAddress: '0x9A065e500CDCd01c0a506B0EB1A8B060B0cE1379',
        wrappedToken: '0x4200000000000000000000000000000000000006',
        chainId: 10,
    },
    arbi: {
        providerConfig: 'https://arb1.arbitrum.io/rpc',
        factoryAddress: null, // TODO ARBI SUPPORT
        wrappedToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        chainId: 42161,
    },
    ftm: {
        providerConfig: 'https://rpcapi.fantom.network',
        factoryAddress: null,
        wrappedToken: '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83',
        chainId: 250,
    },
    celo: {
        providerConfig: 'https://forno.celo.org',
        factoryAddress: null,
        wrappedToken: '0x471ece3750da237f93b8e339c536989b8978a438',
        chainId: 42220,
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
