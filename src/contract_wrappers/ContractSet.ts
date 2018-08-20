import { ERC20, MarketCollateralPool, MarketContract } from '@marketprotocol/types';
import { ContractMetaData } from '../types/ContractMetaData';

/**
 * Wrapper for all contracts that make up a given set of Market Protocol smart contracts
 */
export class ContractSet {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  public readonly marketContract: MarketContract;
  public readonly marketCollateralPool: MarketCollateralPool;
  public readonly collateralToken: ERC20;
  // endregion // members

  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************
  constructor(
    marketContract: MarketContract,
    marketCollateralPool: MarketCollateralPool,
    erc20: ERC20
  ) {
    this.marketContract = marketContract;
    this.marketCollateralPool = marketCollateralPool;
    this.collateralToken = erc20;
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
   * Returns all contract meta data for contract set.
   * @return {Promise<ContractMetaData>}
   */
  public async getContractMetaDataAsync(): Promise<ContractMetaData> {
    return {
      contractName: await this.marketContract.CONTRACT_NAME,
      contractAddress: await this.marketContract.address,
      creator: await this.marketContract.creator,
      collateralPoolAddress: await this.marketContract.MARKET_COLLATERAL_POOL_ADDRESS,
      collateralTokenAddress: await this.marketContract.COLLATERAL_TOKEN_ADDRESS,
      collateralPoolBalance: await this.marketCollateralPool.collateralPoolBalance,
      contractCreator: await this.marketContract.creator,
      expirationTimeStamp: await this.marketContract.EXPIRATION,
      isSettled: await this.marketContract.isSettled,
      settlementPrice: await this.marketContract.settlementPrice,
      lastPrice: await this.marketContract.lastPrice,
      priceCap: await this.marketContract.PRICE_CAP,
      priceFloor: await this.marketContract.PRICE_FLOOR,
      priceDecimalPlaces: await this.marketContract.PRICE_DECIMAL_PLACES,
      qtyMultiplier: await this.marketContract.QTY_MULTIPLIER
    };
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
