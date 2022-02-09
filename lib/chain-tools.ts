import { BigNumber, BigNumberish, Contract, providers, Signer, utils } from 'ethers';
import { Chain, CreatePortfolioResult, HexString, NATIVE_TOKEN, NestedTools, NftEventType } from './public-types';
import { ERC20_ABI } from './default-contracts';
import { checkHasSigner, lazy, normalize, wrap } from './utils';
import { ZeroExFetcher, ZeroExRequest, ZeroXAnswer } from './0x-types';
import recordsAbi from './nested-records.json';
import feeSplitterAbi from './nested-fee-splitter.json';
import assetAbi from './nested-asset.json';
import { defaultZeroExFetcher } from './0x';

const decimals = new Map<string, Promise<number>>();

export class ChainTools implements NestedTools {
    readonly feeSplitterInterface: utils.Interface;
    readonly assetInterface: utils.Interface;

    recordsContract = lazy(async () => {
        const recordsAddress = await this.factoryContract.nestedRecords();
        return new Contract(recordsAddress, recordsAbi, this.provider);
    });

    feeSplitterContract = lazy(async () => {
        const recordsAddress = await this.factoryContract.feeSplitter();
        const ret = new Contract(recordsAddress, feeSplitterAbi, this.provider);
        return this.signer ? ret.connect(this.signer) : ret;
    });

    assetContract = lazy(async () => {
        const assetAddress = await this.factoryContract.nestedAsset();
        const ret = new Contract(assetAddress, assetAbi, this.provider);
        return this.signer ? ret.connect(this.signer) : ret;
    });

    constructor(
        readonly chain: Chain,
        private signer: Signer | undefined,
        readonly provider: providers.Provider,
        readonly factoryInterface: utils.Interface,
        readonly factoryContract: Contract,
        readonly _fetch0xSwap: ZeroExFetcher | undefined,
        readonly nestedFinanceApi: string,
        readonly nestedFinanceUi: string,
    ) {
        this.feeSplitterInterface = new utils.Interface(feeSplitterAbi);
        this.assetInterface = new utils.Interface(assetAbi);
    }

    getErc20Decimals(erc20: HexString): Promise<number> {
        erc20 = normalize(erc20);
        // native token has 18 decimals
        if (erc20 === NATIVE_TOKEN) {
            return Promise.resolve(18);
        }

        // else, fetch from cache/contract
        const key = `${this.chain}:${erc20}`;
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
        token = normalize(token);
        // for native token, get the native balance
        if (token === NATIVE_TOKEN) {
            return await checkHasSigner(this.signer).getBalance();
        }

        // else, call contract
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
            privateUrl: `${this.nestedFinanceUi}/portfolios/${this.chain}:${nftId.toNumber()}`,
            publicUrl: `${this.nestedFinanceUi}/explorer/${this.chain}:${nftId.toNumber()}`,
            receipt,
        };
    }

    fetch0xSwap(request: ZeroExRequest): Promise<ZeroXAnswer> {
        const toFetch: ZeroExRequest = {
            ...request,
            buyToken: wrap(this.chain, request.buyToken),
            spendToken: wrap(this.chain, request.spendToken),
        };
        if (!this._fetch0xSwap) {
            return defaultZeroExFetcher(toFetch);
        }
        return this._fetch0xSwap(toFetch);
    }
}
