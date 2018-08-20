import BigNumber from 'bignumber.js';
import Web3 from 'web3';

// Types
import { Provider } from '@0xproject/types';
import {
  ECSignature,
  ITxParams,
  MarketCollateralPoolFactory,
  MarketContractFactoryOraclize,
  MarketContractRegistry,
  MarketToken,
  Order,
  OrderLib,
  SignedOrder
} from '@marketprotocol/types';
import { CollateralEvent, MARKETProtocolConfig, OrderFilledEvent } from './types';
import { assert } from './assert';

import {
  deployMarketCollateralPoolAsync,
  deployMarketContractOraclizeAsync,
  getDeployedMarketContractAddressFromTxHash
} from './lib/Deployment';

import {
  createOrderHashAsync,
  createSignedOrderAsync,
  isValidSignatureAsync,
  signOrderHashAsync
} from './lib/Order';
import { OrderTransactionInfo } from './lib/OrderTransactionInfo';
import { MARKETProtocolArtifacts } from './MARKETProtocolArtifacts';
import { OraclizeContractWrapper } from './contract_wrappers/OraclizeContractWrapper';
import { OraclizeContractMetaData } from './types/ContractMetaData';

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
  public orderLib: OrderLib;

  // wrappers
  public marketContractWrapper: OraclizeContractWrapper;

  // Config
  public readonly config: MARKETProtocolConfig;

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

    if (
      !config.marketContractRegistryAddress &&
      !config.marketTokenAddress &&
      !config.marketContractFactoryAddress &&
      !config.marketCollateralPoolFactoryAddress &&
      !config.mathLibAddress &&
      !config.orderLibAddress
    ) {
      this._updateConfigFromArtifacts(config);
    }

    // Set updated config with artifacts addresses
    this.config = config;

    // Disabled TSLint and added @ts-ignore to suppress the undefined error for optional config param
    /* tslint:disable */
    // prettier-ignore
    // @ts-ignore
    this.marketContractRegistry = new MarketContractRegistry(this._web3, config.marketContractRegistryAddress);

    // prettier-ignore
    // @ts-ignore
    this.mktTokenContract = new MarketToken(this._web3, config.marketTokenAddress);

    // prettier-ignore
    // @ts-ignore
    this.marketContractFactory = new MarketContractFactoryOraclize(this._web3, config.marketContractFactoryAddress);

    // prettier-ignore
    // @ts-ignore
    this.marketCollateralPoolFactory = new MarketCollateralPoolFactory(this._web3, config.marketCollateralPoolFactoryAddress);

    // @ts-ignore prettier-ignore
    this.orderLib = new OrderLib(this._web3, config.orderLibAddress);
    /* tslint:enable */

    this.marketContractWrapper = new OraclizeContractWrapper(this._web3, this);
  }
  // endregion//Constructors

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
   * @param {string} marketContractAddress            Address of the MarketContract
   * @param {BigNumber | number} depositAmount        Amount of ERC20 collateral to deposit
   * @param {ITxParams} txParams                      Transaction parameters
   * @returns {Promise<string>}                       The transaction hash.
   */
  public async depositCollateralAsync(
    marketContractAddress: string,
    depositAmount: BigNumber | number,
    txParams: ITxParams = {}
  ): Promise<string> {
    return this.marketContractWrapper.depositCollateralAsync(
      marketContractAddress,
      depositAmount,
      txParams
    );
  }

  /**
   * Gets the user's currently unallocated collateral token balance.
   * The unallocated token balance is the balance that is already deposited into the
   * collateral pool but has not yet be allocated for a particular trade for the marketContract.
   *
   * @param {string} marketContractAddress            Address of the MarketContract
   * @param {BigNumber | string} userAddress          Address of user
   * @returns {Promise<BigNumber|null>}               The user's currently unallocated token balance
   */
  public async getUserUnallocatedCollateralBalanceAsync(
    marketContractAddress: string,
    userAddress: string
  ): Promise<BigNumber> {
    return this.marketContractWrapper.getUserUnallocatedCollateralBalanceAsync(
      marketContractAddress,
      userAddress
    );
  }

  /**
   * Close all open positions post settlement and withdraws all collateral from a expired contract
   * @param {string} marketContractAddress            Address of the MarketContract
   * @param {ITxParams} txParams                      Transaction parameters
   * @returns {Promise<string>}                       The transaction hash.
   */
  public async settleAndCloseAsync(
    marketContractAddress: string,
    txParams: ITxParams = {}
  ): Promise<string> {
    return this.marketContractWrapper.settleAndCloseAsync(marketContractAddress, txParams);
  }

  /**
   * Withdraws collateral from a traders account back to their own address.
   * @param {string} marketContractAddress            Address of the MarketContract
   * @param {BigNumber | number} withdrawAmount       Amount of ERC20 collateral to withdraw
   * @param {ITxParams} txParams                      Transaction parameters
   * @returns {Promise<string>}                      The transaction hash.
   */
  public async withdrawCollateralAsync(
    marketContractAddress: string,
    withdrawAmount: BigNumber | number,
    txParams: ITxParams = {}
  ): Promise<string> {
    return this.marketContractWrapper.withdrawCollateralAsync(
      marketContractAddress,
      withdrawAmount,
      txParams
    );
  }

  /**
   * Gets the history of deposits and withdrawals for a given collateral pool address.
   * @param {string} marketContractAddress            Address of the MarketContract
   * @param {string | number} fromBlock               from block #
   * @param {string | number} toBlock                 to block #
   * @param {string} userAddress                      only search for deposits/withdrawals to/from a specified address
   * @returns {Promise<CollateralEvent[]>}
   */
  public async getCollateralEventsAsync(
    marketContractAddress: string,
    fromBlock: number | string = '0x0',
    toBlock: number | string = 'latest',
    userAddress: string | null = null
  ): Promise<CollateralEvent[]> {
    return this.marketContractWrapper.getCollateralEventsAsync(
      marketContractAddress,
      fromBlock,
      toBlock,
      userAddress
    );
  }

  /**
   * Gets the number of positions currently held by this userAddress
   * @param {string} marketContractAddress       address of the MarketContract
   * @param {BigNumber | string} userAddress     address of user
   * @returns {Promise<BigNumber>}               count of user's current positions
   */
  public async getPositionCountAsync(
    marketContractAddress: string,
    userAddress: string
  ): Promise<BigNumber> {
    return this.marketContractWrapper.getPositionCountAsync(marketContractAddress, userAddress);
  }

  /**
   * Gets the user's current net position
   * @param {string} marketContractAddress       address of the MarketContract
   * @param {BigNumber | string} userAddress     address of user
   * @returns {Promise<BigNumber>}               user's current net position value
   */
  public async getUserNetPositionAsync(
    marketContractAddress: string,
    userAddress: string
  ): Promise<BigNumber> {
    return this.marketContractWrapper.getUserNetPositionAsync(marketContractAddress, userAddress);
  }

  /**
   * Gets the user position at the specified index from the user's positions array
   * @param {string} marketContractAddress       address of the MarketContract
   * @param {BigNumber | string} userAddress     address of user
   * @param {number | BigNumber} index           index0 based index of a position in the positions array
   * @returns {Promise<BigNumber[]>}            user's position(price, qty) at the given index
   */
  public async getUserPositionAsync(
    marketContractAddress: string,
    userAddress: string,
    index: number | BigNumber
  ): Promise<BigNumber[]> {
    return this.marketContractWrapper.getUserPositionAsync(
      marketContractAddress,
      userAddress,
      index
    );
  }

  /**
   * Gets all of user's positions
   * @param {string} marketContractAddress       address of the MarketContract
   * @param {BigNumber | string} userAddress     address of user
   * @param {boolean} sort                       flag argument to sort positions by price
   * @param {boolean} consolidate                flag argument to consolidate positions based on their price
   * @returns {Promise<BigNumber[][]>}           user's positions array
   */
  public async getUserPositionsAsync(
    marketContractAddress: string,
    userAddress: string,
    sort: boolean,
    consolidate: boolean
  ): Promise<BigNumber[][]> {
    return this.marketContractWrapper.getUserPositionsAsync(
      marketContractAddress,
      userAddress,
      sort,
      consolidate
    );
  }

  // CONTRACT METHODS

  /**
   * Gets contract meta data for the supplied market contract address.
   * @param marketContractAddress
   */
  public async getContractMetaDataAsync(
    marketContractAddress: string
  ): Promise<OraclizeContractMetaData> {
    return this.marketContractWrapper.getContractMetaDataAsync(marketContractAddress);
  }

  /**
   * Get all whilelisted contracts
   * @returns {Promise<string>}               The user's currently unallocated token balance
   */
  public async getAddressWhiteListAsync(): Promise<string[]> {
    return this.marketContractRegistry.getAddressWhiteList;
  }

  /**
   * Get the history of contract fills for maker,taker or both sides of the trade.
   * @param {string} marketContractAddress       address of the MarketContract
   * @param {string} fromBlock                   from block #
   * @param {string} toBlock                     to block #
   * @param {string} userAddress                 only search for fills for a specified address
   * @param {string} side                        order side: maker | taker | any
   * @returns {Promise<OrderFilledEvent[]>}
   */
  public async getContractFillsAsync(
    marketContractAddress: string,
    fromBlock: number | string = '0x0',
    toBlock: number | string = 'latest',
    userAddress: string | null = null,
    side: 'maker' | 'taker' | 'any' = 'any'
  ): Promise<OrderFilledEvent[]> {
    return this.marketContractWrapper.getContractFillsAsync(
      marketContractAddress,
      fromBlock,
      toBlock,
      userAddress,
      side
    );
  }

  /**
   * Retrieves an owner's ERC20 token balance.
   *
   * @param {string} tokenAddress The hex encoded contract Ethereum address where the ERC20 token is deployed.
   * @param {string} ownerAddress The hex encoded user Ethereum address whose balance you would like to check.
   * @returns {Promise<BigNumber>} The owner's ERC20 token balance in base units.
   */
  public async getBalanceAsync(tokenAddress: string, ownerAddress: string): Promise<BigNumber> {
    return this.marketContractWrapper.getBalanceAsync(tokenAddress, ownerAddress);
  }

  // DEPLOYMENT METHODS

  /**
   * Calls our factory to create a new MarketCollateralPool that is then linked to the supplied
   * marketContractAddress.
   * @param {string} marketContractAddress
   * @param {ITxParams} txParams
   * @returns {Promise<string>}                   Transaction of pending deployment.
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
   * @returns {Promise<string>}         txHash of the pending transaction
   */
  public async deployMarketContractOraclizeAsync(
    contractName: string,
    collateralTokenAddress: string,
    contractSpecs: BigNumber[], // not sure why this is a big number from the typedefs?
    oracleDataSource: string,
    oracleQuery: string,
    txParams: ITxParams = {}
  ): Promise<string> {
    return deployMarketContractOraclizeAsync(
      this.marketContractFactory,
      contractName,
      collateralTokenAddress,
      contractSpecs,
      oracleDataSource,
      oracleQuery,
      txParams
    );
  }

  /***
   * Watches for the MarketContractCreatedEvent and attempts to return the new address of the
   * market contract created in the supplied tx Hash.
   * @param from
   * @param txHash
   * @param fromBlock
   */
  public async getDeployedMarketContractAddressFromTxHash(
    from: string,
    txHash: string,
    fromBlock: number
  ): Promise<string> {
    return getDeployedMarketContractAddressFromTxHash(
      this.marketContractFactory,
      from,
      txHash,
      fromBlock
    );
  }

  // ORDER METHODS

  /**
   * Computes the orderHash for a supplied order.
   * @param {Order | SignedOrder} order    An object that conforms to the Order or SignedOrder interface definitions.
   * @return {Promise<string>}             The resulting orderHash from hashing the supplied order.
   */
  public async createOrderHashAsync(order: Order | SignedOrder): Promise<string> {
    return createOrderHashAsync(this.orderLib, order);
  }

  /**
   * Confirms a signed order is validly signed
   * @param signedOrder
   * @param orderHash
   * @return boolean if order hash and signature resolve to maker address (signer)
   */
  public async isValidSignatureAsync(
    signedOrder: SignedOrder,
    orderHash: string
  ): Promise<boolean> {
    return isValidSignatureAsync(this.orderLib, signedOrder, orderHash);
  }

  /**
   * Signs an orderHash and returns it's elliptic curve signature.
   * @param {string} orderHash       Hex encoded orderHash to sign.
   * @param {string} signerAddress   The hex encoded Ethereum address you wish to sign it with. This address
   *                                 must be available via the Provider supplied to MARKET.js.
   * @param {boolean}                shouldAddPersonalMessagePrefix  Some signers add the personal message prefix
   * `\x19Ethereum Signed Message`themselves (e.g Parity Signer, Ledger, TestRPC) and others expect
   * it to already be done by the client (e.g Metamask). Depending on which signer this request is
   * going to, decide on whether to add the prefix before sending the request.
   *
   * @return {Promise<ECSignature>}  An object containing the Elliptic curve signature parameters generated
   *                                 by signing the orderHash.
   */
  public async signOrderHashAsync(
    orderHash: string,
    signerAddress: string,
    shouldAddPersonalMessagePrefix: boolean
  ): Promise<ECSignature> {
    return signOrderHashAsync(
      this._web3.currentProvider,
      orderHash,
      signerAddress,
      shouldAddPersonalMessagePrefix
    );
  }

  /***
   * Creates and signs a new order given the arguments provided
   * @param {string} contractAddress          address of the deployed MarketContract.sol
   * @param {BigNumber} expirationTimestamp   unix timestamp
   * @param {string} feeRecipient             address of account to receive fees
   * @param {string} maker                    address of maker account
   * @param {BigNumber} makerFee              fee amount for maker to pay
   * @param {string} taker                    address of taker account
   * @param {BigNumber} takerFee              fee amount for taker to pay
   * @param {BigNumber} orderQty              qty of Order
   * @param {BigNumber} price                 price of Order
   * @param {BigNumber} salt                  used to ensure unique order hashes
   * @param {boolean}  shouldAddPersonalMessagePrefix  Some signers add the personal message prefix
   * `\x19Ethereum Signed Message`themselves (e.g Parity Signer, Ledger, TestRPC) and others expect
   * it to already be done by the client (e.g Metamask). Depending on which signer this request is
   * going to, decide on whether to add the prefix before sending the request.
   * @return {Promise<SignedOrder>}
   */
  public async createSignedOrderAsync(
    contractAddress: string,
    expirationTimestamp: BigNumber,
    feeRecipient: string,
    maker: string,
    makerFee: BigNumber,
    taker: string,
    takerFee: BigNumber,
    orderQty: BigNumber,
    price: BigNumber,
    salt: BigNumber,
    shouldAddPersonalMessagePrefix: boolean
  ): Promise<SignedOrder> {
    return createSignedOrderAsync(
      this._web3.currentProvider,
      this.orderLib,
      contractAddress,
      expirationTimestamp,
      feeRecipient,
      maker,
      makerFee,
      taker,
      takerFee,
      orderQty,
      price,
      salt,
      shouldAddPersonalMessagePrefix
    );
  }

  /**
   * Trades an order and returns success or error.
   * The returned OrderTransactionInfo can be used to get the actual filled quantity
   *
   * @param {SignedOrder} signedOrder        An object that conforms to the SignedOrder interface. The
   *                                         signedOrder you wish to validate.
   * @param {BigNumber} fillQty              The amount of the order that you wish to fill.
   * @param {ITxParams} txParams             Transaction params of web3.
   * @return {Promise<OrderTransactionInfo>} The information about this order transaction
   */
  public async tradeOrderAsync(
    signedOrder: SignedOrder,
    fillQty: BigNumber,
    txParams: ITxParams = {}
  ): Promise<OrderTransactionInfo> {
    return this.marketContractWrapper.tradeOrderAsync(
      this.orderLib,
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
   * Cancels an order in the given quantity.
   * The returned OrderTransactionInfo can be used to get the actual cancelled quantity
   *
   * @param {Order} order                     Order object.
   * @param {BigNumber} cancelQty             The amount of the order that you wish to cancel.
   * @param {ITxParams} txParams              Transaction params of web3.
   * @return {Promise<OrderTransactionInfo>}  The information about this Order Transaction.
   */
  public async cancelOrderAsync(
    order: Order,
    cancelQty: BigNumber,
    txParams: ITxParams = {}
  ): Promise<OrderTransactionInfo> {
    return this.marketContractWrapper.cancelOrderAsync(order, cancelQty, txParams);
  }

  /**
   * Calculates the required collateral amount in base units of a token.  This amount represents
   * a trader's maximum loss and therefore the amount of collateral that becomes locked into
   * the smart contracts upon execution of a trade.
   * @param {string} marketContractAddress
   * @param {BigNumber} qty             desired qty to trade (+ for buy / - for sell)
   * @param {BigNumber} price           execution price
   * @return {Promise<BigNumber>}       amount of needed collateral to become locked.
   */
  public async calculateNeededCollateralAsync(
    marketContractAddress: string,
    qty: BigNumber,
    price: BigNumber
  ): Promise<BigNumber> {
    return this.marketContractWrapper.calculateNeededCollateralAsync(
      marketContractAddress,
      qty,
      price
    );
  }
  // endregion //Public Methods

  // region Private Methods
  // *****************************************************************
  // ****                     Private Methods                     ****
  // *****************************************************************
  /**
   * Attempts to update a config with all the needed addresses from artifacts if available.
   * @param {MARKETProtocolConfig} config
   * @returns {MARKETProtocolConfig}
   * @private
   */
  private _updateConfigFromArtifacts(config: MARKETProtocolConfig): MARKETProtocolConfig {
    const artifacts = new MARKETProtocolArtifacts(config.networkId);

    config.marketContractRegistryAddress =
      artifacts.marketContractRegistryArtifact.networks[config.networkId].address;

    config.marketTokenAddress = artifacts.marketTokenArtifact.networks[config.networkId].address;

    config.marketContractFactoryAddress =
      artifacts.marketContractFactoryOraclizeArtifact.networks[config.networkId].address;

    config.marketCollateralPoolFactoryAddress =
      artifacts.marketCollateralPoolFactoryArtifact.networks[config.networkId].address;

    config.mathLibAddress = artifacts.mathLibArtifact.networks[config.networkId].address;

    config.orderLibAddress = artifacts.orderLibArtifact.networks[config.networkId].address;

    return config;
  }
  // endregion //Private Methods
}
