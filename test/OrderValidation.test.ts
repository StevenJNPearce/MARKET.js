import Web3 from 'web3';
import BigNumber from 'bignumber.js';
// Types
import { ERC20, MarketCollateralPool, MarketContract, SignedOrder } from '@marketprotocol/types';
import { MarketError, MARKETProtocolConfig } from '../src/types';

import { Market, Utils } from '../src';
import { constants } from '../src/constants';

import { createEVMSnapshot, restoreEVMSnapshot } from './utils';

describe('Order Validation', async () => {
  let web3: Web3;
  let config: MARKETProtocolConfig;
  let market: Market;
  let contractAddresses: string[];
  let contractAddress: string;
  let deploymentAddress: string;
  let maker: string;
  let taker: string;
  let deployedMarketContract: MarketContract;
  let collateralTokenAddress: string;
  let collateralToken: ERC20;
  let collateralPoolAddress: string;
  let collateralPool;
  let initialCredit: BigNumber;
  let fees: BigNumber;
  let orderQty: BigNumber;
  let price: BigNumber;
  let snapshotId: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));
    config = { networkId: constants.NETWORK_ID_TRUFFLE };
    market = new Market(web3.currentProvider, config);
    contractAddresses = await market.marketContractRegistry.getAddressWhiteList;
    contractAddress = contractAddresses[0];
    deploymentAddress = web3.eth.accounts[0];
    maker = web3.eth.accounts[3];
    taker = web3.eth.accounts[4];
    deployedMarketContract = await MarketContract.createAndValidate(web3, contractAddress);
    collateralTokenAddress = await deployedMarketContract.COLLATERAL_TOKEN_ADDRESS;
    collateralToken = await ERC20.createAndValidate(web3, collateralTokenAddress);
    collateralPoolAddress = await deployedMarketContract.MARKET_COLLATERAL_POOL_ADDRESS;
    collateralPool = await MarketCollateralPool.createAndValidate(web3, collateralPoolAddress);
    initialCredit = new BigNumber(1e23);
    orderQty = new BigNumber(100);
    price = new BigNumber(100000);
    let makerCollateral = await market.getUserUnallocatedCollateralBalanceAsync(
      contractAddress,
      maker
    );
    let takerCollateral = await market.getUserUnallocatedCollateralBalanceAsync(
      contractAddress,
      taker
    );
    await market.withdrawCollateralAsync(contractAddress, makerCollateral, {
      from: maker
    });
    await market.withdrawCollateralAsync(contractAddress, takerCollateral, {
      from: taker
    });
  });

  beforeEach(async () => {
    snapshotId = await createEVMSnapshot(web3);
    // Transfer initial credit amount of tokens to maker and deposit as collateral
    await collateralToken.transferTx(maker, initialCredit).send({ from: deploymentAddress });
    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: maker });
    await market.depositCollateralAsync(contractAddress, initialCredit, {
      from: maker
    });
  });

  afterEach(async () => {
    await restoreEVMSnapshot(web3, snapshotId);
  });

  it('Checks if maker has approved enough fees', async () => {
    const feeRecipient = web3.eth.accounts[5];
    fees = new BigNumber(100);

    // transfer enough MKT to maker for fees
    await market.mktTokenContract.transferTx(maker, fees).send({ from: deploymentAddress });

    const signedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      feeRecipient,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    await expect(
      market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      })
    ).rejects.toThrow(new Error(MarketError.InsufficientAllowanceForTransfer));
  });

  it('Checks if taker has approved enough fees', async () => {
    const feeRecipient = web3.eth.accounts[5];
    fees = new BigNumber(100);

    // transfer enough MKT to maker and takers for fees
    await market.mktTokenContract.transferTx(maker, fees).send({ from: deploymentAddress });
    await market.mktTokenContract.transferTx(taker, fees).send({ from: deploymentAddress });

    // maker approves token for fees
    await market.mktTokenContract.approveTx(feeRecipient, fees).send({ from: maker });

    const signedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      feeRecipient,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    await expect(
      market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      })
    ).rejects.toThrow(new Error(MarketError.InsufficientAllowanceForTransfer));
  });

  it('Checks sufficient collateral balances', async () => {
    // Withdraw maker's collateral so that balance is not enough to trade
    await market.withdrawCollateralAsync(contractAddress, initialCredit, {
      from: maker
    });
    fees = new BigNumber(0);
    const signedOrder: SignedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    expect.assertions(1);
    try {
      await market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.InsufficientCollateralBalance));
    }
  });

  it('Checks sufficient MKT balances for fees', async () => {
    fees = new BigNumber(100);
    const signedOrder: SignedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    expect.assertions(1);
    try {
      await market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.InsufficientBalanceForTransfer));
    }
  });

  it('Checks valid signature', async () => {
    fees = new BigNumber(0);
    const signedOrder: SignedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );
    signedOrder.ecSignature.s = '0x';

    expect.assertions(1);
    try {
      await market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.InvalidSignature));
    }
  });

  it('Checks Taker address as defined in the order is null, or is the caller of traderOrder', async () => {
    fees = new BigNumber(0);
    await collateralToken.transferTx(taker, initialCredit).send({ from: deploymentAddress });
    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: taker });
    await market.depositCollateralAsync(contractAddress, initialCredit, {
      from: taker
    });
    const signedOrder: SignedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      constants.NULL_ADDRESS,
      maker,
      fees,
      taker,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    expect.assertions(1);
    try {
      await market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: maker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.InvalidTaker));
    }
  });

  it('Checks valid timestamp', async () => {
    fees = new BigNumber(0);
    const signedOrder: SignedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(1),
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    expect.assertions(1);
    try {
      await market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.OrderExpired));
    }
  });

  it('Checks the order is not fully filled or fully cancelled', async () => {
    fees = new BigNumber(0);
    const signedOrder: SignedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      new BigNumber(0),
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    expect.assertions(1);
    try {
      await market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.OrderFilledOrCancelled));
    }
  });

  it('Checks the order qty and the fill qty are the same sign', async () => {
    fees = new BigNumber(0);
    const signedOrder: SignedOrder = await market.createSignedOrderAsync(
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
      constants.NULL_ADDRESS,
      maker,
      fees,
      constants.NULL_ADDRESS,
      fees,
      orderQty,
      price,
      Utils.generatePseudoRandomSalt(),
      false
    );

    expect.assertions(1);
    try {
      await market.tradeOrderAsync(signedOrder, new BigNumber(-2), {
        from: taker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.BuySellMismatch));
    }
  });
});
