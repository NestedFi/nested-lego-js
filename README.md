# Main usages

## 1) Install:

```
yarn add @nested-finance/lego-contracts
# or
npm i @nested-finance/lego-contracts -S
```

## 2) Get an instance

To get an instance that can sign transactions, you have two options:

a) Specify a network, and a wallet:

```typescript
import { connect } from '@nested-finance/lego-contracts';
const nested = await connect({
    chain: Chain.poly,
    signer: Wallet.fromMnemonic(process.env.MNEMONIC),
});
```

b) Specify a signer, connected to a provider:

```typescript
const nested = await connect({
        signer: // a signer instance - ex: from metamask
});
```

## 3) Try to create a portfolio

```typescript
const USDC = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const SUSHI = '0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a';
const MATIC = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// Prepare a portfolio creation, with polygon USDC as input:
const op = nested.createPortfolio(USDC, {
    // provide optional metadata: name, tags ...
    name: ...,
});

// approve USDC spending if necessary
if (!(await op.isApproved())) {
    await op.approve();
}

// Will add ~5 USDC of polygon SUSHI in this porfolio
// allowing 3% slippage
const fiveUsdc = '0x4c4b40';
await op.addToken(SUSHI, 0.03).setInputAmount(fiveUsdc);

// ... and ~5 USDC of MATIC
await op.addToken(MATIC, 0.03).setInputAmount(fiveUsdc);

// 👉 Send transaction !
const {id, publicUrl} = await op.execute();

console.log(`Porfolio ${id} created, you can visualize it at ${publicUrl}`);
```

**⚠️ important: All calls that require passing an amount are supporting:**

-   A BigNumber
-   Hexadcimal string (which will be converted to BigNumber)
-   A number, which will automatically converted to the right amount: The token decimals will be fetched, and the amount converted.

Meaning that those are equivalent:

```typescript
await op.addToken(SUSHI, 0.03).setInputAmount('0x4c4b40');
await op.addToken(SUSHI, 0.03).setInputAmount(BigNumber.from('0x4c4b40'));
await op.addToken(SUSHI, 0.03).setInputAmount(5);
```

## 4) Add tokens from your wallet in an existing porfolio

```typescript
// Spend matic MATIC to add some tokens in your porfolio:
const op = nested.addTokensToPortfolio(id, MATIC);

// approve MATIC spending if necessary
if (!(await op.isApproved())) {
    await op.approve();
}

// add 1 matic worth of USDC in the porfolio
const oneMatic = '0x0de0b6b3a7640000';
await op.addToken(USDC, 0.03).setInputAmount(oneMatic);

// and add 1 matic in the porfolio
await op.addToken(MATIC, 0.03).setInputAmount(oneMatic);

// 👉 Send transaction !
await op.execute();
```

## 5) Swap a token to other(s) token(s) within your porfolio

```typescript
// swap some matic that you have in the given porfolio...
const op = nested.swapSingleToMulti(id, MATIC);

// ... 1 matic to some usdc
await op.swapTo(USDC, 0.03).setInputAmount(oneMatic);
// ... and 1 matic to some sushi
await op.swapTo(SUSHI, 0.03).setInputAmount(oneMatic);

// 👉 Send transaction !
await op.execute();
```

## 6) Swap multiple tokens to a single token within your porfolio

```typescript
// all below tokens will be converted to SUSHI
const op = nested.swapMultiToSingle(id, SUSHI);

// swap 5 USDC to sushi
await op.swapFrom(USDC, 0.03).setInputAmount(fiveUsdc);

// swap 1 matic to sushi
await op.swapFrom(SUSHI, 0.03).setInputAmount(oneSushi);

// 👉 Send transaction !
await op.execute();
```

## 7) Remove some (but not all) tokens from your porfolio, to your wallet:

```typescript
// all funds will be retreived in your porfolio in SUSHI:
const op = nested.sellTokensToWallet(id, SUSHI);

// Get back 5 USDC worth of SUSHI
await op.sellToken(USDC, 0.03).setInputAmount(fiveUsdc);

// and 1 MATIC worth of SUSHI
await op.sellToken(USDC, 0.03).setInputAmount(oneMatic);

// 👉 Send transaction !
await op.execute();
```

## 8) Liquidate & destroy your whole porfolio, and get your assets back

```typescript
// I want to get the funds back as USDC (3% slippage)
const op = nested.liquidateToWalletAndDestroy(id, USDC, 0.3);
// refresh quotes
const quotes = await op.refreshAssets();

// 👉 Send transaction !
await op.execute();
```

# Advanced usages:

## Operation tweaking:

Each operation will return a `TokenOrder` instance, that allows you to inspect and tweak the operation being configured.

For instance, lets say that you are adding tokens to a porfolio:

```typescript
const token = op.addToken(USDC, 0.03);
```

Then several properties will help you to know what you are going to get, like `token.price` and `token.guaranteedPrice`.

If you have a UI to modify the added amount, you will be able to tweak it like that:

```typescript
await token.setInputAmount('0x456'); // new amount
```

or you can specify the output token amount you'd like:

```typescript
await token.setOutputAmount('0x456'); // new amount
```

There are several other uselful methods/properties on each operation. Consult the types for more details.

## Prepare call data / Non signed operations:

You can get an instance that is not bound to a signer via the `connect()` function. The simplest way being:

```typescript
const nested = await connect({ chain: Chain.poly });
```

(check the types for more advanced options)

When you have such an instance, all `.execute()` methods will throw an error. Instead, you can get the call data that are expected to be sent to our contracts. For instance:

```typescript
const callData = await op.buildCallData();
```

It will contain 3 properties:

-   `to` is the contract to call
-   `data` is the serialized call data to pass to this conract
-   `value` is the value of your transaction (always 0, unless you are trying to add tokens paid for using the native token)

You can use these call data simply like that, when you have a signed provider:

```typescript
// send transaction
const tx = await signer.sendTransaction(callData);
// wait for it to be processed by the blockchain
await tx.wait();
```
