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

    async execute(): Promise<CreatePortfolioResult> {
        // perform the actual transaction
        const callData = this.buildCallData();
        const tx = await this.parent.signer.sendTransaction(callData);
        const receipt = await tx.wait();
        return this.parent.tools.readTransactionLogs(receipt, 'NftCreated');
    }
}
