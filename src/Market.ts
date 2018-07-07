import { BigNumber } from 'bignumber.js';
import Web3 from 'web3';

// Types
import { Provider } from '@0xproject/types';
import {
  ECSignature,
  ITxParams,
  MarketCollateralPoolFactory,
  MarketContractFactoryOraclize,
  MarketContractRegistry,
  MARKETProtocolConfig,
  MarketToken,
  Order,
  SignedOrder
} from '@marketprotocol/types';

import { artifacts } from './artifacts';
import { assert } from './assert';
import { constants } from './constants';
import { ERC20TokenContractWrapper } from './contract_wrappers/ERC20TokenContractWrapper';
import { MarketContractOraclizeWrapper } from './contract_wrappers/MarketContractOraclizeWrapper';

import {
  depositCollateralAsync,
  getUserAccountBalanceAsync,
  settleAndCloseAsync,
  withdrawCollateralAsync
} from './lib/Collateral';

import {
  deployMarketCollateralPoolAsync,
  deployMarketContractOraclizeAsync
} from './lib/Deployment';

import {
  createOrderHashAsync,
  createSignedOrderAsync,
  isValidSignatureAsync,
  signOrderHashAsync
} from './lib/Order';

/**
 * The `Market` class is the single entry-point into the MARKET.js library.
 * It contains all of the library's functionality and all calls to the library
 * should be made through a `Market` instance.
 */
export class Market {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  public marketContractRegistry: MarketContractRegistry;
  public mktTokenContract: MarketToken;
  public marketCollateralPoolFactory: MarketCollateralPoolFactory;
  public marketContractFactory: MarketContractFactoryOraclize; // todo: create interface.

  // wrappers
  public marketContractWrapper: MarketContractOraclizeWrapper;
  public erc20TokenContractWrapper: ERC20TokenContractWrapper;

  private readonly _web3: Web3;
  // endregion // members

  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************
  /**
   * Instantiates a new Market instance that provides the public interface to the Market library.
   * @param {Provider} provider    The Provider instance you would like the Market library to use
   *                               for interacting with the Ethereum network.
   * @param {MARKETProtocolConfig} config object for addresses and other vars
   * @return {Market}              An instance of the Market class.
   */
  constructor(provider: Provider, config: MARKETProtocolConfig) {
    assert.isWeb3Provider('provider', provider);
    // TODO: add check for config to conform to schema.

    this._web3 = new Web3();
    this._web3.setProvider(provider);
    Market._updateConfigFromArtifacts(config);

    this.marketContractRegistry = new MarketContractRegistry(
      this._web3,
      config.marketContractRegistryAddress
        ? config.marketContractRegistryAddress
        : artifacts.MarketTokenArtifact.networks[config.networkId].address
    );

    this.mktTokenContract = new MarketToken(
      this._web3,
      config.marketTokenAddress ? config.marketTokenAddress : constants.NULL_ADDRESS
    );

    this.marketContractFactory = new MarketContractFactoryOraclize(
      this._web3,
      config.marketContractFactoryAddress
        ? config.marketContractFactoryAddress
        : constants.NULL_ADDRESS
    );

    this.marketCollateralPoolFactory = new MarketCollateralPoolFactory(
      this._web3,
      config.marketCollateralPoolFactoryAddress
        ? config.marketCollateralPoolFactoryAddress
        : constants.NULL_ADDRESS
    );

    this.erc20TokenContractWrapper = new ERC20TokenContractWrapper(this._web3);
    this.marketContractWrapper = new MarketContractOraclizeWrapper(this._web3);
  }
  // endregion//Constructors

