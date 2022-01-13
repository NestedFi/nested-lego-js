import { ContractReceipt } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { HexString, PorfolioSender } from '.';
import { CallData, INestedContracts } from './public-types';

export class PorfolioSenderImpl implements PorfolioSender {
    constructor(
        private parent: INestedContracts,
        private from: HexString | null | undefined,
        private to: HexString,
        private nftId: BigNumber,
    ) {}

    async buildCallData(): Promise<CallData> {
        const assets = await this.parent.tools.assetContract();
        const from = this.from ?? ((await this.parent.signer.getAddress()) as HexString);
        return {
            to: assets.address as HexString,
            data: this.parent.tools.assetInterface.encodeFunctionData('transferFrom', [
                from,
                this.to,
                this.nftId,
            ]) as HexString,
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
