import { join } from 'path';
import { readFileSync } from 'fs';
import * as _ from 'lodash';
import DoneCallback = jest.DoneCallback;

import Web3 from 'web3';
import { JSONRPCResponsePayload } from '@0xproject/types';

/**
 * Pulls a contract address fom a truffle artifact .json file.  Assumes these files
 * are located in MARKET.js/build/contracts.  Currently no error handling is present.
 * @param {string} contractName full class name of contract i.e MarketContractOraclize
 * @param {string | number} networkID Network id for desired address ('4447' for Truffle)
 * @returns {string} contract address hex
 */
export function getContractAddress(contractName: string, networkID: string | number): string {
  const filePath = join(__dirname, '../build/contracts/' + contractName + '.json');
  const abi = JSON.parse(readFileSync(filePath, `utf-8`));
  return abi.networks[networkID].address;
}

/**
 * Checks if the given string is a url.
 * https://stackoverflow.com/questions/8667070/javascript-regular-expression-to-validate-url
 *
 * @param {String} url  The given URL address.
 * @returns {Boolean}
 */
export function isUrl(url: string): boolean {
  // tslint:disable-next-line
  return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
    url
  );
}

/**
 * Creates an EVM Snapshot and returns a Promise that resolves to the id of the snapshot.
 *
 * @param {Web3} web3 Web3 object
 */
export async function createEVMSnapshot(web3: Web3): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    web3.currentProvider.sendAsync(
      {
        jsonrpc: '2.0',
        method: 'evm_snapshot',
        params: [],
        id: new Date().getTime()
      },
      (err: Error | null, response?: JSONRPCResponsePayload) => {
        if (err) {
          reject(err);
        }
        if (response) {
          resolve(response.result);
        }
      }
    );
  });
}

/**
 * Restores the EVM to the snapshot set in id
 *
 * @param {Web3} web3
 * @param {string} snapshotId
 */
export async function restoreEVMSnapshot(web3: Web3, snapshotId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    web3.currentProvider.sendAsync(
      {
        jsonrpc: '2.0',
        method: 'evm_revert',
        params: [snapshotId],
        id: new Date().getTime()
      },
      (err: Error | null, response?: JSONRPCResponsePayload) => {
        if (err) {
          reject(err);
        }
        if (response) {
          resolve();
        }
      }
    );
  });
}

/**
 * Callback wrapper to catch error in callback response.
 *
 * @param {DoneCallback} done
 * @param {bool} expectToBeCalledOnce flag if callback should be called once
 */
export const reportNodeCallbackErrors = (done: DoneCallback, expectToBeCalledOnce = true) => {
  return <T>(f?: (value: T) => void) => {
    const wrapped = (error: Error | null, value: T | undefined) => {
      if (!_.isNull(error)) {
        done(error);
      } else {
        if (_.isUndefined(f)) {
          done();
          return;
        }
        try {
          f(value as T);
          if (expectToBeCalledOnce) {
            done();
          }
        } catch (err) {
          done(err);
        }
      }
    };
    return wrapped;
  };
};

export const assertNodeCallbackError = (done: DoneCallback, errMsg: string) => {
  const wrapped = <T>(error: Error | null, value: T | undefined) => {
    if (_.isNull(error)) {
      done(new Error('Expected callback to receive an error'));
    } else {
      try {
        expect(error.message).to.be.equal(errMsg);
        done();
      } catch (err) {
        done(err);
      }
    }
  };
  return wrapped;
};
