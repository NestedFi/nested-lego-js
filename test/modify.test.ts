import 'mocha';
import { expect, assert } from 'chai';
import { CanAddTokensOperation, Chain, connect, HexNumber, HexString, INestedContracts } from '../lib';
import { native_token, poly_dai, poly_sushi, poly_usdc, testConfig, TEST_SLIPPAGE } from './test-utils';
import { BigNumber } from '@ethersproject/bignumber';
import { logExec } from './test-provider';

describe('Modify', () => {
    let instance: INestedContracts;
    let id: HexString;
    let sushiQty: BigNumber;
    let daiQty: BigNumber;
    beforeEach(async () => {
        instance = await connect(testConfig());

        console.log('📐 Creating a portfolio...');
        // Create a portfolio with 2 tokens in it
        const ptf = instance.createPortfolio(native_token.contract);
        await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(native_token.smallAmount);
        await ptf.addToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(native_token.smallAmount);
        await approve(ptf);
        const { idInChain } = await ptf.execute();
        assert.isString(idInChain);
        id = idInChain;
        console.log(`👉 Created ptf ${id}...`);
        const assets = await instance.getAssets(id);
        sushiQty = assets.find(x => x.token === poly_sushi.contract)!.amount;
        daiQty = assets.find(x => x.token === poly_dai.contract)!.amount;
        console.log(`👉 Starting test on ptf ${id}...`);
    });

    async function approve(add: CanAddTokensOperation) {
        if (!(await add.isApproved())) {
            console.log('🔃 Approving USDC...');
            await add.approve();
            console.log('✅ Approved USDC.');
        }
    }

    it('can add token from wallet', async () => {
        const ptf = instance.addTokensToPortfolio(id, poly_dai.contract);
        await ptf.addToken(poly_usdc.contract, TEST_SLIPPAGE).setInputAmount(poly_dai.smallAmount);
        await approve(ptf);
        await ptf.execute();
    });

    it('can swap a single token to multiple tokens (intra-nft)', async () => {
        // spend half of MATIC we have in the ptf to some USDC
        const ptf = instance.swapSingleToMulti(id, poly_dai.contract);
        await ptf.swapTo(poly_usdc.contract, TEST_SLIPPAGE).setInputAmount(
            // only convert half of the ptf MATIC
            daiQty.div(2),
        );
        await ptf.execute();
    });

    it('can swap a single token to multiple tokens with output budget (intra-nft)', async () => {
        // spend half of MATIC we have in the ptf to some USDC
        const ptf = instance.swapSingleToMulti(id, poly_dai.contract);
        await ptf.swapTo(poly_sushi.contract, TEST_SLIPPAGE).setOutputAmount(
            // very small amount of (wont fail unless sushi becomes HUGE)
            BigNumber.from(poly_sushi.smallAmount).div(1000),
        );
        await ptf.execute();
    });

    it('can swap multiple tokens to a single token (intra-nft)', async () => {
        // spend halof of SUSHI & MATIC we have to some USDC
        const ptf = instance.swapMultiToSingle(id, poly_usdc.contract);
        await ptf.swapFrom(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(
            // only convert half of the ptf SUSHI
            sushiQty.div(2),
        );
        await ptf.swapFrom(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(
            // only convert half of the ptf MATIC
            daiQty.div(2),
        );
        await ptf.execute();
    });

    it('can liquidate a portfolio to erc20', async () => {
        const liquidator = instance.liquidateToWalletAndDestroy(id, poly_usdc.contract, 0.3);
        await liquidator.refreshAssets();
        await liquidator.execute();
    });

    it('can liquidate a portfolio to native', async () => {
        const liquidator = instance.liquidateToWalletAndDestroy(id, native_token.contract, 0.3);
        await liquidator.refreshAssets();
        await liquidator.execute();
    });

    it('can sell some token to portfolio (to erc20)', async () => {
        const seller = instance.sellTokensToWallet(id, poly_usdc.contract);
        await seller.sellToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(
            // only convert half of the ptf
            sushiQty.div(2),
        );
        await seller.sellToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(
            // only convert half of the ptf
            daiQty.div(2),
        );
        await seller.execute();
    });

    it('can sell some token to portfolio (to native)', async () => {
        const seller = instance.sellTokensToWallet(id, native_token.contract);
        await seller.sellToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(
            // only convert half of the ptf
            sushiQty.div(2),
        );
        await seller.sellToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(
            // only convert half of the ptf
            daiQty.div(2),
        );
        await seller.execute();
    });

    it('can sell native token to wallet', async () => {
        const seller = instance.sellTokensToWallet(id, native_token.contract);
        await seller.sellToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(daiQty.div(2));
        await seller.execute();
    });

    it('can deposit budget', async () => {
        const adder = await instance.depositToPorfolio(id, native_token.contract, native_token.smallAmount, 0.3);
        const receipt = await adder.execute();
        console.log(receipt.transactionHash);
    });

    it('can withdraw budget', async () => {
        const adder = await instance.withdrawFromPortfolio(
            id,
            poly_usdc.contract,
            BigNumber.from(poly_usdc.smallAmount),
            0.3,
        );
        const receipt = await adder.execute();
        console.log(receipt.transactionHash);
    });
});
