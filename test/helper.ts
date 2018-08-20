import * as _ from 'lodash';
import { BigNumber } from 'bignumber.js';
import Web3 from 'web3';

// Types
import { ERC20, MarketContract, OrderLib, SignedOrder } from '@marketprotocol/types';

import { Market, Utils } from '../src';
import { MarketError, MARKETProtocolConfig, OrderStateWatcherConfig } from '../src/types';
import { constants } from '../src/constants';
import { createEVMSnapshot, getContractAddress, restoreEVMSnapshot } from './utils';

import {
  createOrderHashAsync,
  createSignedOrderAsync,
  isValidSignatureAsync,
  signOrderHashAsync
} from '../src/lib/Order';

interface CreateOrderParams {
  makerAddress?: string;
  takerAddress?: string;
  expirationTimeStamp?: number;
  fees?: number;
  feeRecipient?: string;
  orderQty?: number;
  price?: number;
  salt?: BigNumber;
}

/**
 * Helper class to perform repeating multi-step actions in tests.
 *
 */
export class Helper {
  public web3: Web3;
  public config: MARKETProtocolConfig = {
    networkId: constants.NETWORK_ID_TRUFFLE
  };
  public market: Market;
  public orderLib: OrderLib;
  public orderLibAddress: string;
  public marketContractAddress: string;
  public marketContract: MarketContract;
  public collateralTokenAddress: string;
  public marketTokenAddress: string;
  public collateralToken: ERC20;
  public marketToken: ERC20;
  public collateralPoolAddress: string;
  public deploymentAddress: string;
  public maker: string;
  public taker: string;

  constructor() {
    this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));
    this.market = new Market(this.web3.currentProvider, this.config);
    this.orderLibAddress = getContractAddress('OrderLib', constants.NETWORK_ID_TRUFFLE);
    this.orderLib = new OrderLib(this.web3, this.orderLibAddress);
  }

  static async init(): Promise<Helper> {
    const h = new Helper();
    h.deploymentAddress = h.web3.eth.accounts[0];
    const contractAddresses: string[] = await h.market.marketContractRegistry.getAddressWhiteList;
    h.maker = h.ethAccounts[1];
    h.taker = h.ethAccounts[2];

    h.marketContractAddress = contractAddresses[0];
    h.marketContract = await MarketContract.createAndValidate(h.web3, h.marketContractAddress);

    h.collateralTokenAddress = await h.marketContract.COLLATERAL_TOKEN_ADDRESS;
    h.collateralToken = await ERC20.createAndValidate(h.web3, h.collateralTokenAddress);
    h.collateralPoolAddress = await h.marketContract.MARKET_COLLATERAL_POOL_ADDRESS;

    h.marketTokenAddress = await h.marketContract.MKT_TOKEN_ADDRESS;
    h.marketToken = await ERC20.createAndValidate(h.web3, h.marketTokenAddress);

    return h;
  }

  async createOrderAsync({
    makerAddress = this.maker,
    takerAddress = constants.NULL_ADDRESS,
    fees = 0,
    feeRecipient = constants.NULL_ADDRESS,
    orderQty = 10,
    price = 100000,
    expirationTimeStamp = Math.floor(Date.now() / 1000) + 60 * 60,
    salt = Utils.generatePseudoRandomSalt()
  }: CreateOrderParams = {}): Promise<SignedOrder> {
    const marketContractAddress = await this._getMarketContractAddressAsync();

    const feesBN: BigNumber = new BigNumber(fees);
    const orderQtyBN: BigNumber = new BigNumber(orderQty);
    const priceBN: BigNumber = new BigNumber(price);

    const signedOrder: SignedOrder = await createSignedOrderAsync(
      this.web3.currentProvider,
      this.orderLib,
      marketContractAddress,
      new BigNumber(expirationTimeStamp),
      feeRecipient,
      makerAddress,
      feesBN,
      takerAddress,
      feesBN,
      orderQtyBN,
      priceBN,
      salt,
      false
    );

    return signedOrder;
  }

  /**
   * Prefunds and approve tokens and wallets
   *
   */
  async fundCollateral({
    address = this.maker,
    credit = new BigNumber(1e24),
    fund = true,
    approve = true,
    deposit = false
  }: {
    address?: string;
    credit?: BigNumber;
    fund?: boolean;
    approve?: Boolean;
    deposit?: Boolean;
  } = {}) {
    if (fund) {
      await this.collateralToken.transferTx(address, credit).send({ from: this.deploymentAddress });
    }

    if (approve) {
      await this.collateralToken
        .approveTx(this.collateralPoolAddress, credit)
        .send({ from: address });
    }

    if (deposit) {
      await this.market.depositCollateralAsync(this.marketContractAddress, credit, {
        from: address
      });
    }
  }

  /**
   * Funds and approves mkttoken.
   * if approvalAddress is undefined no approval will be done.
   *
   */
  async fundMKT({
    address,
    approvalAddress,
    credit = new BigNumber(10)
  }: { address?: string; approvalAddress?: string; credit?: BigNumber } = {}) {
    await this.marketToken.transferTx(address, credit).send({ from: this.deploymentAddress });

    if (!_.isUndefined(approvalAddress)) {
      await this.marketToken.approveTx(approvalAddress, credit).send({ from: address });
    }
  }

  get ethAccounts(): string[] {
    return this.web3.eth.accounts;
  }

  private async _getMarketContractAddressAsync(): Promise<string> {
    const contractAddresses: string[] = await this.market.marketContractRegistry
      .getAddressWhiteList;
    return contractAddresses[0];
  }
}