  // region Private Static Methods
  // *****************************************************************
  // ****                  Private Static Methods                 ****
  // *****************************************************************
  /**
   * Attempts to update a config with all the needed addresses from artifacts if available.
   * @param {MARKETProtocolConfig} config
   * @returns {MARKETProtocolConfig}
   * @private
   */
  private static _updateConfigFromArtifacts(config: MARKETProtocolConfig): MARKETProtocolConfig {
    if (
      !config.marketContractRegistryAddress &&
      artifacts.MarketContractRegistryArtifact &&
      artifacts.MarketContractRegistryArtifact.networks[config.networkId]
    ) {
      config.marketContractRegistryAddress =
        artifacts.MarketContractRegistryArtifact.networks[config.networkId].address;
    }

    if (
      !config.marketTokenAddress &&
      artifacts.MarketTokenArtifact &&
      artifacts.MarketTokenArtifact.networks[config.networkId]
    ) {
      config.marketTokenAddress = artifacts.MarketTokenArtifact.networks[config.networkId].address;
    }

    if (
      !config.marketContractFactoryAddress &&
      artifacts.MarketContractFactoryOraclizeArtifact &&
      artifacts.MarketContractFactoryOraclizeArtifact.networks[config.networkId]
    ) {
      config.marketContractFactoryAddress =
        artifacts.MarketContractFactoryOraclizeArtifact.networks[config.networkId].address;
    }

    if (
      !config.marketCollateralPoolFactoryAddress &&
      artifacts.MarketCollateralPoolFactoryArtifact &&
      artifacts.MarketCollateralPoolFactoryArtifact.networks[config.networkId]
    ) {
      config.marketCollateralPoolFactoryAddress =
        artifacts.MarketCollateralPoolFactoryArtifact.networks[config.networkId].address;
    }

    return config;
  }
  // endregion //Private Static Methods

  // region Public Methods
  // *****************************************************************
  // ****                     Public Methods                      ****
  // *****************************************************************

  // PROVIDER METHODS
  /**
   * Sets a new web3 provider for MARKET.js. Updating the provider will stop all
   * subscriptions so you will need to re-subscribe to all events relevant to your app after this call.
   * @param {Provider} provider    The Web3Provider you would like the MARKET.js library to use from now on.
   * @returns {void}
   */
  public setProvider(provider: Provider): void {
    this._web3.setProvider(provider);
  }

  /**
   * Get the provider instance currently used by MARKET.js
   * @return {Provider}    Web3 provider instance
   */
  public getProvider(): Provider {
    return this._web3.currentProvider;
  }

  // COLLATERAL METHODS

  /**
   * Deposits collateral to a traders account for a given contract address.
   * @param {string} collateralPoolContractAddress    Address of the MarketCollateralPool
   * @param {BigNumber | number} depositAmount        Amount of ERC20 collateral to deposit
   * @param {ITxParams} txParams                      Transaction parameters
   * @returns {Promise<boolean>}                      true if successful
   */
  public async depositCollateralAsync(
    collateralPoolContractAddress: string,
    depositAmount: BigNumber | number,
    txParams: ITxParams = {}
  ): Promise<boolean> {
    return depositCollateralAsync(
      this._web3.currentProvider,
      collateralPoolContractAddress,
      depositAmount,
      txParams
    );
  }

  /**
   * Gets the user's currently unallocated token balance
   * @param {string} collateralPoolContractAddress    Address of the MarketCollateralPool
   * @param {BigNumber | string} userAddress          Address of user
   * @returns {Promise<BigNumber|null>}               The user's currently unallocated token balance
   */
  public async getUserAccountBalanceAsync(
    collateralPoolContractAddress: string,
    userAddress: string
  ): Promise<BigNumber | null> {
    return getUserAccountBalanceAsync(
      this._web3.currentProvider,
      collateralPoolContractAddress,
      userAddress
    );
  }

  /**
   * Close all open positions post settlement and withdraws all collateral from a expired contract
   * @param {string} collateralPoolContractAddress    Address of the MarketCollateralPool
   * @param {ITxParams} txParams                      Transaction parameters
   * @returns {Promise<boolean>}                      true if successful
   */
  public async settleAndCloseAsync(
    collateralPoolContractAddress: string,
    txParams: ITxParams = {}
  ): Promise<boolean> {
    return settleAndCloseAsync(this._web3.currentProvider, collateralPoolContractAddress, txParams);
  }

  /**
   * Withdraws collateral from a traders account back to their own address.
   * @param {string} collateralPoolContractAddress    Address of the MarketCollateralPool
   * @param {BigNumber | number} withdrawAmount       Amount of ERC20 collateral to withdraw
   * @param {ITxParams} txParams                      Transaction parameters
   * @returns {Promise<boolean>}                      true if successful
   */
  public async withdrawCollateralAsync(
    collateralPoolContractAddress: string,
    withdrawAmount: BigNumber | number,
    txParams: ITxParams = {}
  ): Promise<boolean> {
    return withdrawCollateralAsync(
      this._web3.currentProvider,
      collateralPoolContractAddress,
      withdrawAmount,
      txParams
    );
  }

