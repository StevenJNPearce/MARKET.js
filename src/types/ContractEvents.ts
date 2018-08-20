import BigNumber from 'bignumber.js';

export enum TokenEvents {
  Approval = 'Approval',
  Transfer = 'Transfer'
}

export enum MarketContractEvents {
  UpdatedLastPrice = 'UpdatedLastPrice',
  ContractSettled = 'ContractSettled',
  OrderFilled = 'OrderFilled',
  OrderCancelled = 'OrderCancelled',
  Error = 'Error'
}

export enum MarketTokenEvents {
  UserUpdatedLockedBalance = 'UpdatedUserLockedBalance'
}

export enum CollateralPoolEvents {
  UpdatedUserBalance = 'UpdatedUserBalance',
  UpdatedPoolBalance = 'UpdatedPoolBalance'
}

export interface ApprovalContractEventArgs {
  owner: string;
  spender: string;
  value: string;
}
export interface TransferContractEventArgs {
  from: string;
  to: string;
  value: string;
}
export interface UserUpdatedLockedBalanceEventArgs {
  contractAddress: string;
  userAddress: string;
  balance: BigNumber;
}
export interface OrderFilledEventArgs {
  maker: string;
  taker: string;
  feeRecipient: string;
  filledQty: BigNumber;
  paidMakerFee: BigNumber;
  paidTakerFee: BigNumber;
  orderHash: string;
}
export interface OrderCancelledEventArgs {
  maker: string;
  feeRecipient: string;
  cancelledQty: BigNumber;
  orderHash: string;
}

export interface UpdatedUserBalanceEventArgs {
  user: string;
  balance: BigNumber;
}

export type TokenContractEventsArgs = ApprovalContractEventArgs | TransferContractEventArgs;

export interface MarketContractEventArgs {}

export type ContractEventArgs = MarketContractEventArgs | TokenContractEventsArgs;
