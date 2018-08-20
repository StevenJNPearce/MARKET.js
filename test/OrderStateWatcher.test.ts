import BigNumber from 'bignumber.js';
import { join } from 'path';
import DoneCallback = jest.DoneCallback;

import {
  BlockParamLiteral,
  MarketError,
  OrderState,
  OrderStateInvalid,
  OrderStateValid,
  OrderStateWatcherConfig
} from '../src/types';
import { createEVMSnapshot, reportNodeCallbackErrors, restoreEVMSnapshot } from './utils';

import { OrderStateWatcher } from '../src/order_watcher/OrderStateWatcher';
import { Helper } from './helper';
import { Utils } from '../src';
import { AbiDecoder } from '../src/lib/AbiDecoder';
import { Artifact, SignedOrder } from '@marketprotocol/types';

describe('OrderStateWatcher', () => {
  let helper: Helper;
  let orderStateWatcher: OrderStateWatcher;
  let abiDecoder: AbiDecoder;
  let watcherConfig: OrderStateWatcherConfig;
  let snapshotId: string;
  let MarketContractArtifact: Artifact;
  let MarketTokenArtifact: Artifact;
  let signedOrder: SignedOrder;

  beforeAll(async () => {
    helper = await Helper.init();
    const contractPath = './build/contracts/';
    MarketContractArtifact = Utils.loadArtifact(join(contractPath, 'MarketContractOraclize.json'));
    MarketTokenArtifact = Utils.loadArtifact(join(contractPath, 'MarketToken.json'));

    jest.setTimeout(20000);
  });

  beforeEach(async () => {
    snapshotId = await createEVMSnapshot(helper.web3);
    abiDecoder = new AbiDecoder([MarketContractArtifact, MarketTokenArtifact]);
    orderStateWatcher = new OrderStateWatcher(
      helper.web3,
      abiDecoder,
      helper.market,
      watcherConfig
    );
  });

  afterEach(async () => {
    await restoreEVMSnapshot(helper.web3, snapshotId);
  });

  describe('subscribe', () => {
    it('should not throw if callback is a function', () => {
      expect(() => {
        orderStateWatcher.subscribe(() => ({}));
      }).not.toThrow();
    });

    it('should throw error if callback is null', () => {
      expect(() => {
        orderStateWatcher.subscribe(null);
      }).toThrow();
    });

    it('should throw error if callback is already set', () => {
      orderStateWatcher.subscribe(() => ({}));

      expect(() => {
        orderStateWatcher.subscribe(() => ({}));
      }).toThrow();
    });
  });

  describe('unsubscribe', () => {
    it('should throw error if callback is not set', () => {
      expect(() => orderStateWatcher.unsubscribe()).toThrow();
    });
  });

  describe('addOrder', () => {
    it('should throw if order is not signed by maker', async () => {
      signedOrder = await helper.createOrderAsync();
      signedOrder.maker = helper.ethAccounts[4]; // change maker
      await expect(orderStateWatcher.addOrder(signedOrder)).rejects.toThrow();
    });
  });

  describe('removeOrder', () => {
    it('should remove existing order without throwing error', async () => {
      signedOrder = await helper.createOrderAsync();
      const orderHash = Utils.getOrderHash(signedOrder);

      await orderStateWatcher.addOrder(signedOrder);

      await expect(orderStateWatcher.removeOrder(orderHash)).resolves;
    });

    it('should remove non-existing order without throwing error', async () => {
      await expect(orderStateWatcher.removeOrder('0x000')).resolves;
    });
  });

  describe('subscription behaviour', async () => {
    afterEach(() => {
      orderStateWatcher.unsubscribe();
      const orderHash = Utils.getOrderHash(signedOrder);
      orderStateWatcher.removeOrder(orderHash);
    });

    it('should emit OrderStateInvalid when maker has insufficient collateral', (done: DoneCallback) => {
      (async () => {
        await helper.fundCollateral({ address: helper.maker, deposit: true });

        signedOrder = await helper.createOrderAsync();
        await orderStateWatcher.addOrder(signedOrder);
        const callback = reportNodeCallbackErrors(done)((orderState: OrderState) => {
          expect(orderState.isValid).toEqual(false);

          const invalidOrderState = orderState as OrderStateInvalid;
          expect(invalidOrderState.error).toEqual(MarketError.InsufficientCollateralBalance);
        });
        orderStateWatcher.subscribe(callback);

        // withdraw collateral
        const initialBalance = await helper.market.getUserUnallocatedCollateralBalanceAsync(
          signedOrder.contractAddress,
          signedOrder.maker
        );
        await helper.market.withdrawCollateralAsync(signedOrder.contractAddress, initialBalance, {
          from: helper.maker
        });
      })().catch(done);
    });

    it('should emit OrderStateInvalid when order is fully filled', (done: DoneCallback) => {
      (async () => {
        await helper.fundCollateral({ address: helper.maker, deposit: true });
        await helper.fundCollateral({ address: helper.taker, deposit: true });

        const orderQty = 5;
        signedOrder = await helper.createOrderAsync({ orderQty });
        await orderStateWatcher.addOrder(signedOrder);
        const callback = reportNodeCallbackErrors(done)((orderState: OrderState) => {
          expect(orderState.isValid).toBeFalsy();
          const invalidOrderState = orderState as OrderStateInvalid;
          expect(invalidOrderState.error).toEqual(MarketError.OrderDead);
        });
        orderStateWatcher.subscribe(callback);

        // trade full quantity
        const fillableQty = new BigNumber(orderQty);
        await helper.market.tradeOrderAsync(signedOrder, fillableQty, {
          from: helper.taker,
          gas: 400000
        });
      })().catch(done);
    });

    it('should emit OrderStateInvalid when order is fully cancelled', (done: DoneCallback) => {
      (async () => {
        await helper.fundCollateral({ address: helper.maker, deposit: true });

        const orderQty = 5;
        signedOrder = await helper.createOrderAsync({ orderQty });
        await orderStateWatcher.addOrder(signedOrder);
        const callback = reportNodeCallbackErrors(done)((orderState: OrderState) => {
          expect(orderState.isValid).toBeFalsy();
          const invalidOrderState = orderState as OrderStateInvalid;
          expect(invalidOrderState.error).toEqual(MarketError.OrderDead);
        });
        orderStateWatcher.subscribe(callback);

        // cancel full quantity
        const cancellableQty = new BigNumber(orderQty);
        await helper.market.cancelOrderAsync(signedOrder, cancellableQty, {
          from: helper.maker,
          gas: 400000
        });
      })().catch(done);
    });

    it('should emit OrderStateValid when order is partially filled', (done: DoneCallback) => {
      (async () => {
        await helper.fundCollateral({ address: helper.maker, deposit: true });
        await helper.fundCollateral({ address: helper.taker, deposit: true });

        const orderQty = 10;
        const fillQty = 2;
        signedOrder = await helper.createOrderAsync();
        const orderHash = Utils.getOrderHash(signedOrder);
        await orderStateWatcher.addOrder(signedOrder);
        const callback = reportNodeCallbackErrors(done)((orderState: OrderState) => {
          expect(orderState.isValid).toBeTruthy();
          const validOrderState = orderState as OrderStateValid;
          expect(validOrderState.orderHash).toEqual(orderHash);
          expect(validOrderState.orderRelevantState.remainingFillableQty).toEqual(
            new BigNumber(orderQty - fillQty)
          );
        });
        orderStateWatcher.subscribe(callback);

        // partially fill order
        await helper.market.tradeOrderAsync(signedOrder, new BigNumber(fillQty), {
          from: helper.taker,
          gas: 400000
        });
      })().catch(done);
    });

    it('should not emit an orderState event for irrelevant transfers', (done: DoneCallback) => {
      (async () => {
        await helper.fundCollateral({ address: helper.maker, deposit: true });
        await helper.fundCollateral({ address: helper.taker, deposit: true });

        signedOrder = await helper.createOrderAsync();
        await orderStateWatcher.addOrder(signedOrder);
        const callback = reportNodeCallbackErrors(done)((orderState: OrderState) => {
          throw new Error('OrderState callback for irrelevant transfer');
        });
        orderStateWatcher.subscribe(callback);

        // transfer marketToken
        const transferAmount = new BigNumber(2);
        await helper.marketToken.transferTx(helper.maker, transferAmount).send({
          from: helper.ethAccounts[0]
        });
        setTimeout(() => {
          done();
        }, 10000);
      })().catch(done);
    });

    it('should emit OrderStateInvalid if maker removes locked MKT tokens', (done: DoneCallback) => {
      (async () => {
        const feeRecipient = helper.ethAccounts[5];
        const fees = 6;
        await helper.fundCollateral({ address: helper.maker, deposit: true });
        await helper.fundCollateral({ address: helper.taker, deposit: true });
        await helper.fundMKT({
          address: helper.maker,
          credit: new BigNumber(fees),
          approvalAddress: feeRecipient
        });
        await helper.fundMKT({ address: helper.taker, approvalAddress: feeRecipient });

        signedOrder = await helper.createOrderAsync({ fees, feeRecipient });
        const orderHash = Utils.getOrderHash(signedOrder);
        await orderStateWatcher.addOrder(signedOrder);

        const callback = reportNodeCallbackErrors(done)((orderState: OrderState) => {
          expect(orderState.isValid).toBeFalsy();
          const validOrderState = orderState as OrderStateInvalid;
          expect(validOrderState.orderHash).toEqual(orderHash);
          expect(validOrderState.error).toEqual(MarketError.InsufficientBalanceForTransfer);
        });
        orderStateWatcher.subscribe(callback);

        // transfer fees away
        const randomRecipient = helper.ethAccounts[4];
        await helper.marketToken.transferTx(randomRecipient, fees).send({ from: helper.maker });
      })().catch(done);
    });

    it('should emit OrderStateInvalid when order expires', (done: DoneCallback) => {
      (async () => {
        await helper.fundCollateral({ address: helper.maker, deposit: true });
        await helper.fundCollateral({ address: helper.taker, deposit: true });

        const expirationTimeStamp = Math.floor(Date.now() / 1000) + 5; // expires 5 seconds from now
        signedOrder = await helper.createOrderAsync({ expirationTimeStamp });
        const orderHash = Utils.getOrderHash(signedOrder);
        await orderStateWatcher.addOrder(signedOrder);

        const callback = reportNodeCallbackErrors(done)((orderState: OrderState) => {
          expect(orderState.isValid).toBeFalsy();
          const validOrderState = orderState as OrderStateInvalid;
          expect(validOrderState.orderHash).toEqual(orderHash);
          expect(validOrderState.error).toEqual(MarketError.OrderExpired);
        });
        orderStateWatcher.subscribe(callback);

        setTimeout(() => {
          done(new Error('OrderStateInvalid not thrown for expired order'));
        }, 10000);
      })().catch(done);
    });
  });
});
