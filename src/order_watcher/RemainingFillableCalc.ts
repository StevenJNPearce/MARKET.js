import { BigNumber } from 'bignumber.js';

// Types
import { MarketError } from '../types';
import { SignedOrder } from '@marketprotocol/types';
import { Market } from '../Market';
import { constants } from '../constants';

/**
 * This class includes the functionality to calculate remaining fillable amount of the order.
 * Amount fillable depends on order, a new one or partially filled and amount of collateral.
 */
export class RemainingFillableCalculator {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  //
  private _market: Market;
  private _signedOrder: SignedOrder;
  private _signedOrderHash: string;
  private _collateralPoolAddress: string;
  private _collateralTokenAddress: string;

  // endregion // members

  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************
  //
  constructor(
    market: Market,
    collateralPoolAddress: string,
    collateralTokenAddress: string,
    signedOrder: SignedOrder,
    signedOrderHash: string
  ) {
    this._market = market;
    this._collateralTokenAddress = collateralTokenAddress;
    this._collateralPoolAddress = collateralPoolAddress;
    this._signedOrder = signedOrder;
    this._signedOrderHash = signedOrderHash;
  }
  //
  //
  // endregion // Constructors

  // region Public Methods
  // *****************************************************************
  // ****                     Public Methods                      ****
  // *****************************************************************

  public async computeRemainingMakerFillable(): Promise<BigNumber> {
    let fillableQty: BigNumber;
    const hasAvailableFeeFunds: boolean = await this._hasMakerSufficientFundsForFee();

    if (!hasAvailableFeeFunds) {
      return Promise.reject<BigNumber>(new Error(MarketError.InsufficientBalanceForTransfer));
    }

    const makerAvailableCollateral = await this._getAvailableCollateral(this._signedOrder.maker);
    const neededCollateral = await this._market.calculateNeededCollateralAsync(
      this._signedOrder.contractAddress,
      this._signedOrder.orderQty,
      this._signedOrder.price
    );

    const alreadyFilledOrCancelled = await this._market.getQtyFilledOrCancelledFromOrderAsync(
      this._signedOrder.contractAddress,
      this._signedOrderHash
    );

    const remainingToFill = this._signedOrder.orderQty.minus(alreadyFilledOrCancelled);

    fillableQty = makerAvailableCollateral
      .dividedBy(neededCollateral)
      .times(this._signedOrder.orderQty);

    return BigNumber.min(fillableQty, remainingToFill);
  }

  public async computeRemainingTakerFillable(): Promise<BigNumber> {
    const makerFillable = await this.computeRemainingMakerFillable();
    if (this._signedOrder.taker === constants.NULL_ADDRESS) {
      // open ended order so makers fillable quantity
      return makerFillable;
    }

    const takerAvailableCollateral = await this._getAvailableCollateral(this._signedOrder.taker);
    const hasAvailableFeeFunds: boolean = await this._hasTakerSufficientFundsForFee();

    if (!hasAvailableFeeFunds) {
      return Promise.reject<BigNumber>(new Error(MarketError.InsufficientBalanceForTransfer));
    }

    const neededCollateral = await this._market.calculateNeededCollateralAsync(
      this._signedOrder.contractAddress,
      this._signedOrder.orderQty,
      this._signedOrder.price
    );

    let takerFillable = takerAvailableCollateral
      .dividedBy(neededCollateral)
      .times(this._signedOrder.orderQty);

    return BigNumber.min(makerFillable, takerFillable);
  }

  // endregion // Public Methods

  // region Private Methods
  // *****************************************************************
  // ****                     Private Methods                     ****
  // *****************************************************************

  private async _hasMakerSufficientFundsForFee(): Promise<boolean> {
    const makerMktBalance = await this._getAvailableFeeFunds(this._signedOrder.maker);
    const makerFeeNeeded = this._signedOrder.makerFee;

    return makerMktBalance.gte(makerFeeNeeded);
  }

  private async _hasTakerSufficientFundsForFee(): Promise<boolean> {
    const takerMktBalance = await this._getAvailableFeeFunds(this._signedOrder.taker);
    const takerFeeNeeded = this._signedOrder.takerFee;

    return takerMktBalance.gte(takerFeeNeeded);
  }

  private async _getAvailableFeeFunds(accountAddress: string): Promise<BigNumber> {
    const allowance = new BigNumber(
      await this._market.marketContractWrapper.getAllowanceAsync(
        this._market.mktTokenContract.address,
        accountAddress,
        this._signedOrder.feeRecipient
      )
    );

    if (
      (accountAddress === this._signedOrder.maker &&
        allowance.isLessThan(this._signedOrder.makerFee)) ||
      (accountAddress === this._signedOrder.taker &&
        allowance.isLessThan(this._signedOrder.takerFee))
    ) {
      return Promise.reject<BigNumber>(new Error(MarketError.InsufficientAllowanceForTransfer));
    }

    const funds = await this._market.marketContractWrapper.getBalanceAsync(
      this._market.mktTokenContract.address,
      accountAddress
    );
    return funds;
  }

  private async _getAvailableCollateral(accountAddress: string): Promise<BigNumber> {
    const balance = await this._market.getUserUnallocatedCollateralBalanceAsync(
      this._signedOrder.contractAddress,
      accountAddress
    );
    return balance || new BigNumber(0);
  }
  // endregion // Private Methods
}
