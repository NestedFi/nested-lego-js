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
import { newSession, ISession, toUint, U256 } from 'evm-js-emulator';
import {
    ERC20,
    execWatchInstructions,
    KNOWN_CONTRACT,
    newTxData,
    transferUsdcTo,
} from 'evm-js-emulator/tests/test-utils';
import { dumpU256, parseBuffer, to0xAddress } from 'evm-js-emulator/src/utils';
import { poly_sushi, poly_usdc } from './test-utils';
import { Contract, utils } from 'ethers';
import factoryAbi from '../lib/nested-factory.json';

let _logExec = false;
export function logExec() {
    _logExec = true;
}
export class TestProvider extends Provider {
    private session: ISession;
    constructor(private userAddress: string, private factoryContract: string) {
        super();
        _logExec = false;
        this.session = newSession({
            rpcUrl: process.env.POLY_RPC_URL,
            contractsNames: {
                [defaultContracts.poly.factoryAddress!]: 'factory_proxy',
                [factoryContract]: 'factory_proxy',
                [poly_usdc.contract]: { name: 'USDC', abi: ERC20 },
                [poly_sushi.contract]: { name: 'Sushi', abi: ERC20 },

                ['0x319acbcbf087f0ee74e5feffa10567c7d83f7683']: 'ZeroExOperator',
                ['0x692cc1d1f14799fca1d22e4d9155081075fa7c31']: 'factory',
                ['0xdd9185db084f5c4fff3b4f70e7ba62123b812226']: {
                    name: 'usdc_administrable',
                    abi: new utils.Interface(usdc_administrable),
                },
                ['0x33aa21aa1ad5d6cae3c713de407b97f4b47321a3']: {
                    name: 'TransformERC20Feature',
                    abi: new utils.Interface(transformErc20feature),
                },
            },
        });
    }

    async fetchNames() {
        const factory = new Contract(this.factoryContract, factoryAbi, this);
        const asset = await factory.nestedAsset();
        const records = await factory.nestedRecords();
        const feeSplitter = await factory.feeSplitter();
        const reserve = await factory.reserve();
        const resolver = await factory.resolver();
        const weth = await factory.weth();
        this.session.addNames({
            [records]: 'records',
            [asset]: 'assets',
            [feeSplitter]: 'feeSplitter',
            [reserve]: 'reserve',
            [resolver]: 'resolver',
            [weth]: 'weth',
        });
    }

