/**
 * Wrapper for all contracts that make up a given set of Market Protocol smart contracts
 */
import { ERC20, MarketCollateralPool, MarketContractOraclize } from '@marketprotocol/types';
import { ContractSet } from './ContractSet';
import { ContractMetaData, OraclizeContractMetaData } from '../types/ContractMetaData';

export class OraclizeContractSet extends ContractSet {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  public readonly marketContractOraclize: MarketContractOraclize;
  // endregion // members

  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************
  constructor(
    marketContractOraclize: MarketContractOraclize,
    marketCollateralPool: MarketCollateralPool,
    erc20: ERC20
  ) {
    super(marketContractOraclize, marketCollateralPool, erc20);
    this.marketContractOraclize = marketContractOraclize;
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
   * gets a contract meta data object for our oraclize contracts.
   * @return {Promise<OraclizeContractMetaData>}
   */
  public async getContractMetaDataAsync(): Promise<OraclizeContractMetaData> {
    return {
      ...(await super.getContractMetaDataAsync()),
      lastPriceQueryResult: await this.marketContractOraclize.lastPriceQueryResult,
      oracleDataSource: await this.marketContractOraclize.ORACLE_DATA_SOURCE,
      oracleQuery: await this.marketContractOraclize.ORACLE_QUERY
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
