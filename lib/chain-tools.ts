import { BigNumber, BigNumberish, Contract, getDefaultProvider, Signer, utils } from 'ethers';
import { BaseProvider } from '@ethersproject/providers';
import { Chain, HexNumber, HexString, INestedContracts, NestedTools } from './public-types';
import { ERC20_ABI } from './default-contracts';
import { normalize } from './utils';

const decimals = new Map<string, Promise<number>>();

export class ChainTools implements NestedTools {
    get chain() {
        return this.parent.chain;
    }

    constructor(
        readonly parent: INestedContracts,
        private provider: BaseProvider,
        readonly factoryInterface: utils.Interface,
        readonly factoryContract: Contract,
    ) {}

    getErc20Decimals(erc20: HexString): Promise<number> {
        const key = `${this.chain}:${normalize(erc20)}`;
        if (decimals.has(key)) {
            return decimals.get(key)!;
        }
        const get = (async () => {
            try {
                return await new Contract(erc20, ERC20_ABI, this.provider).decimals();
            } catch (e) {
                // remove promise from cache (to re-run it when we have network back)
                decimals.delete(key);
                throw e;
            }
        })();
        decimals.set(key, get);
        return get;
    }

    async toTokenAmount(token: HexString, amount: BigNumberish): Promise<BigNumber> {
        if (typeof amount !== 'number') {
            return BigNumber.from(amount);
        }
        const decimals = await this.getErc20Decimals(token);
        return utils.parseUnits(amount.toString(), decimals);
    }

    async balanceOf(token: HexString): Promise<HexNumber> {
        const user = await this.parent.signer.getAddress();
        const contract = await new Contract(token, ERC20_ABI, this.provider);
        const balance = (await contract.balanceOf(user)) as BigNumber;
        return balance.toHexString() as HexNumber;
    }
}
