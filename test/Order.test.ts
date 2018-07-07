import { BigNumber } from 'bignumber.js';
import Web3 from 'web3';

// Types
import {
  ERC20,
  MarketCollateralPool,
  MarketContract,
  MARKETProtocolConfig,
  Order,
  SignedOrder
} from '@marketprotocol/types';

import { Market, Utils } from '../src';
import { constants } from '../src/constants';
import { depositCollateralAsync } from '../src/lib/Collateral';

import {
  createOrderHashAsync,
  createSignedOrderAsync,
  isValidSignatureAsync,
  signOrderHashAsync
} from '../src/lib/Order';

import { getContractAddress } from './utils';

/**
 * Order
 */
describe('Order', () => {
  const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));
  const config: MARKETProtocolConfig = {
    networkId: constants.NETWORK_ID_TRUFFLE
  };
  let market: Market;
  let orderLibAddress: string;
  let contractAddress: string;

  beforeAll(async () => {
    market = new Market(web3.currentProvider, config);
    orderLibAddress = getContractAddress('OrderLib', constants.NETWORK_ID_TRUFFLE);
    const contractAddresses: string[] = await market.marketContractRegistry.getAddressWhiteList;
    contractAddress = contractAddresses[0];
  });

  it('Signs an order', async () => {
    const contractAddresses: string[] = await market.marketContractRegistry.getAddressWhiteList;
    const marketContractAddress = contractAddresses[0];

    const expirationTimeStamp: BigNumber = new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60);
    const makerAccount = web3.eth.accounts[1];
    const takerAccount = web3.eth.accounts[2];

    const fees: BigNumber = new BigNumber(0);
    const orderQty: BigNumber = new BigNumber(100);
    const price: BigNumber = new BigNumber(100000);

    const signedOrder: SignedOrder = await createSignedOrderAsync(
      web3.currentProvider,
      orderLibAddress,
      marketContractAddress,
      expirationTimeStamp,
      constants.NULL_ADDRESS,
      makerAccount,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      orderQty,
      Utils.generatePseudoRandomSalt()
    );

    const orderHash: string | BigNumber = await createOrderHashAsync(
      web3.currentProvider,
      orderLibAddress,
      signedOrder
    );

    expect(
      await isValidSignatureAsync(
        web3.currentProvider,
        orderLibAddress,
        signedOrder,
        orderHash.toString()
      )
    ).toBe(true);

    // Create manipulated order to ensure check fails.

    const signedOrderFake: SignedOrder = {
      contractAddress: marketContractAddress,
      expirationTimestamp: expirationTimeStamp,
      feeRecipient: constants.NULL_ADDRESS,
      maker: makerAccount,
      makerFee: new BigNumber(0),
      orderQty: orderQty,
      price: new BigNumber(150000), // change price without signing!
      remainingQty: orderQty,
      salt: new BigNumber(0),
      taker: constants.NULL_ADDRESS,
      takerFee: new BigNumber(0),
      ecSignature: signedOrder.ecSignature
    };

    const orderHashFake: string | BigNumber = await createOrderHashAsync(
      web3.currentProvider,
      orderLibAddress,
      signedOrderFake
    );

    expect(
      await isValidSignatureAsync(
        web3.currentProvider,
        orderLibAddress,
        signedOrderFake,
        orderHashFake.toString()
      )
    ).toBe(false);

    // fix signature to ensure it works
    signedOrderFake.ecSignature = await signOrderHashAsync(
      web3.currentProvider,
      String(orderHashFake),
      makerAccount
    );

    expect(
      await isValidSignatureAsync(
        web3.currentProvider,
        orderLibAddress,
        signedOrderFake,
        orderHashFake.toString()
      )
    ).toBe(true);

    // attempt to sign from different account to ensure it fails.
    signedOrderFake.ecSignature = await signOrderHashAsync(
      web3.currentProvider,
      String(orderHashFake),
      takerAccount
    );

    expect(
      await isValidSignatureAsync(
        web3.currentProvider,
        orderLibAddress,
        signedOrderFake,
        orderHashFake.toString()
      )
    ).toBe(false);
  });

  it('Trades an order', async () => {
    const expirationTimestamp = new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60);
    const maker = web3.eth.accounts[1];
    const taker = web3.eth.accounts[2];
    const deploymentAddress = web3.eth.accounts[0];

    const deployedMarketContract: MarketContract = await MarketContract.createAndValidate(
      web3,
      contractAddress
    );
    expect(await deployedMarketContract.isCollateralPoolContractLinked).toBe(true);
    expect(await deployedMarketContract.isSettled).toBe(false);

    const collateralTokenAddress: string = await deployedMarketContract.COLLATERAL_TOKEN_ADDRESS;
    const collateralToken: ERC20 = await ERC20.createAndValidate(web3, collateralTokenAddress);
    const initialCredit: BigNumber = new BigNumber(1e23);

    // Both maker and taker account need enough tokens for collateral.  Our deployment address
    // should have all of the tokens and be able to send them.
    await collateralToken.transferTx(maker, initialCredit).send({ from: deploymentAddress });
    await collateralToken.transferTx(taker, initialCredit).send({ from: deploymentAddress });

    // now both maker and taker addresses need to deposit collateral into the collateral pool.
    const collateralPoolAddress = await deployedMarketContract.MARKET_COLLATERAL_POOL_ADDRESS;
    const collateralPool = await MarketCollateralPool.createAndValidate(
      web3,
      collateralPoolAddress
    );
    expect(await collateralPool.linkedAddress).toBe(deployedMarketContract.address);

    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: maker });

    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: taker });

    await depositCollateralAsync(web3.currentProvider, collateralPoolAddress, initialCredit, {
      from: maker
    });

    await depositCollateralAsync(web3.currentProvider, collateralPoolAddress, initialCredit, {
      from: taker
    });

    const fees: BigNumber = new BigNumber(0);
    const orderQty: BigNumber = new BigNumber(100);
    const price: BigNumber = new BigNumber(100000);

    const signedOrder: SignedOrder = await createSignedOrderAsync(
      web3.currentProvider,
      orderLibAddress,
      contractAddress,
      expirationTimestamp,
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      orderQty,
      Utils.generatePseudoRandomSalt()
    );

    const orderHash = await createOrderHashAsync(
      web3.currentProvider,
      orderLibAddress,
      signedOrder
    );

    expect(
      await isValidSignatureAsync(
        web3.currentProvider,
        orderLibAddress,
        signedOrder,
        orderHash.toString()
      )
    ).toBe(true);

    expect(
      await market.tradeOrderAsync(orderLibAddress, collateralPoolAddress, signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      })
    ).toEqual(new BigNumber(2));
  });

  it('Cancels an order in a given quantity', async () => {
    const expirationTimestamp = new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60);
    const maker = web3.eth.accounts[1];
    const taker = web3.eth.accounts[2];
    const deploymentAddress = web3.eth.accounts[0];
    const deployedMarketContract: MarketContract = await MarketContract.createAndValidate(
      web3,
      contractAddress
    );
    const collateralTokenAddress: string = await deployedMarketContract.COLLATERAL_TOKEN_ADDRESS;
    const collateralToken: ERC20 = await ERC20.createAndValidate(web3, collateralTokenAddress);
    const initialCredit: BigNumber = new BigNumber(1e23);

    await collateralToken.transferTx(maker, initialCredit).send({ from: deploymentAddress });

    const collateralPoolAddress = await deployedMarketContract.MARKET_COLLATERAL_POOL_ADDRESS;
    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: maker });

    await depositCollateralAsync(web3.currentProvider, collateralPoolAddress, initialCredit, {
      from: maker
    });

    const orderQty: BigNumber = new BigNumber(100);
    const order: Order = {
      contractAddress,
      expirationTimestamp, // '', maker, 0, 1, 100000, 1, '', 0
      feeRecipient: constants.NULL_ADDRESS,
      maker,
      makerFee: new BigNumber(0),
      orderQty: orderQty,
      price: new BigNumber(100000),
      remainingQty: orderQty,
      salt: new BigNumber(0),
      taker,
      takerFee: new BigNumber(0)
    };

    const cancelQty = 3;
    expect(
      await market.cancelOrderAsync(order, new BigNumber(cancelQty), {
        from: maker,
        gas: 400000
      })
    ).toEqual(new BigNumber(cancelQty));
  });

  it('Gets qty filled or cancelled from order', async () => {
    const expirationTimestamp = new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60);
    const maker = web3.eth.accounts[1];
    const taker = web3.eth.accounts[2];
    const deploymentAddress = web3.eth.accounts[0];

    const deployedMarketContract: MarketContract = await MarketContract.createAndValidate(
      web3,
      contractAddress
    );
    expect(await deployedMarketContract.isCollateralPoolContractLinked).toBe(true);
    expect(await deployedMarketContract.isSettled).toBe(false);

    const collateralTokenAddress: string = await deployedMarketContract.COLLATERAL_TOKEN_ADDRESS;
    const collateralToken: ERC20 = await ERC20.createAndValidate(web3, collateralTokenAddress);
    const initialCredit: BigNumber = new BigNumber(1e23);

    // Both maker and taker account need enough tokens for collateral.  Our deployment address
    // should have all of the tokens and be able to send them.
    await collateralToken.transferTx(maker, initialCredit).send({ from: deploymentAddress });
    await collateralToken.transferTx(taker, initialCredit).send({ from: deploymentAddress });

    // now both maker and taker addresses need to deposit collateral into the collateral pool.
    const collateralPoolAddress = await deployedMarketContract.MARKET_COLLATERAL_POOL_ADDRESS;
    const collateralPool = await MarketCollateralPool.createAndValidate(
      web3,
      collateralPoolAddress
    );
    expect(await collateralPool.linkedAddress).toBe(deployedMarketContract.address);

    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: maker });

    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: taker });

    await depositCollateralAsync(web3.currentProvider, collateralPoolAddress, initialCredit, {
      from: maker
    });

    await depositCollateralAsync(web3.currentProvider, collateralPoolAddress, initialCredit, {
      from: taker
    });

    const fees: BigNumber = new BigNumber(0);
    const orderQty: BigNumber = new BigNumber(100);
    const price: BigNumber = new BigNumber(100000);

    const signedOrder: SignedOrder = await createSignedOrderAsync(
      web3.currentProvider,
      orderLibAddress,
      contractAddress,
      expirationTimestamp,
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      orderQty,
      Utils.generatePseudoRandomSalt()
    );
    const orderHash = await createOrderHashAsync(
      web3.currentProvider,
      orderLibAddress,
      signedOrder
    );

    expect(
      await market.getQtyFilledOrCancelledFromOrderAsync(contractAddress, orderHash.toString())
    ).toEqual(new BigNumber(0));

    const fillQty = 2;
    const cancelQty = 3;

    await market.tradeOrderAsync(orderLibAddress, collateralPoolAddress, signedOrder, new BigNumber(fillQty), {
      from: taker,
      gas: 400000
    });

    expect(
      await market.getQtyFilledOrCancelledFromOrderAsync(contractAddress, orderHash.toString())
    ).toEqual(new BigNumber(fillQty));

    await market.cancelOrderAsync(signedOrder, new BigNumber(cancelQty), {
      from: maker,
      gas: 400000
    });

    expect(
      await market.getQtyFilledOrCancelledFromOrderAsync(contractAddress, orderHash.toString())
    ).toEqual(new BigNumber(fillQty + cancelQty));
  });
});