  // CONTRACT METHODS

  /**
   * Gets the collateral pool contract address
   * @param {string} marketContractAddress    Address of the Market contract
   * @returns {Promise<string>}               The user's currently unallocated token balance
   */
  public async getCollateralPoolContractAddressAsync(
    marketContractAddress: string
  ): Promise<string> {
    return this.marketContractWrapper.getCollateralPoolContractAddressAsync(marketContractAddress);
  }

  /**
   * Get all whilelisted contracts
   * @returns {Promise<string>}               The user's currently unallocated token balance
   */
  public async getAddressWhiteListAsync(): Promise<string[]> {
    return this.marketContractRegistry.getAddressWhiteList;
  }

  /**
   * Get the oracle query for the MarketContract
   * @param marketContractAddress   MarketContract address
   * @returns {Promise<string>}     The oracle query
   */
  public async getOracleQuery(marketContractAddress: string): Promise<string> {
    return this.marketContractWrapper.getOracleQuery(marketContractAddress);
  }

  // DEPLOYMENT METHODS

  /**
   * Calls our factory to create a new MarketCollateralPool that is then linked to the supplied
   * marketContractAddress.
   * @param {string} marketContractAddress
   * @param {ITxParams} txParams
   * @returns {Promise<string>}                   Transaction ofsuccessful deployment.
   */
  public async deployMarketCollateralPoolAsync(
    marketContractAddress: string,
    txParams: ITxParams = {}
  ): Promise<string> {
    return deployMarketCollateralPoolAsync(
      this._web3.currentProvider,
      this.marketCollateralPoolFactory,
      marketContractAddress,
      txParams
    );
  }

  /**
   * calls our factory that deploys a MarketContractOraclize and then adds it to
   * the MarketContractRegistry.
   * @param {string} contractName
   * @param {string} collateralTokenAddress
   * @param {BigNumber[]} contractSpecs
   * @param {string} oracleDataSource
   * @param {string} oracleQuery
   * @param {ITxParams} txParams
   * @returns {Promise<string | BigNumber>}         Deployed address of the new Market Contract.
   */
  public async deployMarketContractOraclizeAsync(
    contractName: string,
    collateralTokenAddress: string,
    contractSpecs: BigNumber[], // not sure why this is a big number from the typedefs?
    oracleDataSource: string,
    oracleQuery: string,
    txParams: ITxParams = {}
  ): Promise<string | BigNumber> {
    return deployMarketContractOraclizeAsync(
      this._web3.currentProvider,
      this.marketContractFactory,
      contractName,
      collateralTokenAddress,
      contractSpecs,
      oracleDataSource,
      oracleQuery,
      txParams
    );
  }

  // ORDER METHODS

  /**
   * Computes the orderHash for a supplied order.
   * @param {string} orderLibAddress       Address of the deployed OrderLib.
   * @param {Order | SignedOrder} order    An object that conforms to the Order or SignedOrder interface definitions.
   * @return {Promise<string>}             The resulting orderHash from hashing the supplied order.
   */
  public async createOrderHashAsync(
    orderLibAddress: string,
    order: Order | SignedOrder
  ): Promise<string> {
    return createOrderHashAsync(this._web3.currentProvider, orderLibAddress, order);
  }

  /**
   * Confirms a signed order is validly signed
   * @param orderLibAddress
   * @param signedOrder
   * @param orderHash
   * @return boolean if order hash and signature resolve to maker address (signer)
   */
  public async isValidSignatureAsync(
    orderLibAddress: string,
    signedOrder: SignedOrder,
    orderHash: string
  ): Promise<boolean> {
    return isValidSignatureAsync(
      this._web3.currentProvider,
      orderLibAddress,
      signedOrder,
      orderHash
    );
  }

