import Web3 from 'web3';
import BigNumber from 'bignumber.js';
// Types
import {
  ERC20,
  MarketCollateralPool,
  MarketContract,
  MarketError,
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

describe('Order Validation', async () => {
  let web3;
  let config: MARKETProtocolConfig;
  let market: Market;
  let orderLibAddress: string;
  let contractAddresses: string[];
  let contractAddress: string;
  let deploymentAddress: string;
  let maker: string;
  let taker: string;
  let deployedMarketContract: MarketContract;
  let collateralTokenAddress: string;
  let collateralToken: ERC20;
  let collateralPoolAddress;
  let collateralPool;
  let initialCredit: BigNumber;
  let fees: BigNumber;
  let orderQty: BigNumber;
  let price: BigNumber;

  beforeAll(async () => {
    web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));
    config = { networkId: constants.NETWORK_ID_TRUFFLE };
    market = new Market(web3.currentProvider, config);
    orderLibAddress = getContractAddress('OrderLib', constants.NETWORK_ID_TRUFFLE);
    contractAddresses = await market.marketContractRegistry.getAddressWhiteList;
    contractAddress = contractAddresses[0];
    deploymentAddress = web3.eth.accounts[0];
    maker = web3.eth.accounts[3];
    taker = web3.eth.accounts[4];
    deployedMarketContract = await MarketContract.createAndValidate(
      web3,
      contractAddress
    );
    collateralTokenAddress = await deployedMarketContract.COLLATERAL_TOKEN_ADDRESS;
    collateralToken = await ERC20.createAndValidate(web3, collateralTokenAddress);
    collateralPoolAddress = await deployedMarketContract.MARKET_COLLATERAL_POOL_ADDRESS;
    collateralPool = await MarketCollateralPool.createAndValidate(
      web3,
      collateralPoolAddress
    );
    initialCredit = new BigNumber(1e23);
  });

  it('Returns MarketError.InsufficientCollateralBalance', async () => {
    fees = new BigNumber(0);
    orderQty = new BigNumber(100);
    price = new BigNumber(100000);
    await collateralToken.transferTx(maker, initialCredit).send({ from: deploymentAddress });
    await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: maker });

    const signedOrder: SignedOrder = await createSignedOrderAsync(
      web3.currentProvider,
      orderLibAddress,
      contractAddress,
      new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60),
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
    expect.assertions(1);
    try {
      await market.tradeOrderAsync(orderLibAddress, collateralPoolAddress, signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      });
    } catch (e) {
      expect(e).toEqual(new Error(MarketError.InsufficientCollateralBalance));
    }
  });
  
});