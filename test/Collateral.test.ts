import { BigNumber } from 'bignumber.js';
import Web3 from 'web3';
// Types
import {
  ERC20,
  MarketCollateralPool,
  MarketContract,
  MathLib,
  SignedOrder
} from '@marketprotocol/types';

import { Market, Utils } from '../src';
import { constants } from '../src/constants';

import { MarketError, MARKETProtocolConfig } from '../src/types';
import { createEVMSnapshot, restoreEVMSnapshot } from './utils';

/**
 * Collateral
 */
describe('Collateral', () => {
  const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:9545'));
  let maker: string;
  let taker: string;
  let deploymentAddress: string;
  let contractAddresses: string[];
  let marketContractAddress: string;
  let deployedMarketContract: MarketContract;
  let collateralPoolAddress: string;
  let collateralTokenAddress: string;
  let market: Market;

  // additions
  let snapshotId: string;

  beforeAll(async () => {
    maker = deploymentAddress = web3.eth.accounts[0];
    const config: MARKETProtocolConfig = {
      networkId: constants.NETWORK_ID_TRUFFLE
    };
    market = new Market(web3.currentProvider, config);
    contractAddresses = await market.marketContractRegistry.getAddressWhiteList;
    marketContractAddress = contractAddresses[0];
    deployedMarketContract = await MarketContract.createAndValidate(web3, marketContractAddress);
    collateralPoolAddress = await deployedMarketContract.MARKET_COLLATERAL_POOL_ADDRESS;
    collateralTokenAddress = await deployedMarketContract.COLLATERAL_TOKEN_ADDRESS;

    const tokenBalance: BigNumber = await market.marketContractWrapper.getBalanceAsync(
      collateralTokenAddress,
      maker
    );

    await market.marketContractWrapper.setAllowanceAsync(
      collateralTokenAddress,
      collateralPoolAddress,
      tokenBalance,
      { from: maker }
    );
  });

  it('depositCollateralAsync should fail for deposits above approved amount', async () => {
    const approvedAmount: BigNumber = await market.marketContractWrapper.getAllowanceAsync(
      collateralTokenAddress,
      maker,
      collateralPoolAddress
    );
    const depositAmount = approvedAmount.plus(10); // aboue approved amount

    const oldBalance: BigNumber = await market.marketContractWrapper.getBalanceAsync(
      collateralTokenAddress,
      collateralPoolAddress
    );

    await expect(
      market.depositCollateralAsync(marketContractAddress, depositAmount, {
        from: maker
      })
    ).rejects.toThrow();

    const newBalance: BigNumber = await market.marketContractWrapper.getBalanceAsync(
      collateralTokenAddress,
      collateralPoolAddress
    );

    expect(newBalance).toEqual(oldBalance);
  });

  it('Balance after depositCollateralAsync call is correct', async () => {
    const depositAmount: BigNumber = new BigNumber(10);
    const oldBalance: BigNumber = await market.marketContractWrapper.getBalanceAsync(
      collateralTokenAddress,
      collateralPoolAddress
    );

    await market.depositCollateralAsync(marketContractAddress, depositAmount, { from: maker });

    const newBalance: BigNumber = await market.marketContractWrapper.getBalanceAsync(
      collateralTokenAddress,
      collateralPoolAddress
    );

    expect(newBalance.minus(oldBalance)).toEqual(depositAmount);
  });

  it('getUserUnallocatedCollateralBalanceAsync returns correct user balance', async () => {
    const oldUserBalance: BigNumber = await market.getUserUnallocatedCollateralBalanceAsync(
      marketContractAddress,
      maker
    );

    const depositAmount: BigNumber = new BigNumber(100);
    await market.depositCollateralAsync(marketContractAddress, depositAmount, { from: maker });
    const newUserBalance: BigNumber = await market.getUserUnallocatedCollateralBalanceAsync(
      marketContractAddress,
      maker
    );
    expect(newUserBalance.minus(oldUserBalance)).toEqual(depositAmount);
  });

  it('withdrawCollateralAsync should withdraw correct amount', async () => {
    const withdrawAmount: BigNumber = new BigNumber(10);
    const depositAmount: BigNumber = new BigNumber(100);
    await market.depositCollateralAsync(marketContractAddress, depositAmount, { from: maker });

    const oldBalance: BigNumber = await market.marketContractWrapper.getBalanceAsync(
      collateralTokenAddress,
      maker
    );

    await market.withdrawCollateralAsync(marketContractAddress, withdrawAmount, {
      from: maker
    });
    const newBalance: BigNumber = await market.marketContractWrapper.getBalanceAsync(
      collateralTokenAddress,
      maker
    );

    expect(oldBalance.plus(withdrawAmount)).toEqual(newBalance);
  });

  it('Settle and Close should fail', async () => {
    try {
      await market.settleAndCloseAsync(marketContractAddress, { from: maker });
    } catch (e) {
      expect(e.toString()).toMatch('revert');
    }
  });

  it('Calculates needed collateral correctly', async () => {
    expect(market.config.mathLibAddress).toBeDefined();
    if (!market.config.mathLibAddress) {
      return new Error('Expected mathLibAddress to be defined!');
    }
    const mathLib: MathLib = await MathLib.createAndValidate(web3, market.config.mathLibAddress);

    // in these tests we can compare the calculated amounts in MARKET.js with the calculated
    // amounts from the MathLib solidity contract.

    let longQtyToExecute = new BigNumber(5);
    let shortQtyToExecute = new BigNumber(-5);
    let priceToExecute = (await deployedMarketContract.PRICE_FLOOR).plus(5000);

    let longCalculatedCollateral = await market.calculateNeededCollateralAsync(
      marketContractAddress,
      longQtyToExecute,
      priceToExecute
    );

    let solidityLongCalculatedCollateral = await mathLib.calculateNeededCollateral(
      await deployedMarketContract.PRICE_FLOOR,
      await deployedMarketContract.PRICE_CAP,
      await deployedMarketContract.QTY_MULTIPLIER,
      longQtyToExecute,
      priceToExecute
    );

    expect(longCalculatedCollateral).toEqual(solidityLongCalculatedCollateral);

    let shortCalculatedCollateral = await market.calculateNeededCollateralAsync(
      marketContractAddress,
      shortQtyToExecute,
      priceToExecute
    );

    let solidityShortCalculatedCollateral = await mathLib.calculateNeededCollateral(
      await deployedMarketContract.PRICE_FLOOR,
      await deployedMarketContract.PRICE_CAP,
      await deployedMarketContract.QTY_MULTIPLIER,
      shortQtyToExecute,
      priceToExecute
    );

    expect(shortCalculatedCollateral).toEqual(solidityShortCalculatedCollateral);
  });

  it('Ensure user is enabled for contract', async () => {
    // Not currently possible until there's a lock required for trading.
    // Todo: add user (which by default won't have any market tokens locked)
    // and attempt to deposit collateral.
  });

  it('Ensure caller has sufficient ERC20 token balance to deposit', async () => {
    // Create mock account (which by default won't have any balance),
    // then attempt to make a deposit which should throw InsufficientBalanceForTransfer.
    const mockAccountAddress: string = web3.personal.newAccount('mockAccount');
    const depositAmount: BigNumber = new BigNumber(100);
    expect(
      market.depositCollateralAsync(marketContractAddress, depositAmount, {
        from: mockAccountAddress
      })
    ).rejects.toThrow(new Error(MarketError.InsufficientBalanceForTransfer));
  });

  it('Ensure caller has approved deposit for sufficient amount', async () => {
    // Use user account (which by default won't have any balance or allowance),
    // send the user a balance but don't approve the transaction,
    // then try to make a deposit which should throw InsufficientAllowanceForTransfer.

    const user = web3.eth.accounts[1];
    const collateralToken: ERC20 = await ERC20.createAndValidate(web3, collateralTokenAddress);
    const initialCredit: BigNumber = new BigNumber(1e23);

    await collateralToken.transferTx(user, initialCredit).send({ from: deploymentAddress });

    expect(
      market.depositCollateralAsync(marketContractAddress, initialCredit, {
        from: user
      })
    ).rejects.toThrow(new Error(MarketError.InsufficientAllowanceForTransfer));
  });

  it('Ensure user has sufficient balance in the pool to withdraw', async () => {
    // Create mock account (which by default won't have any balance),
    // then attempt to make a withdraw which should throw InsufficientBalanceForTransfer.
    const mockAccountAddress: string = web3.personal.newAccount('mockAccount');
    const withdrawAmount: BigNumber = new BigNumber(100);
    expect(
      market.withdrawCollateralAsync(marketContractAddress, withdrawAmount, {
        from: mockAccountAddress
      })
    ).rejects.toThrow(new Error(MarketError.InsufficientBalanceForTransfer));
  });

  describe('getCollateralEventsAsync', () => {
    const depositAmount: BigNumber = new BigNumber(100);

    beforeAll(async () => {
      snapshotId = await createEVMSnapshot(web3);
      await market.depositCollateralAsync(marketContractAddress, depositAmount, { from: maker });
    });

    afterAll(async () => {
      await restoreEVMSnapshot(web3, snapshotId);
    });

    it('returns the deposit', async () => {
      const events = await market.getCollateralEventsAsync(marketContractAddress);
      const includes: boolean = events.some(
        (e): boolean => {
          if (
            depositAmount.isEqualTo(e.amount) &&
            e.to === collateralPoolAddress &&
            e.type === 'deposit' &&
            e.from === maker
          ) {
            return true;
          }
          return false;
        }
      );
      expect(includes).toBe(true);
    });

    it('does not returns the deposit if not in the given block range', async () => {
      const events = await market.getCollateralEventsAsync(marketContractAddress, 0, 1);
      const includes: boolean = events.some(
        (e): boolean => {
          if (
            depositAmount.isEqualTo(e.amount) &&
            e.to === collateralPoolAddress &&
            e.type === 'deposit' &&
            e.from === maker
          ) {
            return true;
          }
          return false;
        }
      );
      expect(includes).toBe(false);
    });

    it('returns the deposit matching userAddress', async () => {
      const events = await market.getCollateralEventsAsync(
        marketContractAddress,
        0,
        'latest',
        maker
      );
      const includes: boolean = events.some(
        (e): boolean => {
          if (
            depositAmount.isEqualTo(e.amount) &&
            e.to === collateralPoolAddress &&
            e.type === 'deposit' &&
            e.from === maker
          ) {
            return true;
          }
          return false;
        }
      );
      expect(includes).toBe(true);
    });

    it('does not returns the deposit if it does not match userAddress', async () => {
      const events = await market.getCollateralEventsAsync(
        marketContractAddress,
        0,
        'latest',
        '0x0'
      );

      const includes: boolean = events.some(
        (e): boolean => {
          return (
            depositAmount.isEqualTo(e.amount) &&
            e.to === collateralPoolAddress &&
            e.type === 'deposit' &&
            e.from === maker
          );
        }
      );

      expect(includes).toBe(false);
    });

    it('returns a withdrawal', async () => {
      await market.withdrawCollateralAsync(marketContractAddress, depositAmount, {
        from: maker
      });
      const events = await market.getCollateralEventsAsync(marketContractAddress);
      const includes: boolean = events.some(
        (e): boolean => {
          return (
            depositAmount.isEqualTo(e.amount) &&
            e.to === maker &&
            e.type === 'withdrawal' &&
            e.from === collateralPoolAddress
          );
        }
      );
      expect(includes).toBe(true);
    });
  });

  describe('Positions', () => {
    beforeAll(async () => {
      jest.setTimeout(30000);
    });

    beforeEach(async () => {
      snapshotId = await createEVMSnapshot(web3);
    });

    afterEach(async () => {
      await restoreEVMSnapshot(web3, snapshotId);
    });

    it('Ensure initial positions count equals zero', async () => {
      const userPositionCount: BigNumber = await market.getPositionCountAsync(
        marketContractAddress,
        maker
      );
      expect(userPositionCount).toEqual(new BigNumber(0));
    });

    it('Ensure user\'s initial Net Position equals zero', async () => {
      const userNetPosition: BigNumber = await market.getUserNetPositionAsync(
        marketContractAddress,
        maker
      );
      expect(userNetPosition.toNumber()).toEqual(0);
    });

    it('getUserPositionAsync should fail if no positions exist for the user', async () => {
      try {
        await market.getUserPositionAsync(marketContractAddress, maker, 1);
      } catch (e) {
        expect(e.toString()).toMatch(MarketError.UserHasNoAssociatedPositions);
      }
    });

    it('getUserPositionsAsync should fails if no positions exist for the user', async () => {
      try {
        await market.getUserPositionsAsync(marketContractAddress, maker, false, false);
      } catch (e) {
        expect(e.toString()).toMatch(MarketError.UserHasNoAssociatedPositions);
      }
    });

    it('Ensure getUserPositionAsync and getPositionCountAsync return correct values', async () => {
      // create a position
      deploymentAddress = web3.eth.accounts[0];
      maker = web3.eth.accounts[1];
      taker = web3.eth.accounts[2];

      const expirationTimestamp = new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60);
      const collateralToken: ERC20 = await ERC20.createAndValidate(web3, collateralTokenAddress);
      const initialCredit: BigNumber = new BigNumber(1e23);

      await collateralToken.transferTx(maker, initialCredit).send({ from: deploymentAddress });
      await collateralToken.transferTx(taker, initialCredit).send({ from: deploymentAddress });

      const collateralPool = await MarketCollateralPool.createAndValidate(
        web3,
        collateralPoolAddress
      );
      expect(await collateralPool.linkedAddress).toBe(deployedMarketContract.address);

      await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: maker });
      await collateralToken.approveTx(collateralPoolAddress, initialCredit).send({ from: taker });

      await market.depositCollateralAsync(marketContractAddress, initialCredit, { from: maker });
      await market.depositCollateralAsync(marketContractAddress, initialCredit, { from: taker });

      const fees: BigNumber = new BigNumber(0);
      const orderQty: BigNumber = new BigNumber(100);
      const price: BigNumber = new BigNumber(100000);

      const signedOrder: SignedOrder = await market.createSignedOrderAsync(
        marketContractAddress,
        expirationTimestamp,
        constants.NULL_ADDRESS,
        maker,
        fees,
        constants.NULL_ADDRESS,
        fees,
        orderQty,
        price,
        Utils.generatePseudoRandomSalt(),
        false
      );

      const orderHash = await market.createOrderHashAsync(signedOrder);
      expect(await market.isValidSignatureAsync(signedOrder, orderHash)).toBe(true);

      const orderTxInfo = await market.tradeOrderAsync(signedOrder, new BigNumber(2), {
        from: taker,
        gas: 400000
      });

      expect(await orderTxInfo.filledQtyAsync).toEqual(new BigNumber(2));

      const userPositionCount: BigNumber = await market.getPositionCountAsync(
        marketContractAddress,
        maker
      );
      expect(userPositionCount.toNumber()).toEqual(1);

      const userPosition: BigNumber[] = await market.getUserPositionAsync(
        marketContractAddress,
        maker,
        userPositionCount.toNumber() - 1
      );
      expect(userPosition).toEqual([new BigNumber(100000), new BigNumber(2)]);
    });

    it('getUserPositionsAsync should return correct values', async () => {
      // creating multiple positions
      deploymentAddress = web3.eth.accounts[0];
      maker = web3.eth.accounts[1];
      taker = web3.eth.accounts[2];
      const expirationTimestamp = new BigNumber(Math.floor(Date.now() / 1000) + 60 * 60);
      let collateralNeeded: BigNumber;
      let i: number;
      const expectedPositions = [
        [100000, 5],
        [100005, 8],
        [100000, 2],
        [1000000, 8],
        [100005, 2],
        [110000, 8],
        [110000, 9]
      ];
      const consolidatedExpectedPositions = [[100000, 7], [100005, 10], [110000, 17], [1000000, 8]];
      const sortedExpectedPositions = [
        [100000, 5],
        [100000, 2],
        [100005, 8],
        [100005, 2],
        [110000, 8],
        [110000, 9],
        [1000000, 8]
      ];
      let signedOrder: SignedOrder;
      let orderHash;

      const collateralToken: ERC20 = await ERC20.createAndValidate(web3, collateralTokenAddress);
      const collateralPool = await MarketCollateralPool.createAndValidate(
        web3,
        collateralPoolAddress
      );

      for (i = 0; i < expectedPositions.length; i++) {
        collateralNeeded = await market.calculateNeededCollateralAsync(
          marketContractAddress,
          new BigNumber(expectedPositions[i][1]),
          new BigNumber(expectedPositions[i][0])
        );

        await collateralToken.transferTx(maker, collateralNeeded).send({ from: deploymentAddress });
        await collateralToken.transferTx(taker, collateralNeeded).send({ from: deploymentAddress });
        await collateralToken
          .approveTx(collateralPoolAddress, collateralNeeded)
          .send({ from: maker });
        await collateralToken
          .approveTx(collateralPoolAddress, collateralNeeded)
          .send({ from: taker });
        await market.depositCollateralAsync(marketContractAddress, collateralNeeded, {
          from: maker
        });
        await market.depositCollateralAsync(marketContractAddress, collateralNeeded, {
          from: taker
        });

        const fees: BigNumber = new BigNumber(0);
        const orderQty: BigNumber = new BigNumber(100);

        signedOrder = await market.createSignedOrderAsync(
          marketContractAddress,
          expirationTimestamp,
          constants.NULL_ADDRESS,
          maker,
          fees,
          constants.NULL_ADDRESS,
          fees,
          orderQty,
          new BigNumber(expectedPositions[i][0]),
          Utils.generatePseudoRandomSalt(),
          false
        );

        orderHash = await market.createOrderHashAsync(signedOrder);
        expect(await market.isValidSignatureAsync(signedOrder, orderHash.toString())).toBe(true);

        const orderTxInfo = await market.tradeOrderAsync(
          signedOrder,
          new BigNumber(expectedPositions[i][1]),
          {
            from: taker,
            gas: 400000
          }
        );

        expect(await orderTxInfo.filledQtyAsync).toEqual(new BigNumber(expectedPositions[i][1]));
      }

      const userPositionCount: BigNumber = await market.getPositionCountAsync(
        marketContractAddress,
        maker
      );
      expect(userPositionCount).toEqual(new BigNumber(expectedPositions.length));

      const userPositions = await market.getUserPositionsAsync(
        marketContractAddress,
        maker,
        false,
        false
      );
      expect(userPositions.length).toEqual(expectedPositions.length);

      const sortedPositions = await market.getUserPositionsAsync(
        marketContractAddress,
        maker,
        true,
        false
      );
      expect(sortedPositions.length).toEqual(expectedPositions.length);

      for (i = 0; i < userPositions.length; i++) {
        expect(userPositions[i]).toEqual([
          new BigNumber(expectedPositions[i][0]),
          new BigNumber(expectedPositions[i][1])
        ]);
        expect(sortedPositions[i]).toEqual([
          new BigNumber(sortedExpectedPositions[i][0]),
          new BigNumber(sortedExpectedPositions[i][1])
        ]);
      }

      const consolidatedPositions = await market.getUserPositionsAsync(
        marketContractAddress,
        maker,
        false,
        true
      );
      expect(consolidatedPositions.length).toEqual(consolidatedExpectedPositions.length);

      const sortedConsolidatedUserPositions = await market.getUserPositionsAsync(
        marketContractAddress,
        maker,
        true,
        true
      );
      expect(sortedConsolidatedUserPositions.length).toEqual(consolidatedExpectedPositions.length);

      for (i = 0; i < sortedConsolidatedUserPositions.length; i++) {
        expect(consolidatedPositions[i]).toEqual([
          new BigNumber(consolidatedExpectedPositions[i][0]),
          new BigNumber(consolidatedExpectedPositions[i][1])
        ]);
        expect(sortedConsolidatedUserPositions[i]).toEqual([
          new BigNumber(consolidatedExpectedPositions[i][0]),
          new BigNumber(consolidatedExpectedPositions[i][1])
        ]);
      }
    });
  });
});
