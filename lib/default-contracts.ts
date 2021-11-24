import { Networkish } from '@ethersproject/networks';
import { Chain, HexString } from './public-types';

interface ConnectionConfig {
    providerConfig: Networkish;
    factoryAddress: HexString | null;
}

export const FIXED_FEE = 0.01;

/** Last version of the nested factory that has been deployed */
export const defaultContracts: { [key in keyof typeof Chain]: ConnectionConfig } = {
    eth: {
        providerConfig: 'homestead',
        factoryAddress: null!,
    },
    bsc: {
        providerConfig: 'https://bsc-dataseed.binance.org/',
        factoryAddress: null,
    },
    avax: {
        providerConfig: 'https://api.avax.network/ext/bc/C/rpc', // chain 43114
        factoryAddress: null,
    },
    poly: {
        providerConfig: 'https://polygon-rpc.com', // chain 137
        factoryAddress: '0x5FAAb0e08A93BFA3f6b4bB681bE2377dB3f431Af',
    },
    // Ropsten config
    rop: {
        providerConfig: 'ropsten',
        factoryAddress: null,
    },
};
