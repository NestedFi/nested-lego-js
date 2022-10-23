import 'mocha';
import { expect, assert } from 'chai';
import { CanAddTokensOperation, connect, HexString, INestedContracts } from '../lib';
import {
    native_token,
    poly_dai,
    poly_sushi,
    poly_usdc,
    testConfig,
    TEST_AGGREGATORS,
    TEST_SLIPPAGE,
} from './test-utils';
import { BigNumber } from '@ethersproject/bignumber';
import { logExec } from './test-provider';
import { addFees } from '../lib/utils';

for (const aggregator of TEST_AGGREGATORS) {
    describe(`Modify (using ${aggregator ?? 'all'})`, () => {
        let instance: INestedContracts;
        let id: HexString;
        let sushiQty: BigNumber;
        let daiQty: BigNumber;
        beforeEach(async () => {
            instance = await connect({
                ...testConfig(),
                onlyUseAggregators: aggregator ? [aggregator] : undefined,
            });

            console.log('📐 Creating a portfolio...');
            // Create a portfolio with 2 tokens in it
            const ptf = instance.createPortfolio(poly_usdc.contract);
            await ptf.addToken(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
            await ptf.addToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
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

        it('can add native token from wallet', async () => {
            const ptf = instance.addTokensToPortfolio(id, native_token.contract);
            await ptf.addToken(native_token.contract, TEST_SLIPPAGE).setInputAmount(native_token.smallAmount);
            await approve(ptf);
            await ptf.execute();
        });

        it('can add token from native token', async () => {
            const ptf = instance.addTokensToPortfolio(id, native_token.contract);
            await ptf.addToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(native_token.smallAmount);
            await approve(ptf);
            await ptf.execute();
        });

        it('can add token from random token', async () => {
            const ptf = instance.addTokensToPortfolio(id, poly_usdc.contract);
            await ptf.addToken(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(poly_usdc.smallAmount);
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

        async function getHoldings() {
            const records = await instance.tools.recordsContract();
            const holdings = (await records.tokenHoldings(id)) as [HexString[], BigNumber[]];
            return holdings[0].map((token, i) => ({
                token: token.toLowerCase() as HexString,
                qty: holdings[1][i],
            }));
        }
        async function getHolding(token: HexString) {
            const holdings = await getHoldings();
            return holdings.find(x => x.token === token);
        }
        async function checkNoDusts(token: HexString) {
            const holding = await getHolding(token);
            assert.notExists(holding?.qty, 'should have no dust left');
        }

        it('can swap a the whole qty of a token', async () => {
            // sell 100% of our dai for usdc
            const ptf = instance.swapSingleToMulti(id, poly_dai.contract);
            await ptf.swapTo(poly_sushi.contract, TEST_SLIPPAGE).setInputAmount(daiQty);
            await ptf.execute();

            // check that nothing is left
            await checkNoDusts(poly_dai.contract);
        });

        it('can does not leave any dusts', async () => {
            // 10_031 corresponds to an amount that used to leave dusts in the porfolio
            const amt = 10_031;
            const add = instance.addTokensToPortfolio(id, poly_usdc.contract);
            await add.addToken(poly_usdc.contract, 0).setInputAmount(addFees(BigNumber.from(amt), BigNumber.from(30)));
            await add.execute();

            // check that added precisely the amount that will leave dusts after swap
            const added = await getHolding(poly_usdc.contract);
            expect(added?.qty.toNumber()).to.equal(amt);

            // sell 100% of our usdc for dai
            const ptf = instance.swapSingleToMulti(id, poly_usdc.contract);
            await ptf.swapTo(poly_dai.contract, TEST_SLIPPAGE).setInputAmount(BigNumber.from(daiQty));
            await ptf.execute();

            // check that nothing is left
            await checkNoDusts(poly_usdc.contract);
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
        });

        it('can withdraw budget', async () => {
            const adder = await instance.withdrawFromPortfolio(
                id,
                poly_usdc.contract,
                BigNumber.from(poly_usdc.smallAmount),
                0.3,
            );
            const receipt = await adder.execute();
        });
    });
}
