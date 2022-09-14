import {
    Block,
    BlockTag,
    BlockWithTransactions,
    EventType,
    Filter,
    Listener,
    Log,
    Provider,
    TransactionReceipt,
    TransactionRequest,
    TransactionResponse,
} from '@ethersproject/abstract-provider';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { Network } from '@ethersproject/networks';
import { Deferrable } from '@ethersproject/properties';
import { ConnectionConfig, defaultContracts } from '../lib/default-contracts';
import { newSession, ISession, toUint } from 'evm-js-emulator';
import { execWatchInstructions, newTxData, transferUsdcTo } from 'evm-js-emulator/tests/test-utils';
import { dumpU256, parseBuffer, to0xAddress } from 'evm-js-emulator/src/utils';

let _logExec = false;
export function logExec() {
    _logExec = true;
}
export class TestProvider extends Provider {
    private session: ISession;
    private cfg: ConnectionConfig;
    constructor(private userAddress: string) {
        super();
        _logExec = false;
        this.cfg = defaultContracts.poly;
        this.session = newSession({
            rpcUrl: process.env.POLY_RPC_URL,
        });
    }
    async sendTransaction(signedTransaction: string | Promise<string>): Promise<TransactionResponse> {
        const tx = (await signedTransaction) as any;
        const exec = await this.session.prepareCall(
            newTxData(toUint(tx.to), {
                calldata: parseBuffer(tx.data),
                origin: toUint(tx.from ?? this.userAddress),
            }),
        );
        await execWatchInstructions(exec, !_logExec);
        return {
            hash: 'fake hash',
            nonce: 123,
            gasLimit: BigNumber.from(0),
            data: tx.data,
            value: tx.value,
            from: tx.from,

            confirmations: 0,
            chainId: 0,
            wait: async (): Promise<TransactionReceipt> => {
                return {
                    blockHash: 'fake block hash',
                    to: tx.to,
                    from: tx.from,
                    contractAddress: tx.to,
                    transactionIndex: 0,
                    gasUsed: BigNumber.from(0),
                    logsBloom: 'fake bloom',
                    transactionHash: 'fake hash',
                    logs: exec.logs.map<Log>((l, i) => ({
                        address: to0xAddress(l.address),
                        blockHash: 'fake block hask',
                        blockNumber: 0,
                        data: '0x' + Buffer.from([...l.data]).toString('hex'),
                        topics: l.topics.map(t => '0x' + dumpU256(t)),
                        transactionIndex: 0,
                        transactionHash: 'fake tx hash',
                        logIndex: i,
                        removed: false,
                    })),
                    blockNumber: 0,
                    confirmations: 0,
                    cumulativeGasUsed: BigNumber.from(0),
                    effectiveGasPrice: BigNumber.from(0),
                    byzantium: true,
                    type: 0,
                };
            },
        };
    }
    async getNetwork(): Promise<Network> {
        return {
            chainId: this.cfg.chainId!,
            name: 'Polygon',
        };
    }

    async call(transaction: Deferrable<TransactionRequest>, blockTag?: BlockTag | Promise<BlockTag>): Promise<string> {
        if (blockTag) {
            throw new Error('not supported: block tag');
        }
        const tx: TransactionRequest = Object.fromEntries(
            await Promise.all(
                Object.entries(transaction).map(([k, v]) =>
                    (async () => {
                        const vConst = await v;
                        return [k, vConst] as const;
                    })(),
                ),
            ),
        );
        const exec = await this.session.prepareStaticCall(tx.to as any, tx.data?.toString() as any, 0xffff);
        const result = await execWatchInstructions(exec, !_logExec);
        return '0x' + Buffer.from([...(result ?? [])]).toString('hex');
    }

    async estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
        return BigNumber.from(0xfffffffff);
    }
    async getBlockNumber(): Promise<number> {
        return 1234;
    }
    async getGasPrice(): Promise<BigNumber> {
        return BigNumber.from('50000000000');
    }
    getBalance(addressOrName: string | Promise<string>, blockTag?: BlockTag | Promise<BlockTag>): Promise<BigNumber> {
        throw new Error('Method not implemented.');
    }
    getTransactionCount(
        addressOrName: string | Promise<string>,
        blockTag?: BlockTag | Promise<BlockTag>,
    ): Promise<number> {
        throw new Error('Method not implemented.');
    }
    getCode(addressOrName: string | Promise<string>, blockTag?: BlockTag | Promise<BlockTag>): Promise<string> {
        throw new Error('Method not implemented.');
    }
    getStorageAt(
        addressOrName: string | Promise<string>,
        position: BigNumberish | Promise<BigNumberish>,
        blockTag?: BlockTag | Promise<BlockTag>,
    ): Promise<string> {
        throw new Error('Method not implemented.');
    }
    async getBlock(blockHashOrBlockTag: BlockTag | Promise<BlockTag>): Promise<Block> {
        return {
            hash: 'X',
            parentHash: 'X',
            number: 123,

            timestamp: 123,
            nonce: 'fake nonce',
            difficulty: 123,
            _difficulty: BigNumber.from(123),

            gasLimit: BigNumber.from(0xfffffffffffff),
            gasUsed: BigNumber.from(0xffff),

            miner: 'fake miner',
            extraData: '',

            baseFeePerGas: BigNumber.from('2500000000'),
            transactions: [],
        };
    }
    getBlockWithTransactions(blockHashOrBlockTag: BlockTag | Promise<BlockTag>): Promise<BlockWithTransactions> {
        throw new Error('Method not implemented.');
    }
    getTransaction(transactionHash: string): Promise<TransactionResponse> {
        throw new Error('Method not implemented.');
    }
    getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt> {
        throw new Error('Method not implemented.');
    }
    getLogs(filter: Filter): Promise<Log[]> {
        throw new Error('Method not implemented.');
    }
    async resolveName(name: string | Promise<string>): Promise<string | null> {
        const n = await name;
        if (/^0x[a-fA-F\d]{40}$/.test(n)) {
            return n;
        }
        return null; // no resolver
    }
    lookupAddress(address: string | Promise<string>): Promise<string | null> {
        throw new Error('Method not implemented.');
    }
    on(eventName: EventType, listener: Listener): Provider {
        throw new Error('Method not implemented.');
    }
    once(eventName: EventType, listener: Listener): Provider {
        throw new Error('Method not implemented.');
    }
    emit(eventName: EventType, ...args: any[]): boolean {
        throw new Error('Method not implemented.');
    }
    listenerCount(eventName?: EventType): number {
        throw new Error('Method not implemented.');
    }
    listeners(eventName?: EventType): Listener[] {
        throw new Error('Method not implemented.');
    }
    off(eventName: EventType, listener?: Listener): Provider {
        throw new Error('Method not implemented.');
    }
    removeAllListeners(eventName?: EventType): Provider {
        throw new Error('Method not implemented.');
    }
    waitForTransaction(transactionHash: string, confirmations?: number, timeout?: number): Promise<TransactionReceipt> {
        throw new Error('Method not implemented.');
    }
}
