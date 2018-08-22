import { BigNumber } from 'bignumber.js';
import Web3 from 'web3';

// Types
import { ITxParams, MarketContractOraclize } from '@marketprotocol/types';

import { Market } from '../src';
import { constants } from '../src/constants';
import { getContractAddress } from './utils';
import { MARKETProtocolConfig } from '../src/types';

describe('Deployment Tests', () => {
  const GAS_LIMIT = 4000000;
  const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));
  let deployMarketContract: MarketContractOraclize;
  const config: MARKETProtocolConfig = {
    networkId: constants.NETWORK_ID_TRUFFLE
  };
  const market: Market = new Market(web3.currentProvider, config);

  let collateralTokenAddress;
  let quickExpirationTimeStamp;
  let contractSpecs;
  let txParams;
  let contractName;
  let oracleDataSource;
  let oracleQuery;
  let txHash;
  let deployedAddress;

  beforeAll(async () => {
    collateralTokenAddress = getContractAddress('CollateralToken', constants.NETWORK_ID_TRUFFLE);
    quickExpirationTimeStamp = new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60); // expires in an hour
    contractSpecs = [
      new BigNumber(50000),
      new BigNumber(150000),
      new BigNumber(2),
      new BigNumber(1e18),
      quickExpirationTimeStamp
    ];
    txParams = { from: web3.eth.accounts[1], gas: GAS_LIMIT };
    contractName = 'TestContract';
    oracleDataSource = 'URL';
    oracleQuery = 'json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0';

    txHash = await market.deployMarketContractOraclizeAsync(
      contractName,
      collateralTokenAddress,
      contractSpecs,
      oracleDataSource,
      oracleQuery,
      txParams
    );

    deployedAddress = await market.getDeployedMarketContractAddressFromTxHash(
      web3.eth.accounts[1],
      txHash,
      0
    );
  });

  it('Deploys a MARKET Contract Correctly', async () => {
    jest.setTimeout(30000);

    deployMarketContract = await MarketContractOraclize.createAndValidate(web3, deployedAddress);
    expect(await deployMarketContract.CONTRACT_NAME).toEqual(contractName);
    expect(await deployMarketContract.COLLATERAL_TOKEN_ADDRESS).toEqual(collateralTokenAddress);
    expect(await deployMarketContract.creator).toEqual(web3.eth.accounts[1]);
    expect(await deployMarketContract.EXPIRATION).toEqual(quickExpirationTimeStamp);
    expect(await deployMarketContract.ORACLE_DATA_SOURCE).toEqual(oracleDataSource);
    expect(await deployMarketContract.ORACLE_QUERY).toEqual(oracleQuery);
    expect(await deployMarketContract.MARKET_COLLATERAL_POOL_ADDRESS).toEqual(
      '0x0000000000000000000000000000000000000000'
    );
  });

  it('Deploys and links a MARKET Collateral Pool Correctly', async () => {
    await market.deployMarketCollateralPoolAsync(deployMarketContract.address, txParams);

    expect(await deployMarketContract.isCollateralPoolContractLinked).toEqual(true);
    expect(await deployMarketContract.COLLATERAL_POOL_FACTORY_ADDRESS).toEqual(
      market.marketCollateralPoolFactory.address
    );
    expect(await deployMarketContract.MARKET_COLLATERAL_POOL_ADDRESS).not.toEqual(
      '0x0000000000000000000000000000000000000000'
    );

    const contractMetaData = await market.getContractMetaDataAsync(deployMarketContract.address);
    expect(contractMetaData.contractName).toEqual(await deployMarketContract.CONTRACT_NAME);
    expect(contractMetaData.creator).toEqual(web3.eth.accounts[1]);
    expect(contractMetaData.expirationTimeStamp).toEqual(await deployMarketContract.EXPIRATION);
    expect(contractMetaData.oracleDataSource).toEqual(
      await deployMarketContract.ORACLE_DATA_SOURCE
    );
    expect(contractMetaData.oracleQuery).toEqual(await deployMarketContract.ORACLE_QUERY);
  });

  it('Returns contract creation logs', async () => {
    const events = await market.getContractCreatedEventsAsync('0x0', 'latest');
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.args.contractAddress === deployedAddress));
  });
});
