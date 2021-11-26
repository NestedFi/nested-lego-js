import { HexString } from '.';
import { Chain, INestedContracts } from './public-types';
import * as ethers from 'ethers';
import { Networkish } from '@ethersproject/networks';
import { defaultContracts } from './default-contracts';
import { NestedContractsInstance } from './contracts-instance';
import factoryAbi from './nested-factory.json';
import { ChainTools } from './chain-tools';

export interface NestedConnection {
    /** Which chain are we connecting to ? */
    chain: Chain;
    /** Specific a version of Nested factory contract */
    contract?: HexString;
    /** Who will sign the transactions ? (required if you plan to perform transactions) */
    signer?: ethers.Signer;
    /** (optional) specify how we should connect to the RPC network */
    network?: Networkish;
    /** (optional) specify an already built provider to connect to the network */
    provider?: ethers.providers.Provider;
}

export function connect(_opts: NestedConnection): INestedContracts {
    let { chain, factoryAddress, provider, signer } = normalizeConfig(_opts);

    // build contracts
    let nestedFactory = new ethers.Contract(factoryAddress, factoryAbi, provider);
    const nestedFactoryInterface = new ethers.utils.Interface(factoryAbi);

    // connect signer
    if (signer) {
        signer = signer.connect(provider);
        nestedFactory = nestedFactory.connect(signer);
    }

    // return instance
    const tools = new ChainTools(chain, signer, provider, nestedFactoryInterface, nestedFactory);
    return new NestedContractsInstance(chain, tools, signer);
}

function normalizeConfig(_opts: NestedConnection): {
    factoryAddress: HexString;
    chain: Chain;
    signer?: ethers.Signer;
    provider: ethers.providers.Provider;
} {
    const cfg = defaultContracts[_opts.chain];
    const factoryAddress = _opts.contract ?? cfg.factoryAddress;
    if (!cfg || !factoryAddress) {
        throw new Error('Cannot determine the contract to use');
    }

    return {
        chain: _opts.chain,
        signer: _opts.signer,
        factoryAddress,
        provider: _opts.provider ?? ethers.providers.getDefaultProvider(_opts.network ?? cfg.providerConfig),
    };
}
