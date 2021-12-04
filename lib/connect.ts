import { HexString } from '.';
import { Chain, INestedContracts } from './public-types';
import * as ethers from 'ethers';
import { Networkish } from '@ethersproject/networks';
import { chainByChainId, ConnectionConfig, defaultContracts } from './default-contracts';
import { NestedContractsInstance } from './contracts-instance';
import factoryAbi from './nested-factory.json';
import { ChainTools } from './chain-tools';
import { unreachable } from './utils';
import { ZeroExFetcher } from './0x';

type AllKeys<T> = T extends unknown ? keyof T : never;
type Id<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;
type _ExclusifyUnion<T, K extends PropertyKey> = T extends unknown
    ? Id<T & Partial<Record<Exclude<K, keyof T>, never>>>
    : never;
type ExclusifyUnion<T> = _ExclusifyUnion<T, AllKeys<T>>;

export type NestedConnection = {
    /** Specific a version of Nested factory contract */
    contract?: HexString;
    /**
     * Provide a custom 0x fetcher (optional)
     *
     * nb: The default fetcher is rate-limited to avoid hitting 0x api limits, and implements a backoff retry policy (retries 3 times)
     */
    zeroExFetcher?: ZeroExFetcher;
    /** @deprecated Customize Nested Finance endpoint (for testing purposes only) */
    nestedFinanceApi?: string;
    /** @deprecated Customize Nested Finance endpoint (for testing purposes only) */
    nestedFinanceUi?: string;
} & (
    | {
          /** Which chain are we connecting to ? */
          chain: Chain;
          /**
           * (optional) Who will sign the transactions ? (required if you plan to perform transactions).
           * This signer will be connected to the provider that this library will build.
           */
          signer?: ethers.Signer;
      }
    | {
          /**
           * A signer that is already connected to the network provider you are targetting.
           * @example Wallet.fromMnemonic(words).connect(myProvider)
           */
          signer: ethers.Signer;
      }
    | {
          /** Specify an already built provider to connected to the right network */
          provider: ethers.providers.Provider;
      }
    | {
          /** Specify how we should connect to the RPC network (will result in an anonymous context) */
          network: Networkish;
      }
);

export async function connect(_opts: ExclusifyUnion<NestedConnection>): Promise<INestedContracts> {
    let { chain, factoryAddress, provider, signer, zeroExFetcher } = await readConfig(_opts);

    // build contracts
    let nestedFactory = new ethers.Contract(factoryAddress, factoryAbi, provider);
    const nestedFactoryInterface = new ethers.utils.Interface(factoryAbi);
    // connect signer
    if (signer) {
        nestedFactory = nestedFactory.connect(signer);
    }

    // return instance
    const tools = new ChainTools(
        chain,
        signer,
        provider,
        nestedFactoryInterface,
        nestedFactory,
        zeroExFetcher,
        _opts.nestedFinanceApi ?? 'https://api.nested.finance',
        _opts.nestedFinanceUi ?? 'https://app.nested.finance',
    );
    return new NestedContractsInstance(chain, tools, signer);
}

async function readConfig(_opts: NestedConnection): Promise<{
    factoryAddress: HexString;
    chain: Chain;
    zeroExFetcher?: ZeroExFetcher;
    signer?: ethers.Signer;
    provider: ethers.providers.Provider;
}> {
    let chain: Chain;
    let cfg: ConnectionConfig;
    let provider: ethers.providers.Provider;
    let signer: ethers.Signer | undefined;

    if ('chain' in _opts) {
        chain = _opts.chain;
        cfg = defaultContracts[_opts.chain];
        signer = _opts.signer;
        if (signer?.provider) {
            throw new Error('Signer must not have a provider when you provide a chain');
        }
        provider = ethers.providers.getDefaultProvider(cfg.providerConfig);
    } else {
        if ('signer' in _opts) {
            signer = _opts.signer;
            if (!signer.provider) {
                throw new Error(
                    'Invalid connection config: When using the "connect({ signer })" overload, you must provide a signer connected to a provider.',
                );
            }
            provider = signer.provider;
        } else if ('provider' in _opts) {
            provider = _opts.provider;
        } else if ('network' in _opts) {
            provider = ethers.providers.getDefaultProvider(_opts.network);
        } else {
            throw unreachable(_opts, 'Invalid connection config');
        }
        if (!provider) {
            throw new Error('Invalid connection config: Cannot determine provider.');
        }
        // infer chain from chain id
        const { chainId } = await provider.getNetwork();
        chain = chainByChainId[chainId];
        if (!chain) {
            throw new Error(`Invalid connection config: Unsupported chain ${chainId}`);
        }
        cfg = defaultContracts[chain];
    }

    const factoryAddress = _opts.contract ?? cfg?.factoryAddress;
    if (!cfg || !factoryAddress) {
        throw new Error('Invalid connection config: Cannot determine the contract to use');
    }

    return {
        chain,
        signer,
        factoryAddress,
        provider,
        zeroExFetcher: _opts.zeroExFetcher,
    } as const;
}
