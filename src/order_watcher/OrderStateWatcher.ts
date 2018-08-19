import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import * as _ from 'lodash';

import { DecodedLogEntry, SignedOrder } from '@marketprotocol/types';

import {
  BlockParamLiteral,
  LogEntryEvent,
  MarketError,
  OnOrderStateChangeCallback,
  OrderState,
  OrderStateWatcherConfig
} from '../types';
import { assert } from '../assert';
import { ExpirationWatcher } from './ExpirationWatcher';
import { EventWatcher } from './EventWatcher';
import { Market, Utils } from '..';
import {
  BalanceAndAllowanceLazyStore,
  OrderCollateralPoolAndTokenLazyStore,
  OrderFilledCancelledLazyStore
} from '../stores';
import { IntervalUtils } from '../lib/Utils';
import { AbiDecoder } from '../lib/AbiDecoder';
import {
  ApprovalContractEventArgs,
  CollateralPoolEvents,
  ContractEventArgs,
  MarketContractEvents,
  MarketTokenEvents,
  OrderCancelledEventArgs,
  OrderFilledEventArgs,
  TokenEvents,
  TransferContractEventArgs,
  UpdatedUserBalanceEventArgs,
  UserUpdatedLockedBalanceEventArgs
} from '../types/ContractEvents';
import { OrderStateUtils } from '../utilities/OrderStateUtils';

interface DependentOrderHashes {
  [makerAddress: string]: {
    [makerToken: string]: Set<string>;
  };
}

interface OrderStateByOrderHash {
  [orderHash: string]: OrderState;
}

interface OrderByOrderHash {
  [orderHash: string]: SignedOrder;
}

const DEFAULT_CLEANUP_JOB_INTERVAL_MS = 1000 * 60 * 60; // 1h

/**
 * Watcher for a set of Transaction Orders
 *
 */
export class OrderStateWatcher {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************

  private _orderStateByOrderHashCache: OrderStateByOrderHash = {};
  private _dependentOrderHashes: DependentOrderHashes = {};
  private _orderByOrderHash: OrderByOrderHash = {};
  private _callbackIfExists?: OnOrderStateChangeCallback;
  private _expirationWatcher: ExpirationWatcher;
  private _eventWatcher: EventWatcher;
  private _orderFilledCancelledStore: OrderFilledCancelledLazyStore;
  private _collateralBalanceAndAllowanceStore: BalanceAndAllowanceLazyStore;
  private _collateralPoolAndTokenAddressStore: OrderCollateralPoolAndTokenLazyStore;
  private _web3: Web3;
  private _abiDecoder: AbiDecoder;
  private _market: Market;
  private _orderStateUtils: OrderStateUtils;
  private _cleanupJobInterval: number;
  private _cleanupJobIntervalIdIfExists?: NodeJS.Timer;

  // endregion // members
  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************

  /**
   *
   * @param {Web3} web3
   * @param {AbiDecoder} abiDecoder
   * @param {Market} market
   * @param {OrderStateWatcherConfig} config
   */
  constructor(
    web3: Web3,
    abiDecoder: AbiDecoder,
    market: Market,
    config?: OrderStateWatcherConfig
  ) {
    this._web3 = web3;
    this._abiDecoder = abiDecoder;
    this._market = market;
    this._orderFilledCancelledStore = new OrderFilledCancelledLazyStore(
      market.marketContractWrapper
    );
    this._collateralBalanceAndAllowanceStore = new BalanceAndAllowanceLazyStore(
      market.marketContractWrapper
    );
    this._collateralPoolAndTokenAddressStore = new OrderCollateralPoolAndTokenLazyStore(
      market.marketContractWrapper
    );
    this._orderStateUtils = new OrderStateUtils(
      this._market,
      this._collateralBalanceAndAllowanceStore,
      this._orderFilledCancelledStore,
      this._collateralPoolAndTokenAddressStore
    );
    const orderExpirationCheckingIntervalMsIfExists = _.isUndefined(config)
      ? undefined
      : config.orderExpirationCheckingIntervalMs;
    const expirationMarginIfExistsMs = _.isUndefined(config)
      ? undefined
      : config.expirationMarginMs;
    this._expirationWatcher = new ExpirationWatcher(
      expirationMarginIfExistsMs,
      orderExpirationCheckingIntervalMsIfExists
    );

    const pollingIntervalIfExistsMs = _.isUndefined(config)
      ? undefined
      : config.eventPollingIntervalMs;
    const stateLayer =
      _.isUndefined(config) || _.isUndefined(config.stateLayer)
        ? BlockParamLiteral.Latest
        : config.stateLayer;
    this._eventWatcher = new EventWatcher(this._web3, pollingIntervalIfExistsMs, stateLayer);

    this._cleanupJobInterval =
      _.isUndefined(config) || _.isUndefined(config.cleanupJobIntervalMs)
        ? DEFAULT_CLEANUP_JOB_INTERVAL_MS
        : config.cleanupJobIntervalMs;
  }