  /**
   * Signs an orderHash and returns it's elliptic curve signature.
   * @param {string} orderHash       Hex encoded orderHash to sign.
   * @param {string} signerAddress   The hex encoded Ethereum address you wish to sign it with. This address
   *                                 must be available via the Provider supplied to MARKET.js.
   * @return {Promise<ECSignature>}  An object containing the Elliptic curve signature parameters generated
   *                                 by signing the orderHash.
   */
  public async signOrderHashAsync(orderHash: string, signerAddress: string): Promise<ECSignature> {
    return signOrderHashAsync(this._web3.currentProvider, orderHash, signerAddress);
  }

  /***
   * Creates and signs a new order given the arguments provided
   * @param {string} orderLibAddress          address of the deployed OrderLib.sol
   * @param {string} contractAddress          address of the deployed MarketContract.sol
   * @param {BigNumber} expirationTimestamp   unix timestamp
   * @param {string} feeRecipient             address of account to receive fees
   * @param {string} maker                    address of maker account
   * @param {BigNumber} makerFee              fee amount for maker to pay
   * @param {string} taker                    address of taker account
   * @param {BigNumber} takerFee              fee amount for taker to pay
   * @param {BigNumber} orderQty              qty of Order
   * @param {BigNumber} price                 price of Order
   * @param {BigNumber} remainingQty          qty remaining
   * @param {BigNumber} salt                  used to ensure unique order hashes
   * @return {Promise<SignedOrder>}
   */
  public async createSignedOrderAsync(
    orderLibAddress: string,
    contractAddress: string,
    expirationTimestamp: BigNumber,
    feeRecipient: string,
    maker: string,
    makerFee: BigNumber,
    taker: string,
    takerFee: BigNumber,
    orderQty: BigNumber,
    price: BigNumber,
    remainingQty: BigNumber,
    salt: BigNumber
  ): Promise<SignedOrder> {
    return createSignedOrderAsync(
      this._web3.currentProvider,
      orderLibAddress,
      contractAddress,
      expirationTimestamp,
      feeRecipient,
      maker,
      makerFee,
      taker,
      takerFee,
      orderQty,
      price,
      remainingQty,
      salt
    );
  }

  /**
   * Trades an order and returns success or error.
   * @param {string} orderLibAddress       Address of the deployed OrderLib.
   * @param {sting} collateralPoolContractAddress Address of the collateral pool contract.
   * @param {SignedOrder} signedOrder        An object that conforms to the SignedOrder interface. The
   *                                         signedOrder you wish to validate.
   * @param {BigNumber} fillQty              The amount of the order that you wish to fill.
   * @param {ITxParams} txParams             Transaction params of web3.
   * @return {Promise<BigNumber | number>}   Qty that was able to be filled.
   */
  public async tradeOrderAsync(
    orderLibAddress: string,
    collateralPoolContractAddress: string,
    signedOrder: SignedOrder,
    fillQty: BigNumber,
    txParams: ITxParams = {}
  ): Promise<BigNumber | number> {
    return this.marketContractWrapper.tradeOrderAsync(
      this.mktTokenContract,
      orderLibAddress, 
      collateralPoolContractAddress, 
      signedOrder,
      fillQty,
      txParams
    );
  }

  /**
   * Returns the qty that is no longer available to trade for a given order/
   * @param {string} orderHash                Hash of order to find filled and cancelled qty.
   * @param {string} marketContractAddress    Address of the Market contract
   * @return {Promise<BigNumber>}             The filled or cancelled quantity.
   */
  public async getQtyFilledOrCancelledFromOrderAsync(
    marketContractAddress: string,
    orderHash: string
  ): Promise<BigNumber> {
    return this.marketContractWrapper.getQtyFilledOrCancelledFromOrderAsync(
      marketContractAddress,
      orderHash
    );
  }

  /**
   * Cancels an order in the given quantity and returns the quantity.
   * @param {Order} order                   Order object.
   * @param {BigNumber} cancelQty           The amount of the order that you wish to cancel.
   * @param {ITxParams} txParams            Transaction params of web3.
   * @return {Promise<BigNumber>}           Qty that cancelled.
   */
  public async cancelOrderAsync(
    order: Order,
    cancelQty: BigNumber,
    txParams: ITxParams = {}
  ): Promise<BigNumber | number> {
    return this.marketContractWrapper.cancelOrderAsync(order, cancelQty, txParams);
  }

  // endregion //Public Methods
}
