import { BigNumber, BigNumberish, Contract, providers, Signer, utils } from 'ethers';
import { CreatePortfolioResult, HexNumber, HexString, NestedTools, NftEventType } from './public-types';
import { ERC20_ABI } from './default-contracts';
import { checkHasSigner, lazy, normalize, wrap } from './utils';
import { Chain, ZeroExFetcher, ZeroExRequest, ZeroXAnswer } from '.';
import recordsAbi from './nested-records.json';
import { defaultZeroExFetcher } from './0x';

const decimals = new Map<string, Promise<number>>();

export class ChainTools implements NestedTools {
    recordsContract = lazy(async () => {
        const recordsAddress = await this.factoryContract.nestedRecords();
        return new Contract(recordsAddress, recordsAbi, this.provider);
    });

    constructor(
        readonly chain: Chain,
        private signer: Signer | undefined,
        readonly provider: providers.Provider,
        readonly factoryInterface: utils.Interface,
        readonly factoryContract: Contract,
        readonly _fetch0xSwap: ZeroExFetcher | undefined,
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

    async balanceOf(token: HexString): Promise<BigNumber> {
        const user = await checkHasSigner(this.signer).getAddress();
        const contract = await new Contract(token, ERC20_ABI, this.provider);
        const balance = (await contract.balanceOf(user)) as BigNumber;
        return balance;
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

    fetch0xSwap(request: ZeroExRequest): Promise<ZeroXAnswer> {
        if (!this._fetch0xSwap) {
            return defaultZeroExFetcher(request);
        }
        return this._fetch0xSwap(request);
    }
}