  // endregion//Constructors
  // region Properties
  // *****************************************************************
  // ****                     Properties                          ****
  // *****************************************************************
  // endregion //Properties
  // region Public Methods
  // *****************************************************************
  // ****                     Public Methods                      ****
  // *****************************************************************

  /**
   * subscribes callback to receive updates in regards to the state of an order
   *
   * @param {OnOrderStateChangeCallback} callback  callback function
   */
  public subscribe(callback: OnOrderStateChangeCallback): void {
    assert.isFunction('callback', callback);
    if (!_.isUndefined(this._callbackIfExists)) {
      throw new Error(MarketError.SubscriptionAlreadyPresent);
    }
    this._callbackIfExists = callback;
    this._expirationWatcher.subscribe(this._onOrderExpired.bind(this));
    this._eventWatcher.subscribe(this._onEventWatcherCallbackAsync.bind(this));
    this._cleanupJobIntervalIdIfExists = IntervalUtils.setAsyncExcludingInterval(
      this._cleanupAsync.bind(this),
      this._cleanupJobInterval,
      (err: Error) => {
        this.unsubscribe();
        callback(err);
      }
    );
  }

  /**
   * Allows caller to stop receiving callbacks.
   *
   */
  public unsubscribe(): void {
    if (
      _.isUndefined(this._callbackIfExists) ||
      _.isUndefined(this._cleanupJobIntervalIdIfExists)
    ) {
      throw new Error(MarketError.SubscriptionNotFound);
    }

    delete this._callbackIfExists;
    this._expirationWatcher.unsubscribe();
  }

  /**
   * Adds an order to the order state watcher.
   * Before the order is added, it's signature is verified.
   *
   * @param {SignedOrder} signedOrder
   */
  public async addOrder(signedOrder: SignedOrder): Promise<void> {
    const orderHash = Utils.getOrderHash(signedOrder);
    assert.isValidSignature(orderHash, signedOrder.ecSignature, signedOrder.maker);

    this._orderByOrderHash[orderHash] = signedOrder;
    await this._addToDependentOrderHashesAsync(orderHash, signedOrder);
    const expirationUnixTimestampMs = signedOrder.expirationTimestamp.times(1000);
    this._expirationWatcher.addOrder(orderHash, expirationUnixTimestampMs);
  }

