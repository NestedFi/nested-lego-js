import { BigNumber } from 'ethers';
import { _HasOrder, _TokenOrder } from './internal-types';
import { PortfolioTokenAdderBase } from './porfolio-token-adder';
import {
    CallData,
    CreatePortfolioMetadata,
    CreatePortfolioResult,
    ExecOptions,
    HexString,
    NATIVE_TOKEN,
    PorfolioMetadata,
    PortfolioCreator,
} from './public-types';
import fetch from 'node-fetch';
import { as, BatchedInputOrders, inferNftId, safeMult } from './utils';

export class PortfolioCreatorImpl extends PortfolioTokenAdderBase implements PortfolioCreator {
    metadata?: CreatePortfolioMetadata;

    setMetadata(meta: PorfolioMetadata): void {
        if (meta.tags) {
            if (meta.tags.length > 3) {
                throw new Error('Too many tags (max 3)');
            }
            if (meta.tags.some(t => t.length < 2)) {
                throw new Error('Tag too short (min 2 characters)');
            }
            if (meta.tags.find(t => t.length > 14)) {
                throw new Error('Tag too long (max 14 characters)');
            }
        }
        if (meta.name?.trim()) {
            if (meta.name.length < 3) {
                throw new Error('Name too short (min 3 characters)');
            }
            if (meta.name.length > 24) {
                throw new Error('Name too long (max 24 characters)');
            }
        }
        this.metadata = {
            ...(this.metadata ?? {}),
            ...meta,
        };
    }

    buildCallData(): CallData {
        const total = this.totalBudget;
        const idOrNull = this.metadata?.originalPortfolioId;
        const originalId = idOrNull ? inferNftId(idOrNull, this.parent.chain) : 0;
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('create', [
                originalId,
                // todo: allow multiple inputs on creations
                [
                    as<BatchedInputOrders>({
                        inputToken: this.spentToken,
                        amount: total,
                        orders: this._ordersData,
                        fromReserve: false,
                    }),
                ],
            ]) as HexString,
            // compute how much native token we need as input:
            value: this.spentToken === NATIVE_TOKEN ? total : BigNumber.from(0),
        };
    }

    async attachMetadataToTransaction(
        transactionHash: HexString,
        from: HexString,
        transactionNonce: number,
    ): Promise<void> {
        if (!this.metadata?.name && !this.metadata?.tags) {
            return;
        }
        const response = await fetch(this.parent.tools.nestedFinanceApi + '/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: `mutation SetTempMeta($tx: ChainAddress!, $meta: NftMetaInput!, $owner: ChainAddress!, $nonce: Int!) {
                    setMetadata(meta: $meta, tx: $tx, owner: $owner, nonce: $nonce)
                  }`,
                variables: {
                    meta: {
                        name: this.metadata.name ?? '',
                        tags: this.metadata?.tags ?? [],
                    },
                    tx: `${this.parent.chain}:${transactionHash}`,
                    owner: `${this.parent.chain}:${from}`,
                    nonce: transactionNonce,
                },
            }),
        });
        let details = 'unkown error';
        try {
            details = await response.text();
        } catch (e) {
            // ignore
        }
        if (!response.ok) {
            throw new Error(`Failed to attach metadata to transaction: ${response.statusText}: ${details}`);
        }
    }

    async execute(options?: ExecOptions): Promise<CreatePortfolioResult> {
        // perform the actual transaction
        const callData = this.buildCallData();
        await this.parent.tools.prepareCalldata(callData, options);
        const tx = await this.parent.signer.sendTransaction(callData);
        await this.attachMetadataToTransaction(tx.hash as HexString, tx.from as HexString, tx.nonce as number);
        const receipt = await tx.wait();
        return this.parent.tools.readTransactionLogs(receipt, 'NftCreated');
    }
}