    async sendTransaction(signedTransaction: string | Promise<string>): Promise<TransactionResponse> {
        const tx = (await signedTransaction) as any;
        const exec = await this.session.prepareCall(
            newTxData(toUint(tx.to), {
                calldata: parseBuffer(tx.data),
                origin: toUint(tx.from ?? this.userAddress),
                callvalue: tx.value ? toUint(tx.value.toHexString()) : U256(0),
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
                        topics: l.topics.map(t => '0x' + dumpU256(t).padStart(64, '0')),
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
            chainId: defaultContracts.poly.chainId!,
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

const usdc_administrable = [
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'address', 'name': 'owner', 'type': 'address' },
            { 'indexed': true, 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'indexed': false, 'internalType': 'uint256', 'name': 'value', 'type': 'uint256' },
        ],
        'name': 'Approval',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'address', 'name': 'authorizer', 'type': 'address' },
            { 'indexed': true, 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
        ],
        'name': 'AuthorizationCanceled',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'address', 'name': 'authorizer', 'type': 'address' },
            { 'indexed': true, 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
        ],
        'name': 'AuthorizationUsed',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [{ 'indexed': true, 'internalType': 'address', 'name': 'account', 'type': 'address' }],
        'name': 'Blacklisted',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': false, 'internalType': 'address', 'name': 'userAddress', 'type': 'address' },
            { 'indexed': false, 'internalType': 'address payable', 'name': 'relayerAddress', 'type': 'address' },
            { 'indexed': false, 'internalType': 'bytes', 'name': 'functionSignature', 'type': 'bytes' },
        ],
        'name': 'MetaTransactionExecuted',
        'type': 'event',
    },
    { 'anonymous': false, 'inputs': [], 'name': 'Pause', 'type': 'event' },
    {
        'anonymous': false,
        'inputs': [{ 'indexed': true, 'internalType': 'address', 'name': 'newRescuer', 'type': 'address' }],
        'name': 'RescuerChanged',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'indexed': true, 'internalType': 'bytes32', 'name': 'previousAdminRole', 'type': 'bytes32' },
            { 'indexed': true, 'internalType': 'bytes32', 'name': 'newAdminRole', 'type': 'bytes32' },
        ],
        'name': 'RoleAdminChanged',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'indexed': true, 'internalType': 'address', 'name': 'account', 'type': 'address' },
            { 'indexed': true, 'internalType': 'address', 'name': 'sender', 'type': 'address' },
        ],
        'name': 'RoleGranted',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'indexed': true, 'internalType': 'address', 'name': 'account', 'type': 'address' },
            { 'indexed': true, 'internalType': 'address', 'name': 'sender', 'type': 'address' },
        ],
        'name': 'RoleRevoked',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'address', 'name': 'from', 'type': 'address' },
            { 'indexed': true, 'internalType': 'address', 'name': 'to', 'type': 'address' },
            { 'indexed': false, 'internalType': 'uint256', 'name': 'value', 'type': 'uint256' },
        ],
        'name': 'Transfer',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [{ 'indexed': true, 'internalType': 'address', 'name': 'account', 'type': 'address' }],
        'name': 'UnBlacklisted',
        'type': 'event',
    },
    { 'anonymous': false, 'inputs': [], 'name': 'Unpause', 'type': 'event' },
    {
        'inputs': [],
        'name': 'APPROVE_WITH_AUTHORIZATION_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'BLACKLISTER_ROLE',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'CANCEL_AUTHORIZATION_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'DECREASE_ALLOWANCE_WITH_AUTHORIZATION_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'DEFAULT_ADMIN_ROLE',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'DEPOSITOR_ROLE',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'DOMAIN_SEPARATOR',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'EIP712_VERSION',
        'outputs': [{ 'internalType': 'string', 'name': '', 'type': 'string' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'INCREASE_ALLOWANCE_WITH_AUTHORIZATION_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'META_TRANSACTION_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'PAUSER_ROLE',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'PERMIT_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'RESCUER_ROLE',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'TRANSFER_WITH_AUTHORIZATION_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'WITHDRAW_WITH_AUTHORIZATION_TYPEHASH',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'owner', 'type': 'address' },
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
        ],
        'name': 'allowance',
        'outputs': [{ 'internalType': 'uint256', 'name': '', 'type': 'uint256' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'amount', 'type': 'uint256' },
        ],
        'name': 'approve',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'owner', 'type': 'address' },
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'value', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validAfter', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validBefore', 'type': 'uint256' },
            { 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
            { 'internalType': 'uint8', 'name': 'v', 'type': 'uint8' },
            { 'internalType': 'bytes32', 'name': 'r', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 's', 'type': 'bytes32' },
        ],
        'name': 'approveWithAuthorization',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'authorizer', 'type': 'address' },
            { 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
        ],
        'name': 'authorizationState',
        'outputs': [{ 'internalType': 'enum GasAbstraction.AuthorizationState', 'name': '', 'type': 'uint8' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'account', 'type': 'address' }],
        'name': 'balanceOf',
        'outputs': [{ 'internalType': 'uint256', 'name': '', 'type': 'uint256' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'account', 'type': 'address' }],
        'name': 'blacklist',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'blacklisters',
        'outputs': [{ 'internalType': 'address[]', 'name': '', 'type': 'address[]' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'authorizer', 'type': 'address' },
            { 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
            { 'internalType': 'uint8', 'name': 'v', 'type': 'uint8' },
            { 'internalType': 'bytes32', 'name': 'r', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 's', 'type': 'bytes32' },
        ],
        'name': 'cancelAuthorization',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'decimals',
        'outputs': [{ 'internalType': 'uint8', 'name': '', 'type': 'uint8' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'subtractedValue', 'type': 'uint256' },
        ],
        'name': 'decreaseAllowance',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'owner', 'type': 'address' },
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'decrement', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validAfter', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validBefore', 'type': 'uint256' },
            { 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
            { 'internalType': 'uint8', 'name': 'v', 'type': 'uint8' },
            { 'internalType': 'bytes32', 'name': 'r', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 's', 'type': 'bytes32' },
        ],
        'name': 'decreaseAllowanceWithAuthorization',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'user', 'type': 'address' },
            { 'internalType': 'bytes', 'name': 'depositData', 'type': 'bytes' },
        ],
        'name': 'deposit',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'userAddress', 'type': 'address' },
            { 'internalType': 'bytes', 'name': 'functionSignature', 'type': 'bytes' },
            { 'internalType': 'bytes32', 'name': 'sigR', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 'sigS', 'type': 'bytes32' },
            { 'internalType': 'uint8', 'name': 'sigV', 'type': 'uint8' },
        ],
        'name': 'executeMetaTransaction',
        'outputs': [{ 'internalType': 'bytes', 'name': '', 'type': 'bytes' }],
        'stateMutability': 'payable',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' }],
        'name': 'getRoleAdmin',
        'outputs': [{ 'internalType': 'bytes32', 'name': '', 'type': 'bytes32' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'internalType': 'uint256', 'name': 'index', 'type': 'uint256' },
        ],
        'name': 'getRoleMember',
        'outputs': [{ 'internalType': 'address', 'name': '', 'type': 'address' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' }],
        'name': 'getRoleMemberCount',
        'outputs': [{ 'internalType': 'uint256', 'name': '', 'type': 'uint256' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'internalType': 'address', 'name': 'account', 'type': 'address' },
        ],
        'name': 'grantRole',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'internalType': 'address', 'name': 'account', 'type': 'address' },
        ],
        'name': 'hasRole',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'addedValue', 'type': 'uint256' },
        ],
        'name': 'increaseAllowance',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'owner', 'type': 'address' },
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'increment', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validAfter', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validBefore', 'type': 'uint256' },
            { 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
            { 'internalType': 'uint8', 'name': 'v', 'type': 'uint8' },
            { 'internalType': 'bytes32', 'name': 'r', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 's', 'type': 'bytes32' },
        ],
        'name': 'increaseAllowanceWithAuthorization',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'string', 'name': 'newName', 'type': 'string' },
            { 'internalType': 'string', 'name': 'newSymbol', 'type': 'string' },
            { 'internalType': 'uint8', 'name': 'newDecimals', 'type': 'uint8' },
            { 'internalType': 'address', 'name': 'childChainManager', 'type': 'address' },
        ],
        'name': 'initialize',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'initialized',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'account', 'type': 'address' }],
        'name': 'isBlacklisted',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'name',
        'outputs': [{ 'internalType': 'string', 'name': '', 'type': 'string' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'owner', 'type': 'address' }],
        'name': 'nonces',
        'outputs': [{ 'internalType': 'uint256', 'name': '', 'type': 'uint256' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    { 'inputs': [], 'name': 'pause', 'outputs': [], 'stateMutability': 'nonpayable', 'type': 'function' },
    {
        'inputs': [],
        'name': 'paused',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'pausers',
        'outputs': [{ 'internalType': 'address[]', 'name': '', 'type': 'address[]' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'owner', 'type': 'address' },
            { 'internalType': 'address', 'name': 'spender', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'value', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'deadline', 'type': 'uint256' },
            { 'internalType': 'uint8', 'name': 'v', 'type': 'uint8' },
            { 'internalType': 'bytes32', 'name': 'r', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 's', 'type': 'bytes32' },
        ],
        'name': 'permit',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'internalType': 'address', 'name': 'account', 'type': 'address' },
        ],
        'name': 'renounceRole',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'contract IERC20', 'name': 'tokenContract', 'type': 'address' },
            { 'internalType': 'address', 'name': 'to', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'amount', 'type': 'uint256' },
        ],
        'name': 'rescueERC20',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'rescuers',
        'outputs': [{ 'internalType': 'address[]', 'name': '', 'type': 'address[]' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'bytes32', 'name': 'role', 'type': 'bytes32' },
            { 'internalType': 'address', 'name': 'account', 'type': 'address' },
        ],
        'name': 'revokeRole',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'symbol',
        'outputs': [{ 'internalType': 'string', 'name': '', 'type': 'string' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'totalSupply',
        'outputs': [{ 'internalType': 'uint256', 'name': '', 'type': 'uint256' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'recipient', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'amount', 'type': 'uint256' },
        ],
        'name': 'transfer',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'sender', 'type': 'address' },
            { 'internalType': 'address', 'name': 'recipient', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'amount', 'type': 'uint256' },
        ],
        'name': 'transferFrom',
        'outputs': [{ 'internalType': 'bool', 'name': '', 'type': 'bool' }],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'from', 'type': 'address' },
            { 'internalType': 'address', 'name': 'to', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'value', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validAfter', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validBefore', 'type': 'uint256' },
            { 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
            { 'internalType': 'uint8', 'name': 'v', 'type': 'uint8' },
            { 'internalType': 'bytes32', 'name': 'r', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 's', 'type': 'bytes32' },
        ],
        'name': 'transferWithAuthorization',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'account', 'type': 'address' }],
        'name': 'unBlacklist',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    { 'inputs': [], 'name': 'unpause', 'outputs': [], 'stateMutability': 'nonpayable', 'type': 'function' },
    {
        'inputs': [
            { 'internalType': 'string', 'name': 'newName', 'type': 'string' },
            { 'internalType': 'string', 'name': 'newSymbol', 'type': 'string' },
        ],
        'name': 'updateMetadata',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'uint256', 'name': 'amount', 'type': 'uint256' }],
        'name': 'withdraw',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'address', 'name': 'owner', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'value', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validAfter', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'validBefore', 'type': 'uint256' },
            { 'internalType': 'bytes32', 'name': 'nonce', 'type': 'bytes32' },
            { 'internalType': 'uint8', 'name': 'v', 'type': 'uint8' },
            { 'internalType': 'bytes32', 'name': 'r', 'type': 'bytes32' },
            { 'internalType': 'bytes32', 'name': 's', 'type': 'bytes32' },
        ],
        'name': 'withdrawWithAuthorization',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
];

