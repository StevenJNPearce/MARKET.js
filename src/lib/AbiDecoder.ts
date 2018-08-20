import { BigNumber } from 'bignumber.js';
import * as _ from 'lodash';
import * as abiDecoder from 'abi-decoder';

import { Artifact, DecodedLogEntry, LogEntry } from '@marketprotocol/types';

import { ContractAbi } from '../types';

import {} from './Utils';

/**
 * Represents Event Arguments gotten from the abi-decoder emails
 *
 */
interface AbiDecodedEventArgs {
  name: string;
  type: string;
  value: string;
}

/**
 * Decoder for Abi Data. This includes log entries.
 *
 */
export class AbiDecoder {
  // region Constructors
  // *****************************************************************
  // ****                     Constructors                        ****
  // *****************************************************************
  constructor(artifacts: Artifact[]) {
    _.forEach(artifacts, artifact => abiDecoder.addABI(artifact.abi));
  }
  // endregion//Constructors

  /**
   * Attempts to decode the topic and input args for the event.
   *
   * @param log Log Entry to decode
   */
  public decodeLogEntryEvent<ArgsType>(log: LogEntry): DecodedLogEntry<ArgsType> {
    let [decodedLog] = abiDecoder.decodeLogs([log]);

    return {
      ...log,
      event: decodedLog.name,
      args: this._formatAbiDecodeEvents<ArgsType>(decodedLog.events),
      address: decodedLog.address
    };
  }

  /**
   * Converts the array of event arguments into
   *
   * @param events
   */
  private _formatAbiDecodeEvents<ArgsType>(events: AbiDecodedEventArgs[]): ArgsType {
    return events.reduce((eventObj: {}, event: AbiDecodedEventArgs) => {
      return Object.assign(eventObj, {
        [event.name]: this._isNumberType(event.type) ? new BigNumber(event.value) : event.value
      });
    }, {}) as ArgsType;
  }

  private _isNumberType(type: string) {
    return ['uint256', 'uint8', 'int'].indexOf(type) !== -1;
  }
}
