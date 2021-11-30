import 'mocha';
import { expect, assert } from 'chai';
import { CanAddTokensOperation, Chain, connect, HexNumber, HexString, INestedContracts } from '../lib';
import { native_token, poly_sushi, poly_usdc, testConfig, TEST_SLIPPAGE } from './test-utils';
import { BigNumber } from '@ethersproject/bignumber';

describe('Modify', () => {
    let instance: INestedContracts;
    let id: HexString;
    before(async () => {
        instance = await connect(await testConfig());

        console.log('📐 Creating a portfolio...');
        // Create a portfolio with 2 tokens in it
        const ptf = instance.createPortfolio(poly_usdc.contract);
        await ptf.addToken(poly_sushi.contract, poly_usdc.smallAmount, TEST_SLIPPAGE);
        await ptf.addToken(native_token.contract, poly_usdc.smallAmount, TEST_SLIPPAGE);
        await approve(ptf);
        const { idInChain } = await ptf.execute();
        assert.isString(idInChain);
        id = idInChain;
        console.log('👉 Starting test...');
    });

    async function approve(add: CanAddTokensOperation) {
        if (!(await add.isApproved())) {
            console.log('🔃 Approving USDC...');
            await add.approve();
            console.log('✅ Approved USDC.');
        }
    }

    it('can add token from wallet', async () => {
        const ptf = instance.addTokensToPortfolio(id, native_token.contract);
        await ptf.addToken(poly_usdc.contract, native_token.smallAmount, TEST_SLIPPAGE);
        await approve(ptf);
        await ptf.execute();
    });

    it('can swap a single token to multiple tokens (intra-nft)', async () => {
        // spend half of MATIC we have in the ptf to some USDC
        const ptf = instance.swapSingleToMulti(id, native_token.contract);
        await ptf.swapTo(
            poly_usdc.contract,
            // only convert half of the ptf MATIC
            BigNumber.from(native_token.smallAmount).div(2),
            TEST_SLIPPAGE,
        );
        await ptf.execute();
    });

    it('can swap multiple tokens to a single token (intra-nft)', async () => {
        // spend halof of SUSHI & MATIC we have to some USDC
        const ptf = instance.swapMultiToSingle(id, poly_usdc.contract);
        await ptf.swapFrom(
            poly_sushi.contract,
            // only convert half of the ptf SUSHI
            BigNumber.from(poly_sushi.smallAmount).div(2),
            TEST_SLIPPAGE,
        );
        await ptf.swapFrom(
            native_token.contract,
            // only convert half of the ptf SUSHI
            BigNumber.from(native_token.smallAmount).div(2),
            TEST_SLIPPAGE,
        );
        await ptf.execute();
    });

    it('can liquidate a portfolio', async () => {
        const liquidator = instance.liquidateToWalletAndDestroy(id, poly_usdc.contract, 0.3);
        await liquidator.refreshAssets();
        await liquidator.execute();
    });

    it('can sell some token to portfolio (to erc20)', async () => {
        const seller = instance.sellTokensToWallet(id, poly_usdc.contract);
        await seller.sellToken(
            poly_sushi.contract,
            // only convert half of the ptf
            BigNumber.from(poly_sushi.smallAmount).div(2),
            TEST_SLIPPAGE,
        );
        await seller.sellToken(
            native_token.contract,
            // only convert half of the ptf
            BigNumber.from(native_token.smallAmount).div(2),
            TEST_SLIPPAGE,
        );
        await seller.execute();
    });

    it('can sell some token to portfolio (to native)', async () => {
        const seller = instance.sellTokensToWallet(id, native_token.contract);
        await seller.sellToken(
            poly_sushi.contract,
            // only convert half of the ptf
            BigNumber.from(poly_sushi.smallAmount).div(2),
            TEST_SLIPPAGE,
        );
        await seller.sellToken(
            native_token.contract,
            // only convert half of the ptf
            BigNumber.from(native_token.smallAmount).div(2),
            TEST_SLIPPAGE,
        );
        await seller.execute();
    });
});
