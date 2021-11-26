import { BigNumber, BigNumberish, Contract, providers, Signer, utils } from 'ethers';
import { CreatePortfolioResult, HexNumber, HexString, NestedTools, NftEventType } from './public-types';
import { ERC20_ABI } from './default-contracts';
import { checkHasSigner, normalize } from './utils';
import { Chain } from '.';

const decimals = new Map<string, Promise<number>>();

export class ChainTools implements NestedTools {
    constructor(
        readonly chain: Chain,
        private signer: Signer | undefined,
        readonly provider: providers.Provider,
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
        const user = await checkHasSigner(this.signer).getAddress();
        const contract = await new Contract(token, ERC20_ABI, this.provider);
        const balance = (await contract.balanceOf(user)) as BigNumber;
        return balance.toHexString() as HexNumber;
    }

    /** Reads a transaction logs that has called NestedFactory.create */
    readTransactionLogs(receipt: providers.TransactionReceipt, operationType: NftEventType): CreatePortfolioResult {
        // lookup for the NFT id by reading the transaction logs
        // check that we know the NftCreated event
        const int = this.factoryInterface;
        const topic = int.getEventTopic(int.getEvent(operationType));
        const createdEventLog = receipt.logs.find(x => x.topics.includes(topic));
        const nftId = createdEventLog && (int.parseLog(createdEventLog).args.nftId as BigNumber);
        if (!nftId) {
            // should not happen, as long as the contract emits NftCreated event.
            throw new Error('The portfolio transaction has succeeded, but the resulting NFT id cannot be determined');
        }

        return {
            id: `${this.chain}:${nftId.toNumber()}`,
            idInChain: nftId.toHexString() as HexString,
            chain: this.chain,
            privateUrl: `https://app.nested.finance/portfolios/${this.chain}:${nftId.toNumber()}`,
            publicUrl: `https://app.nested.finance/explorer/${this.chain}:${nftId.toNumber()}`,
            receipt,
        };
    }
}