  /**
   * Removes an order from the order state watcher
   *
   * @param {string} orderHash The hash of order you wish to stop
   */
  public async removeOrder(orderHash: string): Promise<void> {
    const signedOrder = this._orderByOrderHash[orderHash];
    if (_.isUndefined(signedOrder)) {
      return;
    }
    delete this._orderByOrderHash[orderHash];
    delete this._orderStateByOrderHashCache[orderHash];

    // remove dependent market token orders
    const mktTokenAddress = this._getMKTTokenAddress();
    this._removeFromDependentOrderHashes(signedOrder.maker, mktTokenAddress, orderHash);

    // remove dependent collateral token orders
    const collateralTokenAddress = await this._collateralPoolAndTokenAddressStore.getCollateralTokenAddressAsync(
      signedOrder.contractAddress
    );
    this._removeFromDependentOrderHashes(signedOrder.maker, collateralTokenAddress, orderHash);

    // remove dependent collateral pool orders
    const collateralPoolAddress = await this._collateralPoolAndTokenAddressStore.getCollateralPoolAddressAsync(
      signedOrder.contractAddress
    );
    this._removeFromDependentOrderHashes(signedOrder.maker, collateralPoolAddress, orderHash);

    this._expirationWatcher.removeOrder(orderHash);
  }

  // endregion //Public Methods
  // region Private Methods
  // *****************************************************************
  // ****                     Private Methods                     ****
  // *****************************************************************

  private _onOrderExpired(orderHash: string): void {
    const orderState: OrderState = {
      isValid: false,
      orderHash,
      error: MarketError.OrderExpired
    };

    if (!_.isUndefined(this._orderByOrderHash[orderHash])) {
      this.removeOrder(orderHash);
      if (!_.isUndefined(this._callbackIfExists)) {
        this._callbackIfExists(null, orderState);
      }
    }
  }

  /**
   * Add to dependent order hashes to keep track of
   * makers orders relating to a Market Contract and Collateral token
   *
   * @param {string} orderHash
   * @param {string} signedOrder
   */
  private async _addToDependentOrderHashesAsync(
    orderHash: string,
    signedOrder: SignedOrder
  ): Promise<void> {
    if (_.isUndefined(this._dependentOrderHashes[signedOrder.maker])) {
      this._dependentOrderHashes[signedOrder.maker] = {};
    }

    // set related orders for collateral token
    const collateralTokenAddress = await this._collateralPoolAndTokenAddressStore.getCollateralTokenAddressAsync(
      signedOrder.contractAddress
    );
    if (_.isUndefined(this._dependentOrderHashes[signedOrder.maker][collateralTokenAddress])) {
      this._dependentOrderHashes[signedOrder.maker][collateralTokenAddress] = new Set();
    }
    this._dependentOrderHashes[signedOrder.maker][collateralTokenAddress].add(orderHash);

    // set related orders for collateral pool
    const collateralPoolAddress = await this._collateralPoolAndTokenAddressStore.getCollateralPoolAddressAsync(
      signedOrder.contractAddress
    );
    if (_.isUndefined(this._dependentOrderHashes[signedOrder.maker][collateralPoolAddress])) {
      this._dependentOrderHashes[signedOrder.maker][collateralPoolAddress] = new Set();
    }
    this._dependentOrderHashes[signedOrder.maker][collateralPoolAddress].add(orderHash);

    // set related orders for market token
    const mktTokenAddress = this._getMKTTokenAddress();
    if (_.isUndefined(this._dependentOrderHashes[signedOrder.maker][mktTokenAddress])) {
      this._dependentOrderHashes[signedOrder.maker][mktTokenAddress] = new Set();
    }
    this._dependentOrderHashes[signedOrder.maker][mktTokenAddress].add(orderHash);
  }

  /**
   *
   * @param {string} makerAddress
   * @param {string} tokenAddress
   * @param {string} orderHash
   */
  private _removeFromDependentOrderHashes(
    makerAddress: string,
    tokenAddress: string,
    orderHash: string
  ) {
    if (!_.isUndefined(this._dependentOrderHashes[makerAddress][tokenAddress])) {
      this._dependentOrderHashes[makerAddress][tokenAddress].delete(orderHash);
      if (this._dependentOrderHashes[makerAddress][tokenAddress].size === 0) {
        delete this._dependentOrderHashes[makerAddress][tokenAddress];
      }
      if (_.isEmpty(this._dependentOrderHashes[makerAddress])) {
        delete this._dependentOrderHashes[makerAddress];
      }
    }
  }

