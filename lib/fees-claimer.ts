import { ContractReceipt } from '@ethersproject/contracts';
import { HexString } from '.';
import { CallData, FeesClaimer, INestedContracts } from './public-types';
import { wrap } from './utils';

export class FeesClaimerImpl implements FeesClaimer {
    constructor(private parent: INestedContracts, readonly tokens: HexString[]) {
        const chain = this.parent.chain;
        this.tokens = [...new Set(tokens.map(x => wrap(chain, x)))];
    }

    async buildCallData(): Promise<CallData> {
        const feeSplitter = await this.parent.tools.feeSplitterContract();
        return {
            to: feeSplitter.address as HexString,
            data: this.parent.tools.feeSplitterInterface.encodeFunctionData('releaseTokens', this.tokens) as HexString,
        };
    }

    async execute(): Promise<ContractReceipt> {
        // actual transaction
        const callData = await this.buildCallData();
        const tx = await this.parent.signer.sendTransaction(callData);
        const receipt = await tx.wait();
        return receipt;
    }
}
