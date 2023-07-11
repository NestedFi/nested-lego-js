import { BigNumber } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';
import { ParaSwap, SwapSide } from '@paraswap/sdk';
import { OptimalRate } from 'paraswap-core';
import { defaultContracts } from './default-contracts';
import { AggregatorQuoteResponse, AggregatorRequest } from './dex-aggregator-types';
import { ParaSwapAnswer } from './paraswap-types';
import { Chain, HexString, QuoteErrorReasons, QuoteFailedError } from './public-types';
import { safeMult } from './utils';
import { APIError } from '@paraswap/sdk/dist/legacy';
import fetch from 'node-fetch';

export async function defaultParaSwapFetcher(config: AggregatorRequest): Promise<ParaSwapAnswer | null> {
    switch (config.chain) {
        case Chain.celo:
        case Chain.ftm:
        case Chain.opti:
            return null;
    }

    const networkId = defaultContracts[config.chain].chainId as 1 | 56 | 137 | 43114;

    const paraSwap = new ParaSwap({
        chainId: networkId,
        fetch: fetch as any,
    });
    let amount = 'spendQty' in config ? config.spendQty : config.boughtQty;
    const swapSide = 'spendQty' in config ? SwapSide.SELL : SwapSide.BUY;
    const priceRoute: OptimalRate | APIError = await paraSwap.getRate(
        config.spendToken,
        config.buyToken,
        amount.toString(),
        config.userAddress,
        swapSide,
        { excludeDEXS: ['0x'], partner: 'nested' },
        config.spendTokenDecimals,
        config.buyTokenDecimals,
    );
    if ('message' in priceRoute) {
        if (priceRoute.message === 'No routes found with enough liquidity') {
            throw new QuoteFailedError(QuoteErrorReasons.INSUFFICIENT_ASSET_LIQUIDITY);
        }
        throw new Error(`Failed to fetch ParaSwap quote: ${priceRoute.message} (${priceRoute.status})`);
    }

    const srcAmount =
        swapSide === SwapSide.BUY
            ? safeMult(BigNumber.from(priceRoute.srcAmount), 1 + config.slippage)
            : priceRoute.srcAmount;
    const destAmount =
        swapSide === SwapSide.SELL
            ? safeMult(BigNumber.from(priceRoute.destAmount), 1 - config.slippage)
            : priceRoute.destAmount;

    const transaction = await paraSwap.buildTx(
        config.spendToken,
        config.buyToken,
        srcAmount.toString(),
        destAmount.toString(),
        priceRoute,
        config.userAddress,
        'nested.fi',
        undefined,
        undefined,
        undefined,
        { ignoreChecks: true, ignoreGasEstimate: true, excludeDEXS: ['ParaSwapPool', 'ParaSwapLimitOrders'] },
        config.spendTokenDecimals,
        config.buyTokenDecimals,
    );

    if ('message' in transaction) {
        throw new Error(`Failed to fetch ParaSwap transaction: ${transaction.message} (${transaction.status})`);
    }
    return {
        priceRoute: priceRoute,
        transaction: transaction,
    };
}

// convert from the ParaSwap specific quote response to a more generic dex aggregator response type
export function paraSwapRespToQuoteResp(answer: ParaSwapAnswer): AggregatorQuoteResponse {
    const priceImpact = parseFloat(answer.priceRoute.srcUSD) / parseFloat(answer.priceRoute.destUSD) - 1;
    const price = BigNumber.from(answer.priceRoute.destAmount)
        .mul(BigNumber.from(10).pow(answer.priceRoute.srcDecimals))
        .div(BigNumber.from(answer.priceRoute.srcAmount));

    return {
        aggregator: 'Paraswap',
        chainId: answer.priceRoute.network,
        price: formatUnits(price, answer.priceRoute.destDecimals),
        to: answer.transaction.to as HexString,
        data: answer.transaction.data as HexString,
        value: answer.transaction.value,
        protocolFee: answer.priceRoute.partnerFee.toString(),
        buyTokenAddress: answer.priceRoute.destToken as HexString,
        sellTokenAddress: answer.priceRoute.srcToken as HexString,
        buyAmount: answer.priceRoute.destAmount,
        sellAmount: answer.priceRoute.srcAmount,
        allowanceTarget: answer.priceRoute.tokenTransferProxy as HexString,
        estimatedPriceImpact: priceImpact.toString(),
        guaranteedPrice: '0',
    };
}