const transformErc20feature = [
    {
        'anonymous': false,
        'inputs': [{ 'indexed': false, 'internalType': 'address', 'name': 'quoteSigner', 'type': 'address' }],
        'name': 'QuoteSignerUpdated',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [
            { 'indexed': true, 'internalType': 'address', 'name': 'taker', 'type': 'address' },
            { 'indexed': false, 'internalType': 'address', 'name': 'inputToken', 'type': 'address' },
            { 'indexed': false, 'internalType': 'address', 'name': 'outputToken', 'type': 'address' },
            { 'indexed': false, 'internalType': 'uint256', 'name': 'inputTokenAmount', 'type': 'uint256' },
            { 'indexed': false, 'internalType': 'uint256', 'name': 'outputTokenAmount', 'type': 'uint256' },
        ],
        'name': 'TransformedERC20',
        'type': 'event',
    },
    {
        'anonymous': false,
        'inputs': [{ 'indexed': false, 'internalType': 'address', 'name': 'transformerDeployer', 'type': 'address' }],
        'name': 'TransformerDeployerUpdated',
        'type': 'event',
    },
    {
        'inputs': [],
        'name': 'FEATURE_NAME',
        'outputs': [{ 'internalType': 'string', 'name': '', 'type': 'string' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'FEATURE_VERSION',
        'outputs': [{ 'internalType': 'uint256', 'name': '', 'type': 'uint256' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [
            {
                'components': [
                    { 'internalType': 'address payable', 'name': 'taker', 'type': 'address' },
                    { 'internalType': 'contract IERC20TokenV06', 'name': 'inputToken', 'type': 'address' },
                    { 'internalType': 'contract IERC20TokenV06', 'name': 'outputToken', 'type': 'address' },
                    { 'internalType': 'uint256', 'name': 'inputTokenAmount', 'type': 'uint256' },
                    { 'internalType': 'uint256', 'name': 'minOutputTokenAmount', 'type': 'uint256' },
                    {
                        'components': [
                            { 'internalType': 'uint32', 'name': 'deploymentNonce', 'type': 'uint32' },
                            { 'internalType': 'bytes', 'name': 'data', 'type': 'bytes' },
                        ],
                        'internalType': 'struct ITransformERC20Feature.Transformation[]',
                        'name': 'transformations',
                        'type': 'tuple[]',
                    },
                    { 'internalType': 'bool', 'name': 'useSelfBalance', 'type': 'bool' },
                    { 'internalType': 'address payable', 'name': 'recipient', 'type': 'address' },
                ],
                'internalType': 'struct ITransformERC20Feature.TransformERC20Args',
                'name': 'args',
                'type': 'tuple',
            },
        ],
        'name': '_transformERC20',
        'outputs': [{ 'internalType': 'uint256', 'name': 'outputTokenAmount', 'type': 'uint256' }],
        'stateMutability': 'payable',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'createTransformWallet',
        'outputs': [{ 'internalType': 'contract IFlashWallet', 'name': 'wallet', 'type': 'address' }],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'getQuoteSigner',
        'outputs': [{ 'internalType': 'address', 'name': 'signer', 'type': 'address' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'getTransformWallet',
        'outputs': [{ 'internalType': 'contract IFlashWallet', 'name': 'wallet', 'type': 'address' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [],
        'name': 'getTransformerDeployer',
        'outputs': [{ 'internalType': 'address', 'name': 'deployer', 'type': 'address' }],
        'stateMutability': 'view',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'transformerDeployer', 'type': 'address' }],
        'name': 'migrate',
        'outputs': [{ 'internalType': 'bytes4', 'name': 'success', 'type': 'bytes4' }],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'quoteSigner', 'type': 'address' }],
        'name': 'setQuoteSigner',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [{ 'internalType': 'address', 'name': 'transformerDeployer', 'type': 'address' }],
        'name': 'setTransformerDeployer',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'contract IERC20TokenV06', 'name': 'inputToken', 'type': 'address' },
            { 'internalType': 'contract IERC20TokenV06', 'name': 'outputToken', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'inputTokenAmount', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'minOutputTokenAmount', 'type': 'uint256' },
            {
                'components': [
                    { 'internalType': 'uint32', 'name': 'deploymentNonce', 'type': 'uint32' },
                    { 'internalType': 'bytes', 'name': 'data', 'type': 'bytes' },
                ],
                'internalType': 'struct ITransformERC20Feature.Transformation[]',
                'name': 'transformations',
                'type': 'tuple[]',
            },
        ],
        'name': 'transformERC20',
        'outputs': [{ 'internalType': 'uint256', 'name': 'outputTokenAmount', 'type': 'uint256' }],
        'stateMutability': 'payable',
        'type': 'function',
    },
    {
        'inputs': [
            { 'internalType': 'contract IERC20TokenV06', 'name': 'inputToken', 'type': 'address' },
            { 'internalType': 'contract IERC20TokenV06', 'name': 'outputToken', 'type': 'address' },
            { 'internalType': 'uint256', 'name': 'inputTokenAmount', 'type': 'uint256' },
            { 'internalType': 'uint256', 'name': 'minOutputTokenAmount', 'type': 'uint256' },
            {
                'components': [
                    { 'internalType': 'uint32', 'name': 'deploymentNonce', 'type': 'uint32' },
                    { 'internalType': 'bytes', 'name': 'data', 'type': 'bytes' },
                ],
                'internalType': 'struct ITransformERC20Feature.Transformation[]',
                'name': 'transformations',
                'type': 'tuple[]',
            },
        ],
        'name': 'transformERC20Staging',
        'outputs': [{ 'internalType': 'uint256', 'name': 'outputTokenAmount', 'type': 'uint256' }],
        'stateMutability': 'payable',
        'type': 'function',
    },
];
