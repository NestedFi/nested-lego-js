import { Networkish } from '@ethersproject/networks';
import { Chain, HexString } from './public-types';

interface ConnectionConfig {
    providerConfig: Networkish;
    wrappedToken: HexString | null;
    factoryAddress: HexString | null;
}

export const FIXED_FEE = 0.01;

/** Last version of the nested factory that has been deployed */
export const defaultContracts: { [key in keyof typeof Chain]: ConnectionConfig } = {
    eth: {
        providerConfig: 'homestead',
        factoryAddress: null,
        wrappedToken: null,
    },
    bsc: {
        providerConfig: 'https://bsc-dataseed.binance.org/',
        factoryAddress: null,
        wrappedToken: null,
    },
    avax: {
        providerConfig: 'https://api.avax.network/ext/bc/C/rpc', // chain 43114
        factoryAddress: null,
        wrappedToken: null,
    },
    poly: {
        providerConfig: 'https://polygon-rpc.com', // chain 137
        factoryAddress: '0x5FAAb0e08A93BFA3f6b4bB681bE2377dB3f431Af',
        wrappedToken: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
    },
    // Ropsten config
    rop: {
        providerConfig: 'ropsten',
        factoryAddress: null,
        wrappedToken: null,
    },
};

export const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address _owner) external view returns (uint256)',
    'function decimals() externals view returns (uint8)',
];
