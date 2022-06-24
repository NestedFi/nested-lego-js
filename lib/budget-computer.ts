import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ZeroXAnswer } from './0x-types';
import { HexString, Holding, NestedTools, PortfolioSeller, PortfolioTokenAdder } from './public-types';
import { as, wrap } from './utils';

interface Price {
    /** How much budget... */
    pBudget: BigNumber;
    /** ...will give you how much token */
    pToken: BigNumber;
}

export async function computeDeposit(
    tools: NestedTools,
    adder: PortfolioTokenAdder,
    _currentHoldings: Holding[],
    addToken: HexString,
    _addBudget: BigNumberish,
    slippage: number,
) {
    // get budget amount to add as a bignumber
    const addBudget = await tools.toTokenAmount(addToken, _addBudget);

    // remove holdings that are 0 (just in case)
    const currentHoldings = _currentHoldings.filter(h => h.amount.gt(0));

    // fetch all prices, with maximimum price impact
    //  (as if we were gonna buy the whole budget for each token)
    const prices = await Promise.all(
        currentHoldings.map(h =>
            wrap(tools.chain, addToken) === wrap(tools.chain, h.token)
                ? as<Price>({
                      pBudget: addBudget,
                      pToken: addBudget,
                  })
                : tools
                      .fetchLowestQuote({
                          chain: tools.chain,
                          buyToken: h.token,
                          spendToken: addToken,
                          spendQty: addBudget,
                          slippage,
                      })
                      .then<Price>(r => ({
                          pBudget: BigNumber.from(r.sellAmount),
                          pToken: BigNumber.from(r.buyAmount),
                      })),
        ),
    );

    const budgets = computeBudgets(currentHoldings, prices, addBudget);

    // add all operations to perform
    await Promise.all(
        budgets.map((budget, i) => {
            if (budget.lte(0)) {
                return null;
            }
            const token = currentHoldings[i].token;
            return adder.addToken(token, slippage).setInputAmount(budget);
        }),
    );
    return adder;
}

export async function computeWithdrawal(
    tools: NestedTools,
    adder: PortfolioSeller,
    _currentHoldings: Holding[],
    withdrawToken: HexString,
    _withdrawAmt: BigNumberish,
    slippage: number,
) {
    // get budget amount to add as a bignumber
    const withdrawAmt = await tools.toTokenAmount(withdrawToken, _withdrawAmt);

    // remove holdings that are 0 (just in case)
    const currentHoldings = _currentHoldings.filter(h => h.amount.gt(0));

    // fetch all prices, with maximimum price impact
    //  (as if we were gonna buy the whole budget for each token)
    const prices = await Promise.all(
        currentHoldings.map(h =>
            wrap(tools.chain, withdrawToken) === wrap(tools.chain, h.token)
                ? as<Price>({
                      pBudget: withdrawAmt,
                      pToken: withdrawAmt,
                  })
                : tools
                      .fetchLowestQuote({
                          chain: tools.chain,
                          buyToken: withdrawToken,
                          spendToken: h.token,
                          boughtQty: withdrawAmt,
                          slippage,
                      })
                      .then<Price>(r => ({
                          pBudget: BigNumber.from(r.buyAmount),
                          pToken: BigNumber.from(r.sellAmount),
                      })),
        ),
    );

    // Lets use the same logic as in computeDeposit, but with negative values.
    // ... when you think about it, a withdrawal is just a deposit of negative amounts...
    const budgets = computeBudgets(currentHoldings, prices, negate(withdrawAmt));

    // add all operations to perform
    await Promise.all(
        budgets.map((budget, i) => {
            if (budget.gte(0)) {
                return null;
            }
            const token = currentHoldings[i].token;
            return adder.sellToken(token, slippage).setOutputAmount(negate(budget));
        }),
    );
    return adder;
}

function computeBudgets(currentHoldings: Holding[], prices: Price[], addBudget: BigNumber) {
    /*
        Just in case you're wondering where this simple formula comes from:
        We're trying to compute the amount of each token we'd need to buy to cover the budget,
        while keeping total token ratios constant.

           Below:
             - values with capital letters are vectors, lowercase are scalars.
             - "." is the scalar product.
             - "*" & "/" on two vectors in term-by-term multiplication/division
             - Before is the current holdings (before deposit)
             - After is the holdings, after deposit
             - Prices are token prices in budget units
                    (ex: if we have a budget of 1$, and we want to buy 1 sushi, then a price would be quoted in $/sushi)

        1) We know how our total budget 👉 budget = sum(Budgets)
        2) We're looking for 👉 ToBuy = After - Before
        3) Budgets can be expressed from qties to buy 👉 ToBuy * Prices = Budgets
        4) Or, as a scalar prodct, input budget is 👉 (After - Before) . Prices = budget
        5) We want constant ratios  👉 (1/ (After . Prices)) * After  = (1/(Before . Prices)) * Before
        6) Prices are computed from a preliminary 0x pricing run 👉 Prices = PricingBudget / PricingTokens

        Thus:
            Lets name "curValue = Before . Prices"
            (4)         => After . Prices = budget + curValue
            (5)         => After  = ((After . Prices) / curValue) * Before
                        => After = ((budget + curValue) / curValue) * Before
            (with 2)    => ToBuy =  ((budget + curValue) / curValue - 1) * Before
                        => ToBuy =  (budget / curValue) * Before
            (with 3)    => Budgets = (budget / curValue) * Before * Prices

            ... which is the formula we're using below, taking care to perform
             divisions as late as possible to avoid rounding errors,
             given that we're using bignumbers
             (which are integers)
             Meaning:

            (with 6)    => Budgets = budget * Before * PricingBudget / (curValue * PricingTokens)
    */

    const before = currentHoldings.map(h => h.amount);
    const curValue = toBudgetDotProduct(before, prices); // value, in budget units, of current holdings
    const budgets = before.map((b, i) => addBudget.mul(b).mul(prices[i].pBudget).div(prices[i].pToken.mul(curValue)));
    return budgets;
}

/** Dot product of a bignumber vector & a price vectors */
function toBudgetDotProduct(a: BigNumber[], b: Price[]): BigNumber {
    return a.reduce((acc, v, i) => acc.add(v.mul(b[i].pBudget).div(b[i].pToken)), BigNumber.from(0));
}

function negate(value: BigNumber): BigNumber {
    return BigNumber.from(0).sub(value);
}
