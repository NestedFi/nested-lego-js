import 'mocha';
import { expect, assert } from 'chai';
import { BigNumber } from '@ethersproject/bignumber';
import { addFees, feesFor, removeFees } from '../lib/utils';

describe('Utilities', () => {
    const rate = BigNumber.from(30);

    it('computes fees without rounding error', () => {
        // 30 * 10k is divisible by 10k
        const fees = feesFor(BigNumber.from(10_000), rate);
        expect(fees.toNumber()).to.equal(30);
    });
    it('computes fees with rounding error', () => {
        // 30 * 10_010 = 300_300 is NOT divisble by 10k
        const fees = feesFor(BigNumber.from(10_010), rate);
        expect(fees.toNumber()).to.equal(30);
    });

    it('add fees no rounding error', () => {
        const withFees = addFees(BigNumber.from(10_000), rate);
        expect(withFees.toNumber()).to.equal(10_030);
    });

    it('add fees with rounding error', () => {
        const withFees = addFees(BigNumber.from(10_001), rate);
        expect(withFees.toNumber()).to.equal(10_031);
    });

    it('remove fees without rounding', () => {
        // 10_030 corresponds to an amount wihtout fees that has no rounding error (10k)
        const removed = removeFees(BigNumber.from(10_030), rate);
        expect(removed.toNumber()).to.equal(10_000);
    });

    it('remove fees with rounding', () => {
        // 10_031 corresponds to an amount wihtout fees that will trigger a rounding error when computing fees (10_001)
        const removed = removeFees(BigNumber.from(10_031), rate);
        expect(removed.toNumber()).to.equal(10_001);
    });

    it('bugfix: can remove fees from 9953', () => {
        const rate = BigNumber.from(80);
        // used to throw an error
        const withoutFees = removeFees(BigNumber.from(9953), rate);

        // just check that we're ok
        expect(addFees(withoutFees, rate).toNumber()).to.deep.equal(9952);
    });
});
