import { chainByChainId } from './default-contracts';
import { Chain } from './public-types';

export function inferChainFromId(chainId: number): Chain {
    const chain = chainByChainId[chainId];
    if (!chain) {
        throw new Error(`Invalid connection config: Unsupported chain ${chainId}`);
    }
    return chain;
}