  private async _cleanupAsync(): Promise<void> {
    for (const orderHash of _.keys(this._orderByOrderHash)) {
      await this._cleanupOrderRelatedStateAsync(orderHash);
      await this._emitRevalidateOrdersAsync([orderHash]);
    }
  }

  private async _cleanupOrderRelatedStateAsync(orderHash: string): Promise<void> {
    const signedOrder = this._orderByOrderHash[orderHash];
    const marketContractAddress = signedOrder.contractAddress;
    this._orderFilledCancelledStore.deleteQtyFilledOrCancelled(marketContractAddress, orderHash);

    this._collateralBalanceAndAllowanceStore.deleteCollateralBalance(
      signedOrder.contractAddress,
      signedOrder.maker
    );
    this._collateralBalanceAndAllowanceStore.deleteCollateralBalance(
      signedOrder.contractAddress,
      signedOrder.taker
    );

    const mktTokenAddress = this._getMKTTokenAddress();
    if (!signedOrder.makerFee.isZero()) {
      this._collateralBalanceAndAllowanceStore.deleteBalance(mktTokenAddress, signedOrder.maker);
      this._collateralBalanceAndAllowanceStore.deleteAllowance(
        mktTokenAddress,
        signedOrder.maker,
        signedOrder.feeRecipient
      );
    }

    if (!signedOrder.takerFee.isZero()) {
      this._collateralBalanceAndAllowanceStore.deleteBalance(mktTokenAddress, signedOrder.taker);
      this._collateralBalanceAndAllowanceStore.deleteAllowance(
        mktTokenAddress,
        signedOrder.taker,
        signedOrder.feeRecipient
      );
    }
  }

