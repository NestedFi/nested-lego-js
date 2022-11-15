import { BigNumber, BigNumberish, constants, Contract, ContractTransaction, providers, Signer, utils } from 'ethers';
import {
    CallData,
    Chain,
    CreatePortfolioResult,
    ExecOptions,
    GenericCallData,
    HexString,
    NATIVE_TOKEN,
    NestedTools,
    NftEventType,
} from './public-types';
import { ERC20_ABI } from './default-contracts';
import { checkHasSigner, lazy, normalize, safeMult, wrap } from './utils';
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

    feesRates = lazy(async () => {
        const entryFees = (await this.factoryContract.entryFees()).toNumber() / 10000;
        const exitFees = (await this.factoryContract.exitFees()).toNumber() / 10000;
        return { entry: entryFees, exit: exitFees };
    });

    private _tokensAnon = new Map<HexString, Contract>();
    private _tokensSigned = new Map<HexString, Contract>();

    constructor(
        readonly chain: Chain,
        private signer: Signer | undefined,
        readonly provider: providers.Provider,
        readonly factoryInterface: utils.Interface,
        readonly factoryContract: Contract,
        readonly _fetch0xSwap: ZeroExFetcher | undefined,
        readonly _zeroExUrl: ((chain: Chain) => string) | undefined,
        readonly nestedFinanceApi: string,
        readonly nestedFinanceUi: string,
    ) {
        this.feeSplitterInterface = new utils.Interface(feeSplitterAbi);
        this.assetInterface = new utils.Interface(assetAbi);
    }

    private tokenContract(token: HexString, signed: boolean) {
        token = normalize(token);
        const col = signed ? this._tokensSigned : this._tokensAnon;
        if (col.has(token)) {
            return col.get(token)!;
        }
        const ret = new Contract(token, ERC20_ABI, signed ? this.signer : this.provider);
        col.set(token, ret);
        return ret;
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
                return await this.tokenContract(erc20, false).decimals();
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
        const balance = (await this.tokenContract(token, false).balanceOf(user)) as BigNumber;
        return balance;
    }

    async factoryAllowance(ofUser: HexString, forToken: HexString): Promise<BigNumber> {
        forToken = normalize(forToken);
        if (forToken === NATIVE_TOKEN) {
            return constants.MaxUint256;
        }
        const contract = this.tokenContract(forToken, true);
        const allowance = await contract.allowance(ofUser, this.factoryContract.address);
        return allowance;
    }

    async approve(token: HexString, amount?: BigNumberish): Promise<ContractTransaction> {
        token = normalize(token);
        const toApprove = amount ? await this.toTokenAmount(token, amount) : constants.MaxUint256;
        const contract = this.tokenContract(token, true);
        const gasOpts = await this.estimateGas({
            to: token,
            data: contract.interface.encodeFunctionData('approve', [
                this.factoryContract.address,
                toApprove,
            ]) as HexString,
        });
        return await contract.approve(this.factoryContract.address, toApprove, gasOpts);
    }

    async prepareCalldata(callData: CallData, options?: ExecOptions): Promise<void> {
        const { gasLimit, gasPrice } = await this.estimateGas(callData, options);
        callData.gasLimit = gasLimit;
        callData.gasPrice = gasPrice;
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
            return defaultZeroExFetcher(toFetch, this._zeroExUrl);
        }
        return this._fetch0xSwap(toFetch);
    }

    async estimateGas(callData: GenericCallData, options?: ExecOptions): Promise<ExecOptions> {
        const signer = await checkHasSigner(this.signer);
        let gasLimit: BigNumber | undefined = undefined;
        if (options?.gasLimit) {
            gasLimit = options.gasLimit;
        } else {
            try {
                gasLimit = await (await checkHasSigner(this.signer)).estimateGas(callData);
                gasLimit = await signer.estimateGas(callData);
                // increase gas limit by 10%
                gasLimit = safeMult(gasLimit, 1.1);
            } catch (e) {
                console.warn('Failed to estimate gas limit');
                console.warn('Failed to estimate gas limit', e);
            }
        }
        let gasPrice: BigNumber | undefined = undefined;
        if (options?.gasPrice) {
            gasPrice = options.gasPrice;
        } else {
            try {
                gasPrice = await (await checkHasSigner(this.signer)).getGasPrice();
                gasPrice = await signer.getGasPrice();
            } catch (e) {
                // MagicLink specific logic: "for a transaction on Optimism, the gas price should be hard-coded to 15000000"
                // https://magic.link/posts/magic-optimism#connecting-to-ethereum-optimism
                if (this.chain === Chain.opti) {
                    console.warn('Failed to estimate gas price, using default value.');
                    gasPrice = BigNumber.from(15000000);
                } else {
                    console.warn('Failed to estimate gas price');
                    console.warn('Failed to estimate gas price', e);
                }
            }
        }
        return { gasLimit, gasPrice: gasPrice };
    }
}
