import BigNumber from 'bignumber.js';
import * as _ from 'lodash';
import { ContractWrapper } from '../contract_wrappers/ContractWrapper';

interface InstanceFilledCancelledStore {
  filledOrCancelledQty: {
    [orderHash: string]: BigNumber;
  };
}

export class OrderFilledCancelledLazyStore {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  private _stores: {
    [marketContractAddress: string]: InstanceFilledCancelledStore;
  };
  private _marketContractWrapper: ContractWrapper;
  // endregion // members

  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************
  constructor(marketContractWrapper: ContractWrapper) {
    this._marketContractWrapper = marketContractWrapper;
    this._stores = {};
  }
  // endregion//Constructors

  // *****************************************************************
  // ****                     Public Methods                      ****
  // *****************************************************************

  /***
   * gets the currently filled or cancelled qty from our store.
   * @param {string} marketContractAddress address of the contract
   * @param {string} orderHash hash of the order
   * @returns {Promise<BigNumber>}
   */
  public async getQtyFilledOrCancelledAsync(
    marketContractAddress: string,
    orderHash: string
  ): Promise<BigNumber> {
    if (_.isUndefined(this._stores[marketContractAddress])) {
      this._stores[marketContractAddress] = {
        filledOrCancelledQty: {}
      };
    }
    if (_.isUndefined(this._stores[marketContractAddress].filledOrCancelledQty[orderHash])) {
      const qty = await this._marketContractWrapper.getQtyFilledOrCancelledFromOrderAsync(
        marketContractAddress,
        orderHash
      );
      this.setQtyFilledOrCancelled(marketContractAddress, orderHash, qty);
    }
    return this._stores[marketContractAddress].filledOrCancelledQty[orderHash];
  }

  /***
   * Sets the current qty that is no longer able to be filled that is either cancelled or filled.
   * @param {string} marketContractAddress
   * @param {string} orderHash
   * @param {BigNumber} quantity
   */
  public setQtyFilledOrCancelled(
    marketContractAddress: string,
    orderHash: string,
    quantity: BigNumber
  ) {
    this._stores[marketContractAddress].filledOrCancelledQty[orderHash] = quantity;
  }

  /***
   * Deletes a specific order has from our store.
   * @param {string} marketContractAddress
   * @param {string} orderHash
   */
  public deleteQtyFilledOrCancelled(marketContractAddress: string, orderHash: string) {
    if (!_.isUndefined(this._stores[marketContractAddress])) {
      delete this._stores[marketContractAddress].filledOrCancelledQty[orderHash];
    }
  }

  /***
   * clears all stores.
   */
  public deleteAll(): void {
    this._stores = {};
  }
  // endregion //Public Methods
}
