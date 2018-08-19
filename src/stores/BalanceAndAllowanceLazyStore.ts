import { BigNumber } from 'bignumber.js';
import * as _ from 'lodash';

import { ContractWrapper } from '../contract_wrappers/ContractWrapper';

/**
 * Store to keep track of token balances and allowances
 *
 * Also used to keep track of collateral balance
 *
 */
export class BalanceAndAllowanceLazyStore {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************

  private _contractWrapper: ContractWrapper;

  // keep track of balances of tokens
  private _balance: {
    [tokenAddress: string]: {
      [userAddress: string]: BigNumber;
    };
  };

  private _collateralBalance: {
    [marketContractAddress: string]: {
      [userAddress: string]: BigNumber;
    };
  };

  // keep track of allowances set
  private _allowance: {
    [tokenAddress: string]: {
      [userAddress: string]: {
        [spendersAddress: string]: BigNumber;
      };
    };
  };

  // endregion // members
  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************

  constructor(contractWrapper: ContractWrapper) {
    this._contractWrapper = contractWrapper;
    this._balance = {};
    this._collateralBalance = {};
    this._allowance = {};
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
   * Get balance of user for a token and caches it.
   * If balance is already cached, the cached value is returned.
   *
   * @param {string} tokenAddress Address of token to get balance
   * @param {string} userAddress Address of user
   */
  public async getBalanceAsync(tokenAddress: string, userAddress: string): Promise<BigNumber> {
    if (
      _.isUndefined(this._balance[tokenAddress]) ||
      _.isUndefined(this._balance[tokenAddress][userAddress])
    ) {
      const balance = await this._contractWrapper.getBalanceAsync(tokenAddress, userAddress);
      this.setBalance(tokenAddress, userAddress, balance);
    }
    const cachedBalance = this._balance[tokenAddress][userAddress];
    return cachedBalance;
  }

  /**
   * Set the balance for the user in the store (cache locally).
   *
   * @param {string} tokenAddress
   * @param {string} userAddress
   * @param {BigNumber} balance
   */
  public setBalance(tokenAddress: string, userAddress: string, balance: BigNumber): void {
    if (_.isUndefined(this._balance[tokenAddress])) {
      this._balance[tokenAddress] = {};
    }
    this._balance[tokenAddress][userAddress] = balance;
  }

  /**
   * Delete the cached balance for this user
   *
   * @param {string} tokenAddress
   * @param {string} userAddress
   */
  public deleteBalance(tokenAddress: string, userAddress: string): void {
    if (!_.isUndefined(this._balance[tokenAddress])) {
      delete this._balance[tokenAddress][userAddress];
      if (_.isEmpty(this._balance[tokenAddress])) {
        delete this._balance[tokenAddress];
      }
    }
  }

  /**
   * Fetch users allowance for token and caches it.
   * If allowance is already cached. The cached value is returned.
   *
   * @param {string} tokenAddress
   * @param {string} userAddress
   * @param {string} spendersAddress
   */
  public async getAllowanceAsync(
    tokenAddress: string,
    userAddress: string,
    spendersAddress: string
  ): Promise<BigNumber> {
    if (
      _.isUndefined(this._allowance[tokenAddress]) ||
      _.isUndefined(
        this._allowance[tokenAddress][userAddress] ||
          _.isUndefined(this._allowance[tokenAddress][userAddress][spendersAddress])
      )
    ) {
      const proxyAllowance = await this._contractWrapper.getAllowanceAsync(
        tokenAddress,
        userAddress,
        spendersAddress
      );
      this.setAllowance(tokenAddress, userAddress, spendersAddress, proxyAllowance);
    }
    const cachedProxyAllowance = this._allowance[tokenAddress][userAddress][spendersAddress];
    return cachedProxyAllowance;
  }

  /**
   * Store allowance in cache
   *
   * @param {string} tokenAddress
   * @param {string} userAddress
   * @param {string} spendersAddress
   * @param {string} allowance
   */
  public setAllowance(
    tokenAddress: string,
    userAddress: string,
    spendersAddress: string,
    allowance: BigNumber
  ): void {
    _.set(this._allowance, `${tokenAddress}.${userAddress}.${spendersAddress}`, allowance);
  }

  /**
   * Delete token allowance for user from cache
   *
   * @param {string} tokenAddress
   * @param {string} userAddress
   * @param {string} spendersAddress
   */
  public deleteAllowance(tokenAddress: string, userAddress: string, spendersAddress: string): void {
    if (!_.isUndefined(this._allowance[tokenAddress])) {
      if (!_.isUndefined(this._allowance[tokenAddress][userAddress])) {
        delete this._allowance[tokenAddress][userAddress][spendersAddress];
      }

      // cleanup if empty
      if (_.isEmpty(this._allowance[tokenAddress][userAddress])) {
        delete this._allowance[tokenAddress][userAddress];
      }

      if (_.isEmpty(this._allowance[tokenAddress])) {
        delete this._allowance[tokenAddress];
      }
    }
  }

  /**
   * Get balance of user deposited in the collateral pool.
   * If balance is already cached, the cached value is returned.
   *
   * @param {string} contractAddress Market Contract Address
   * @param {string} userAddress Address of user
   * @returns {Promise<BigNumber>} Collateral balance
   */
  public async getCollateralBalanceAsync(
    contractAddress: string,
    userAddress: string
  ): Promise<BigNumber> {
    if (
      _.isUndefined(this._collateralBalance[contractAddress]) ||
      _.isUndefined(this._collateralBalance[contractAddress][userAddress])
    ) {
      const balance = await this._contractWrapper.getUserUnallocatedCollateralBalanceAsync(
        contractAddress,
        userAddress
      );
      this.setCollateralBalance(contractAddress, userAddress, balance);
    }
    const cachedBalance = this._collateralBalance[contractAddress][userAddress];
    return cachedBalance;
  }

  /**
   * Set the collateral balance for the user in the store (cache locally).
   *
   * @param {string} contractAddress
   * @param {string} userAddress
   * @param {BigNumber} balance
   */
  public setCollateralBalance(
    contractAddress: string,
    userAddress: string,
    balance: BigNumber
  ): void {
    if (_.isUndefined(this._collateralBalance[contractAddress])) {
      this._collateralBalance[contractAddress] = {};
    }
    this._collateralBalance[contractAddress][userAddress] = balance;
  }

  /**
   * Delete the cached collateral balance for this user
   *
   * @param {string} contractAddress Market Contract Address
   * @param {string} userAddress User Address
   */
  public deleteCollateralBalance(contractAddress: string, userAddress: string): void {
    if (!_.isUndefined(this._collateralBalance[contractAddress])) {
      delete this._collateralBalance[contractAddress][userAddress];
      if (_.isEmpty(this._collateralBalance[contractAddress])) {
        delete this._collateralBalance[contractAddress];
      }
    }
  }

  /**
   * Deletes all stored balances and allowances
   *
   */
  public deleteAll(): void {
    this._balance = {};
    this._allowance = {};
    this._collateralBalance = {};
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
