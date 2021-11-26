import { BigNumber, ContractTransaction } from 'ethers';
import { _HasOrder, _TokenOrder } from './internal-types';
import { PorfolioTokenAdderBase } from './porfolio-token-adder';
import {
    CreatePortfolioMetadata,
    CreatePortfolioResult,
    HexString,
    NATIVE_TOKEN,
    PorfolioCreator,
} from './public-types';

export class PorfolioCreatorImpl extends PorfolioTokenAdderBase implements PorfolioCreator {
    metadata?: CreatePortfolioMetadata;

    async execute(): Promise<CreatePortfolioResult> {
        // check that we know the NftCreated event
        const int = this.tools.factoryInterface;
        const createdTopic = int.getEventTopic(int.getEvent('NftCreated'));

        // perform the actual transaction
        const total = this.totalBudget;
        const tx: ContractTransaction = await this.tools.factoryContract.create(
            this.metadata?.originalPortfolioId ?? 0,
            this.spentToken,
            total,
            this._ordersData,
            {
                // compute how much native token we need as input:
                value: this.spentToken === NATIVE_TOKEN ? total : 0,
            },
        );
        const receipt = await tx.wait();

        // lookup for the NFT id by reading the transaction logs
        const createdEventLog = receipt.logs.find(x => x.topics.includes(createdTopic));
        const nftId = createdEventLog && (int.parseLog(createdEventLog).args.nftId as BigNumber);
        if (!nftId) {
            // should not happen, as long as the contract emits NftCreated event.
            throw new Error('The portfolio transaction has succeeded, but the resulting NFT id cannot be determined');
        }

        return {
            id: `${this.parent.chain}:${nftId.toNumber()}`,
            idInChain: nftId.toHexString() as HexString,
            chain: this.parent.chain,
            privateUrl: `https://app.nested.finance/portfolios/${this.parent.chain}:${nftId.toNumber()}`,
            publicUrl: `https://app.nested.finance/explorer/${this.parent.chain}:${nftId.toNumber()}`,
            receipt,
        };
    }
}
