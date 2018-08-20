import * as _ from 'lodash';

import { ContractWrapper } from '../contract_wrappers/ContractWrapper';

/**
 * Cache to make fetching collateral pool and collateral token addresses
 * for orders easy.
 *
 */
export class OrderCollateralPoolAndTokenLazyStore {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  private _poolAddresses: {
    [marketContractAddress: string]: string;
  };

  private _tokenAddreses: {
    [marketContractAddress: string]: string;
  };

  private _contractWrapper: ContractWrapper;
  // endregion // members

  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************
  constructor(marketContractWrapper: ContractWrapper) {
    this._contractWrapper = marketContractWrapper;
    this._poolAddresses = {};
    this._tokenAddreses = {};
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
   * Get collateral pool address for an market contract and caches it.
   * If address is already cached, the cached value is returned.
   *
   * @param {string} contractAddress Market Contract's Address
   */
  public async getCollateralPoolAddressAsync(contractAddress: string): Promise<string> {
    if (_.isUndefined(this._poolAddresses[contractAddress])) {
      const poolAddress = await this._contractWrapper.getCollateralPoolContractAddressAsync(
        contractAddress
      );
      this.setCollateralPoolAddress(contractAddress, poolAddress);
    }
    const cachedAddress = this._poolAddresses[contractAddress];
    return cachedAddress;
  }

  /**
   * Set the collateral pool address for the order in the store (cache locally).
   *
   * @param {string} contractAddress
   * @param {string} collateralPoolAddress
   */
  public setCollateralPoolAddress(contractAddress: string, collateralPoolAddress: string): void {
    this._poolAddresses[contractAddress] = collateralPoolAddress;
  }

  /**
   * Delete the cached collateral pool address for this order
   *
   * @param {string} contractAddress
   */
  public deleteCollateralPoolAddress(contractAddress: string): void {
    delete this._poolAddresses[contractAddress];
  }

  /**
   * Get collateral token address for a market contract and caches it.
   * If address is already cached, the cached value is returned.
   *
   * @param {string} contractAddress Market Contract address
   */
  public async getCollateralTokenAddressAsync(contractAddress: string): Promise<string> {
    if (_.isUndefined(this._tokenAddreses[contractAddress])) {
      const collateralTokenAddress = await this._contractWrapper.getCollateralTokenAddressAsync(
        contractAddress
      );
      this.setCollateralTokenAddress(contractAddress, collateralTokenAddress);
    }
    const cachedAddress = this._tokenAddreses[contractAddress];
    return cachedAddress;
  }

  /**
   * Set the collateral token address for the order in the store (cache locally).
   *
   * @param {string} contractAddress
   * @param {string} collateralTokenAddress
   */
  public setCollateralTokenAddress(contractAddress: string, collateralTokenAddress: string): void {
    this._tokenAddreses[contractAddress] = collateralTokenAddress;
  }

  /**
   * Delete the cached collateral token address for this order
   *
   * @param {string} contractAddress
   */
  public deleteCollateralTokenAddress(contractAddress: string): void {
    delete this._tokenAddreses[contractAddress];
  }

  /**
   * Deletes all stored balances and allowances
   *
   */
  public deleteAll(): void {
    this._poolAddresses = {};
    this._tokenAddreses = {};
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
