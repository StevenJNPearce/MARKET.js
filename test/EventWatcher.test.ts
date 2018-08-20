import * as sinon from 'sinon';
import * as _ from 'lodash';
import FakeProvider from 'web3-fake-provider';
import Web3 from 'web3';
import DoneCallback = jest.DoneCallback;

import { LogEntry } from '@marketprotocol/types';

import { reportNodeCallbackErrors } from './utils';
import { EventWatcher } from '../src/order_watcher/EventWatcher';
import { LogEntryEvent } from '../src/types';
import { DoneCallback } from '../node_modules/@0xproject/types';

describe('EventWatcher', () => {
  let web3: Web3;
  let mockProvider: FakeProvider;
  let eventWatcher: EventWatcher;
  const logA: LogEntry = {
    address: '0x71d271f8b14adef568f8f28f1587ce7271ac4ca5',
    blockHash: null,
    blockNumber: null,
    data: '',
    logIndex: null,
    topics: [],
    transactionHash: '0x004881d38cd4a8f72f1a0d68c8b9b8124504706041ff37019c1d1ed6bfda8e17',
    transactionIndex: 0
  };
  const logB: LogEntry = {
    address: '0x8d12a197cb00d4747a1fe03395095ce2a5cc6819',
    blockHash: null,
    blockNumber: null,
    data: '',
    logIndex: null,
    topics: ['0xf341246adaac6f497bc2a656f546ab9e182111d630394f0c57c710a59a2cb567'],
    transactionHash: '0x01ef3c048b18d9b09ea195b4ed94cf8dd5f3d857a1905ff886b152cfb1166f25',
    transactionIndex: 0
  };
  const logC: LogEntry = {
    address: '0x1d271f8b174adef58f1587ce68f8f27271ac4ca5',
    blockHash: null,
    blockNumber: null,
    data: '',
    logIndex: null,
    topics: ['0xf341246adaac6f497bc2a656f546ab9e182111d630394f0c57c710a59a2cb567'],
    transactionHash: '0x01ef3c048b18d9b09ea195b4ed94cf8dd5f3d857a1905ff886b152cfb1166f25',
    transactionIndex: 0
  };

  beforeEach(async () => {
    mockProvider = new FakeProvider();
    web3 = new Web3(mockProvider);
    const pollingIntervalMs = 10;
    eventWatcher = new EventWatcher(web3, pollingIntervalMs);
  });

  describe('subscribe', () => {
    it('should not throw if callback is a function', () => {
      expect(() => {
        eventWatcher.subscribe(() => ({}));
      }).not.toThrow();
    });

    it('should throw error if callback is null', () => {
      expect(() => {
        eventWatcher.subscribe(null);
      }).toThrow();
    });

    it('should throw error if callback is already set', () => {
      eventWatcher.subscribe(() => ({}));

      expect(() => {
        eventWatcher.subscribe(() => ({}));
      }).toThrow();
    });
  });

  describe('unsubscribe', () => {
    it('should not throw error if callback is not set', () => {
      expect(() => eventWatcher.unsubscribe()).not.toThrow();
    });

    it('should not throw error if callback is already set', () => {
      eventWatcher.subscribe(() => ({}));
      expect(() => eventWatcher.unsubscribe()).not.toThrow();
    });
  });

  it('should trigger callback with removed events', (done: DoneCallback) => {
    const initialLogs: LogEntry[] = [logA, logB];
    const changedLogs: LogEntry[] = [logA, logC];
    const expectedLogEvents = [
      {
        removed: false,
        ...logA
      },
      {
        removed: false,
        ...logB
      },
      {
        removed: true,
        ...logB
      },
      {
        removed: false,
        ...logC
      }
    ];
    mockProvider.injectResult(initialLogs);
    mockProvider.injectResult(changedLogs);
    const callback = reportNodeCallbackErrors(done, false)((event: LogEntryEvent) => {
      const expectedLogEvent = expectedLogEvents.shift();
      expect(event).toEqual(expectedLogEvent);
      if (_.isEmpty(expectedLogEvents)) {
        done();
      }
    });

    eventWatcher.subscribe(callback);
  });
});
