import { BigNumber } from 'ethers';
import { _HasOrder, _TokenOrder } from './internal-types';
import { PortfolioTokenAdderBase } from './porfolio-token-adder';
import {
    CallData,
    CreatePortfolioMetadata,
    CreatePortfolioResult,
    HexString,
    NATIVE_TOKEN,
    PortfolioCreator,
} from './public-types';
import fetch from 'node-fetch';

export class PortfolioCreatorImpl extends PortfolioTokenAdderBase implements PortfolioCreator {
    metadata?: CreatePortfolioMetadata;

    buildCallData(): CallData {
        const total = this.totalBudget;
        return {
            to: this.parent.tools.factoryContract.address as HexString,
            data: this.parent.tools.factoryInterface.encodeFunctionData('create', [
                this.metadata?.originalPortfolioId ?? 0,
                this.spentToken,
                total,
                this._ordersData,
            ]) as HexString,
            // compute how much native token we need as input:
            value: this.spentToken === NATIVE_TOKEN ? total : BigNumber.from(0),
        };
    }

    async attachMetadataToTransaction(transactionHash: HexString): Promise<void> {
        if (!this.metadata?.name && !this.metadata?.tags) {
            return;
        }
        const response = await fetch(this.parent.tools.nestedFinanceApi + '/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: `mutation SetTempMeta($tx: ChainAddress!, $meta: NftMetaInput!) {
                    setMetadata(meta: $meta, tx: $tx)
                  }`,
                variables: {
                    meta: {
                        name: this.metadata.name ?? '',
                        tags: this.metadata?.tags ?? [],
                    },
                    tx: `${this.parent.chain}:${transactionHash}`,
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

    async execute(): Promise<CreatePortfolioResult> {
        // perform the actual transaction
        const callData = this.buildCallData();
        const tx = await this.parent.signer.sendTransaction(callData);
        await this.attachMetadataToTransaction(tx.hash as HexString);
        const receipt = await tx.wait();
        return this.parent.tools.readTransactionLogs(receipt, 'NftCreated');
    }
}
