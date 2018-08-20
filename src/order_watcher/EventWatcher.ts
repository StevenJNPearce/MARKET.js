import Web3 from 'web3';
import * as _ from 'lodash';

import { IWatchFilter, LogEntry, promisify } from '@marketprotocol/types';
import { BlockParamLiteral, EventWatcherCallback, MarketError } from '../types';
import { assert } from '../assert';
import { IntervalUtils } from '../lib/Utils';

// required because of string response
export interface RawLogEntry {
  logIndex: string | null;
  transactionIndex: string | null;
  transactionHash: string;
  blockHash: string | null;
  blockNumber: string | null;
  address: string;
  data: string;
  topics: string[];
}

enum LogEventState {
  Removed,
  Added
}

/**
 * The EventWatcher watches for blockchain events
 */
export class EventWatcher {
  // region Members
  // *****************************************************************
  // ****                     Members                             ****
  // *****************************************************************
  static readonly DEFAULT_EVENT_POLLING_INTERVAL_MS = 200;

  private _web3: Web3;
  private _pollingIntervalMs: number;
  private _intervalIdIfExists?: NodeJS.Timer;
  private _lastEvents: LogEntry[] = [];
  private _stateLayer: BlockParamLiteral;
  private _jsonRpcRequestId: number;

  // endregion // members
  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************

  /**
   *
   * @param {Web3} web3
   * @param {undefined | number} pollingIntervalIfExistsMs Even pooling interval
   * @param {BlockParamLiteral} stateLayer Block to check
   */
  constructor(
    web3: Web3,
    pollingIntervalIfExistsMs?: undefined | number,
    stateLayer: BlockParamLiteral = BlockParamLiteral.Latest
  ) {
    this._web3 = web3;
    this._stateLayer = stateLayer;
    this._pollingIntervalMs = _.isUndefined(pollingIntervalIfExistsMs)
      ? EventWatcher.DEFAULT_EVENT_POLLING_INTERVAL_MS
      : pollingIntervalIfExistsMs;
    this._jsonRpcRequestId = 0;
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
   * Subscribes callback to receive updates of events emitted from the
   * block.
   *
   * @param {EventWatcherCallback} callback callback function for event changes
   */
  public subscribe(callback: EventWatcherCallback): void {
    assert.isFunction('callback', callback);
    if (!_.isUndefined(this._intervalIdIfExists)) {
      throw new Error(MarketError.SubscriptionAlreadyPresent);
    }
    this._intervalIdIfExists = IntervalUtils.setAsyncExcludingInterval(
      this._pollForBlockchainEventsAsync.bind(this, callback),
      this._pollingIntervalMs,
      (err: Error) => {
        this.unsubscribe();
        callback(err);
      }
    );
  }

  /**
   * Allows caller to stop receiving callbacks from a previous subscription.
   *
   */
  public unsubscribe(): void {
    this._lastEvents = [];
    if (!_.isUndefined(this._intervalIdIfExists)) {
      IntervalUtils.clearAsyncExcludingInterval(this._intervalIdIfExists);
      delete this._intervalIdIfExists;
    }
  }

  // endregion //Public Methods
  // region Private Methods
  // *****************************************************************
  // ****                     Private Methods                     ****
  // *****************************************************************

  private async _pollForBlockchainEventsAsync(callback: EventWatcherCallback): Promise<void> {
    const pendingEvents = await this._getEventsAsync();
    if (pendingEvents.length === 0) {
      // HACK: Sometimes when node rebuilds the pending block we get back the empty result.
      // We don't want to emit a lot of removal events and bring them back after a couple of miliseconds,
      // that's why we just ignore those cases.
      return;
    }
    const removedEvents = _.differenceBy(this._lastEvents, pendingEvents, JSON.stringify);
    const newEvents = _.differenceBy(pendingEvents, this._lastEvents, JSON.stringify);
    await this._emitDifferencesAsync(removedEvents, LogEventState.Removed, callback);
    await this._emitDifferencesAsync(newEvents, LogEventState.Added, callback);
    this._lastEvents = pendingEvents;
  }

  private async _getEventsAsync(): Promise<LogEntry[]> {
    const eventFilter = {
      fromBlock: this._stateLayer,
      toBlock: this._stateLayer
    };
    return this._getLogsAsync(eventFilter);
  }

  private async _emitDifferencesAsync(
    logs: LogEntry[],
    logEventState: LogEventState,
    callback: EventWatcherCallback
  ): Promise<void> {
    for (const log of logs) {
      const logEvent = {
        removed: logEventState === LogEventState.Removed,
        ...log
      };
      if (!_.isUndefined(this._intervalIdIfExists)) {
        callback(null, logEvent);
      }
    }
  }

  private async _getLogsAsync(filter: IWatchFilter): Promise<LogEntry[]> {
    let fromBlock = filter.fromBlock;
    let toBlock = filter.toBlock;
    const serializedFilter = {
      ...filter,
      fromBlock,
      toBlock
    };
    const payload = {
      jsonrpc: '2.0',
      id: this._jsonRpcRequestId++,
      method: 'eth_getLogs',
      params: [serializedFilter]
    };

    const rawLogs = await this._sendRawPayloadAsync<RawLogEntry[]>(payload);
    const formattedLogs = _.map(rawLogs, this._formatLog.bind(this));

    return formattedLogs;
  }

  private async _sendRawPayloadAsync<A>(payload: {}): Promise<A> {
    const sendAsync = this._web3.currentProvider.sendAsync.bind(this._web3.currentProvider);
    const response = await promisify(sendAsync, [payload]);
    const result = response.result;
    return result;
  }

  private _formatLog(rawLog: RawLogEntry): LogEntry {
    const formattedLog = {
      ...rawLog,
      logIndex: this._hexToDecimal(rawLog.logIndex),
      blockNumber: this._hexToDecimal(rawLog.blockNumber),
      transactionIndex: this._hexToDecimal(rawLog.transactionIndex)
    };
    return formattedLog;
  }

  private _hexToDecimal(hex: string | null): number | null {
    if (_.isNull(hex)) {
      return null;
    }
    const decimal = this._web3.toDecimal(hex);
    return decimal;
  }

  // endregion //Private Methods
}