  private async _onEventWatcherCallbackAsync(
    err: Error | null,
    logIfExists?: LogEntryEvent
  ): Promise<void> {
    if (!_.isNull(err)) {
      if (!_.isUndefined(this._callbackIfExists)) {
        this._callbackIfExists(err);
        this.unsubscribe();
      }
      return;
    }
    const log = logIfExists as LogEntryEvent;
    const decodedLog = this._abiDecoder.decodeLogEntryEvent<ContractEventArgs>(log);
    let makerToken: string;
    let makerAddress: string;
    let orderHash: string;
    switch (decodedLog.event) {
      case TokenEvents.Approval:
        // Invalidate cache
        const approvalArgs = decodedLog.args as ApprovalContractEventArgs;
        this._collateralBalanceAndAllowanceStore.deleteAllowance(
          decodedLog.address,
          approvalArgs.owner,
          approvalArgs.spender
        );

        // Revalidate orders
        makerToken = decodedLog.address;
        makerAddress = approvalArgs.owner;
        if (
          !_.isUndefined(this._dependentOrderHashes[makerAddress]) &&
          !_.isUndefined(this._dependentOrderHashes[makerAddress][makerToken])
        ) {
          const orderHashes = Array.from(this._dependentOrderHashes[makerAddress][makerToken]);
          await this._emitRevalidateOrdersAsync(orderHashes);
        }
        break;

      case TokenEvents.Transfer:
        // Invalidate cache
        const transferArgs = decodedLog.args as TransferContractEventArgs;
        this._collateralBalanceAndAllowanceStore.deleteBalance(
          decodedLog.address,
          transferArgs.from
        );
        this._collateralBalanceAndAllowanceStore.deleteBalance(decodedLog.address, transferArgs.to);

        // Revalidate orders
        makerToken = decodedLog.address;
        makerAddress = transferArgs.from;
        if (
          !_.isUndefined(this._dependentOrderHashes[makerAddress]) &&
          !_.isUndefined(this._dependentOrderHashes[makerAddress][makerToken])
        ) {
          const orderHashes = Array.from(this._dependentOrderHashes[makerAddress][makerToken]);
          await this._emitRevalidateOrdersAsync(orderHashes);
        }
        break;

      case MarketTokenEvents.UserUpdatedLockedBalance:
        // user has updated his locked tokens
        const updatedArgs = decodedLog.args as UserUpdatedLockedBalanceEventArgs;
        makerToken = decodedLog.address;
        makerAddress = updatedArgs.userAddress; // ideally should be maker address

        // invalidate
        this._collateralBalanceAndAllowanceStore.deleteBalance(makerToken, makerAddress);

        if (
          !_.isUndefined(this._dependentOrderHashes[makerAddress]) &&
          !_.isUndefined(this._dependentOrderHashes[makerAddress][makerToken])
        ) {
          const orderHashes = Array.from(this._dependentOrderHashes[makerAddress][makerToken]);
          await this._emitRevalidateOrdersAsync(orderHashes);
        }
        break;

      case MarketContractEvents.OrderFilled: {
        const filledOrderArgs = decodedLog.args as OrderFilledEventArgs;
        orderHash = filledOrderArgs.orderHash;
        const signedOrder = this._orderByOrderHash[orderHash];
        if (!_.isUndefined(signedOrder)) {
          this._orderFilledCancelledStore.deleteQtyFilledOrCancelled(
            signedOrder.contractAddress,
            orderHash
          );
          await this._emitRevalidateOrdersAsync([orderHash]);
        }
        break;
      }
      case MarketContractEvents.OrderCancelled: {
        const orderCancelledArgs = decodedLog.args as OrderCancelledEventArgs;
        orderHash = orderCancelledArgs.orderHash;
        const signedOrder = this._orderByOrderHash[orderHash];
        if (!_.isUndefined(signedOrder)) {
          this._orderFilledCancelledStore.deleteQtyFilledOrCancelled(
            signedOrder.contractAddress,
            orderHash
          );
          await this._emitRevalidateOrdersAsync([orderHash]);
        }
        break;
      }
      case CollateralPoolEvents.UpdatedUserBalance: {
        const args = decodedLog.args as UpdatedUserBalanceEventArgs;
        const collateralPoolAddress = decodedLog.address;
        makerAddress = args.user;

        if (
          !_.isUndefined(this._dependentOrderHashes[makerAddress]) &&
          !_.isUndefined(this._dependentOrderHashes[makerAddress][collateralPoolAddress])
        ) {
          const orderHashes = Array.from(
            this._dependentOrderHashes[makerAddress][collateralPoolAddress]
          );
          // first invalidate collateral balance caches
          for (const hashes of orderHashes) {
            const signedOrder = this._orderByOrderHash[hashes];
            if (!_.isUndefined(signedOrder)) {
              this._collateralBalanceAndAllowanceStore.deleteCollateralBalance(
                signedOrder.contractAddress,
                makerAddress
              );
            }
          }

          // next revalidate orders
          await this._emitRevalidateOrdersAsync(orderHashes);
        }
        break;
      }
      default:
        console.log(`Unhandled switch value: decodedLog.event encountered for ${decodedLog.event}`);
    }
  }

  private async _emitRevalidateOrdersAsync(orderHashes: string[]): Promise<void> {
    for (const orderHash of orderHashes) {
      const signedOrder = this._orderByOrderHash[orderHash];
      const orderState = await this._orderStateUtils.getOrderStateAsync(signedOrder);
      if (_.isUndefined(this._callbackIfExists)) {
        break; // callback doesn't exist
      }

      if (!_.isEqual(orderState, this._orderStateByOrderHashCache[orderHash])) {
        // state has changes
        this._orderStateByOrderHashCache[orderHash] = orderState;
        this._callbackIfExists(null, orderState);
      }
    }
  }

  private _getMKTTokenAddress(): string {
    return this._market.mktTokenContract.address;
  }

  // endregion //Private Methods
  // region Event Handlers
  // *****************************************************************
  // ****                     Event Handlers                     ****
  // *****************************************************************
  // endregion //Event Handlers
}
