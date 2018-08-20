import BigNumber from 'bignumber.js';

export interface OrderRelevantState {
  neededMakerCollateral: BigNumber;
  makerCollateralBalance: BigNumber;
  makerFeeBalance: BigNumber;
  makerFeeAllowance: BigNumber;
  remainingFillableQty: BigNumber;
  remainingMakerFillableQty: BigNumber; // remaining qty fillable by maker
  remainingTakerFillableQty: BigNumber; // remaining qty fillable by taker
}

export interface OrderStateValid {
  isValid: true;
  orderHash: string;
  orderRelevantState: OrderRelevantState;
}

export interface OrderStateInvalid {
  isValid: false;
  orderHash: string;
  error: string;
}

export type OrderState = OrderStateValid | OrderStateInvalid;

export type OnOrderStateChangeCallback = (err: Error | null, orderState?: OrderState) => void;
