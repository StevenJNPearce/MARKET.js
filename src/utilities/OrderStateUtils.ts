import BigNumber from 'bignumber.js';

import {
  BalanceAndAllowanceLazyStore,
  OrderCollateralPoolAndTokenLazyStore,
  OrderFilledCancelledLazyStore
} from '../stores';
import { SignedOrder } from '@marketprotocol/types';
import {
  MarketError,
  OrderRelevantState,
  OrderState,
  OrderStateInvalid,
  OrderStateValid
} from '../types';
import { Utils } from '../lib/Utils';
import { RemainingFillableCalculator } from '../order_watcher/RemainingFillableCalc';
import { Market } from '..';

/**
 * Utility class for computing and returning the state of an order.
 */
export class OrderStateUtils {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  private _market: Market;
  private _orderFilledCancelledLazyStore: OrderFilledCancelledLazyStore;
  private _balanceAndAllowanceLazyStore: BalanceAndAllowanceLazyStore;
  private _collateralPoolAndTokenAddressLazyStore: OrderCollateralPoolAndTokenLazyStore;

  // endregion // members
  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************

  constructor(
    contractWrapper: Market,
    balanceAndProxyAllowanceLazyStore: BalanceAndAllowanceLazyStore,
    orderFilledCancelledLazyStore: OrderFilledCancelledLazyStore,
    collateralPoolAndTokenAddressLazyStore: OrderCollateralPoolAndTokenLazyStore
  ) {
    this._market = contractWrapper;
    this._balanceAndAllowanceLazyStore = balanceAndProxyAllowanceLazyStore;
    this._orderFilledCancelledLazyStore = orderFilledCancelledLazyStore;
    this._collateralPoolAndTokenAddressLazyStore = collateralPoolAndTokenAddressLazyStore;
  }

  // endregion//Constructors
  // region Properties
  // *****************************************************************
  // ****                     Properties                          ****
  // *****************************************************************

  private static _validateIfOrderIsValid(
    signedOrder: SignedOrder,
    orderRelevantState: OrderRelevantState
  ): void {
    if (orderRelevantState.makerCollateralBalance.lt(orderRelevantState.neededMakerCollateral)) {
      throw new Error(MarketError.InsufficientCollateralBalance);
    }

    if (orderRelevantState.remainingMakerFillableQty.eq(0)) {
      throw new Error(MarketError.OrderDead);
    }

    const notEnoughFees = signedOrder.makerFee.gt(orderRelevantState.makerFeeBalance);
    const notEnoughtFeeAllowance = signedOrder.makerFee.gt(orderRelevantState.makerFeeAllowance);

    if (notEnoughFees) {
      throw new Error(MarketError.InsufficientBalanceForTransfer);
    }

    if (notEnoughtFeeAllowance && notEnoughFees) {
      // only throws if fees is not enough
      throw new Error(MarketError.InsufficientAllowanceForTransfer);
    }
  }

  // endregion //Properties
  // region Public Methods
  // *****************************************************************
  // ****                     Public Methods                      ****
  // *****************************************************************
  public async getOrderStateAsync(signedOrder: SignedOrder): Promise<OrderState> {
    const orderHash = Utils.getOrderHash(signedOrder);
    try {
      const orderRelevantState = await this.getOrderRelevantStateAsync(signedOrder);
      OrderStateUtils._validateIfOrderIsValid(signedOrder, orderRelevantState);
      const orderState: OrderStateValid = {
        isValid: true,
        orderHash,
        orderRelevantState
      };
      return orderState;
    } catch (err) {
      const orderState: OrderStateInvalid = {
        isValid: false,
        orderHash,
        error: err.message
      };
      return orderState;
    }
  }

  public async getOrderRelevantStateAsync(signedOrder: SignedOrder): Promise<OrderRelevantState> {
    const mktTokenAddress = this._market.mktTokenContract.address;
    const mtkContractAddress = signedOrder.contractAddress;
    const collateralPoolAddress = await this._collateralPoolAndTokenAddressLazyStore.getCollateralPoolAddressAsync(
      mtkContractAddress
    );
    const collateralTokenAddress = await this._collateralPoolAndTokenAddressLazyStore.getCollateralTokenAddressAsync(
      mtkContractAddress
    );

    // TODO: needed collateral values should be cached too.
    const neededMakerCollateral = await this._market.calculateNeededCollateralAsync(
      mtkContractAddress,
      signedOrder.orderQty,
      signedOrder.price
    );

    const orderHash = Utils.getOrderHash(signedOrder);

    const makerCollateralBalance = await this._balanceAndAllowanceLazyStore.getCollateralBalanceAsync(
      mtkContractAddress,
      signedOrder.maker
    );

    const makerFeeBalance = await this._balanceAndAllowanceLazyStore.getBalanceAsync(
      mktTokenAddress,
      signedOrder.maker
    );

    const makerFeeAllowance = await this._balanceAndAllowanceLazyStore.getAllowanceAsync(
      mktTokenAddress,
      signedOrder.maker,
      signedOrder.feeRecipient
    );
    const qtyFilledOrCancelled = await this._orderFilledCancelledLazyStore.getQtyFilledOrCancelledAsync(
      mtkContractAddress,
      orderHash
    );
    const remainingFillableQty = signedOrder.orderQty.minus(qtyFilledOrCancelled);
    const remainingFillableCalculator = new RemainingFillableCalculator(
      this._market,
      collateralPoolAddress,
      collateralTokenAddress,
      signedOrder,
      orderHash
    );

    // TODO(perfect): refactor this to prevent network request all the time.
    const remainingMakerFillableQty = await remainingFillableCalculator.computeRemainingMakerFillable();
    const remainingTakerFillableQty = await remainingFillableCalculator.computeRemainingTakerFillable();
    const orderRelevantState = {
      neededMakerCollateral,
      makerCollateralBalance,
      makerFeeBalance,
      makerFeeAllowance,
      remainingFillableQty,
      remainingMakerFillableQty,
      remainingTakerFillableQty
    };
    return orderRelevantState;
  }

  // endregion //Public Methods
  // region Private Methods
  // *****************************************************************
  // ****                     Private Methods                     ****
  // *****************************************************************
  // endregion //Private Methods
  // region Event Handlers
  // *****************************************************************
  // ****                     Event Handlers                     ****
  // *****************************************************************
  // endregion //Event Handlers
}
