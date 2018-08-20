import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import * as _ from 'lodash';

const ethABI = require('ethereumjs-abi');
const ethUtil = require('ethereumjs-util');
const BN = require('bn.js');

// Types
import { Artifact, ECSignature, Order, SignedOrder } from '@marketprotocol/types';

import { constants } from '../constants';
const fs = require('fs');
import { ParsedContractName, SolidityTypes } from '../types';

export const Utils = {
  /**
   * Signs a message.
   *
   * @param web3
   * @param address
   * @param message
   * @return {[*,*,*]}
   */
  signMessage(web3: Web3, address: string, message: string): Promise<ECSignature> {
    return new Promise<ECSignature>((resolve, reject) => {
      web3.eth.sign(address, message, (err, signature) => {
        // Log errors, if any
        // TODO: Handle error
        if (err) {
          console.error(err);
        }

        const r = signature.slice(0, 66);
        const s = `0x${signature.slice(66, 130)}`;
        let v = web3.toDecimal(`0x${signature.slice(130, 132)}`);

        if (v !== 27 && v !== 28) {
          v += 27;
        }

        resolve({ v, r, s });
      });
    });
  },

  /**
   * Unix timestamp in seconds since epoch
   * @return {BigNumber}
   */
  getCurrentUnixTimestampSec(): BigNumber {
    return new BigNumber(Date.now() / 1000);
  },

  /**
   * Unix timestamp in MS since epoch
   * @return {BigNumber}
   */
  getCurrentUnixTimestampMs(): BigNumber {
    return new BigNumber(Date.now());
  },

  /**
   * Generates a pseudo-random 256-bit salt.
   * The salt can be included in an  order, ensuring that the order generates a unique orderHash
   * and will not collide with other outstanding orders that are identical in all other parameters.
   * @return {BigNumber} A pseudo-random 256-bit number that can be used as a salt.
   */
  generatePseudoRandomSalt(): BigNumber {
    // BigNumber.random returns a pseudo-random number between 0 & 1 with a passed in number of decimal places.
    // Source: https://mikemcl.github.io/bignumber.js/#random
    const randomNumber = BigNumber.random(constants.MAX_DIGITS_IN_UNSIGNED_256_INT);
    const factor = new BigNumber(10).pow(constants.MAX_DIGITS_IN_UNSIGNED_256_INT - 1);
    return randomNumber.times(factor).integerValue();
  },

  /**
   * Calculates the required collateral amount in base units of a token.  This amount represents
   * a trader's maximum loss and therefore the amount of collateral that becomes locked into
   * the smart contracts upon execution of a trade.
   * @param {BigNumber} priceFloor      PRICE_FLOOR for the given MarketContract
   * @param {BigNumber} priceCap        PRICE_CAP for the given MarketContract
   * @param {BigNumber} qtyMultiplier   QTY_MULTIPLIER for the given MarketContract
   * @param {BigNumber} qty             desired qty to trade (+ for buy / - for sell)
   * @param {BigNumber} price           execution price
   * @return {Promise<BigNumber>}       amount of needed collateral to become locked.
   */
  calculateNeededCollateral(
    priceFloor: BigNumber,
    priceCap: BigNumber,
    qtyMultiplier: BigNumber,
    qty: BigNumber,
    price: BigNumber
  ): BigNumber {
    let maxLoss: BigNumber;
    if (qty.isPositive()) {
      // this qty is long, calculate max loss from entry price to floor
      if (price.lte(priceFloor)) {
        maxLoss = new BigNumber(0);
      } else {
        maxLoss = price.minus(priceFloor);
      }
    } else {
      // this qty is short, calculate max loss from entry price to ceiling;
      if (price.gte(priceCap)) {
        maxLoss = new BigNumber(0);
      } else {
        maxLoss = priceCap.minus(price);
      }
    }
    return maxLoss.times(qty.absoluteValue()).times(qtyMultiplier);
  },

  /**
   * reads .json truffle artifacts into our Artifact objects.
   * @param {string} filePath path to file
   * @return {Artifact}
   */
  loadArtifact(filePath: string): Artifact {
    return JSON.parse(fs.readFileSync(filePath, `utf-8`));
  },

  /**
   * Creates a standardized contract name in the format of
   * REFERENCEASSET_COLLATERALSYMBOL_DATAPROVIDER_EXPIRATION_USERTEXT
   * @param referenceAssetName
   * @param collateralTokenSymbol
   * @param dataProvider
   * @param expiration
   * @param userText
   */
  createStandardizedContractName(
    referenceAssetName: string,
    collateralTokenSymbol: string,
    dataProvider: string,
    expiration: BigNumber,
    userText: string
  ): string {
    return referenceAssetName
      .toUpperCase()
      .concat(
        '_',
        collateralTokenSymbol.toUpperCase(),
        '_',
        dataProvider.toUpperCase(),
        '_',
        expiration.toString(),
        '_',
        userText.toUpperCase()
      );
  },

  /**
   * Parses a standardized contract name into its components.
   * @param contractName
   */
  parseStandardizedContractName(contractName: string): ParsedContractName | null {
    let splitName: string[] = contractName.split('_');
    if (splitName.length < 4) {
      return null;
    }

    let expiration;
    try {
      expiration = new BigNumber(splitName[3]);
    } catch (err) {
      return null;
    }

    return {
      referenceAsset: splitName[0],
      collateralToken: splitName[1],
      dataProvider: splitName[2],
      expirationTimeStamp: expiration,
      userText: splitName.length > 4 ? splitName[4] : '' // user text could be optional
    };
  },

  /**
   * Generates the order hash for an order, synchronously.
   * @param {Order | SignedOrder} order
   * @return {string}
   */
  getOrderHash(order: Order | SignedOrder): string {
    const orderParts = [
      { value: order.contractAddress, type: SolidityTypes.Address },
      { value: order.maker, type: SolidityTypes.Address },
      { value: order.taker, type: SolidityTypes.Address },
      { value: order.feeRecipient, type: SolidityTypes.Address },
      { value: bigNumberToBN(order.makerFee), type: SolidityTypes.Uint },
      { value: bigNumberToBN(order.takerFee), type: SolidityTypes.Uint },
      { value: bigNumberToBN(order.price), type: SolidityTypes.Uint },
      { value: bigNumberToBN(order.expirationTimestamp), type: SolidityTypes.Uint },
      { value: bigNumberToBN(order.salt), type: SolidityTypes.Uint },
      { value: bigNumberToBN(order.orderQty), type: SolidityTypes.Int }
    ];

    const types = _.map(orderParts, o => o.type);
    const values = _.map(orderParts, o => o.value);
    const hashBuff = ethABI.soliditySHA3(types, values);
    const hashHex = ethUtil.bufferToHex(hashBuff);
    return hashHex;
  }
};

export const IntervalUtils = {
  setAsyncExcludingInterval(
    fn: () => Promise<void>,
    intervalMs: number,
    onError: (err: Error) => void
  ) {
    let locked = false;
    const intervalId = setInterval(async () => {
      if (locked) {
        return;
      } else {
        locked = true;
        try {
          await fn();
        } catch (err) {
          onError(err);
        }
        locked = false;
      }
    }, intervalMs);
    return intervalId;
  },

  clearAsyncExcludingInterval(intervalId: NodeJS.Timer): void {
    clearInterval(intervalId);
  },

  setInterval(fn: () => void, intervalMs: number, onError: (err: Error) => void) {
    const intervalId = setInterval(() => {
      try {
        fn();
      } catch (err) {
        onError(err);
      }
    }, intervalMs);
    return intervalId;
  },

  clearInterval(intervalId: NodeJS.Timer): void {
    clearInterval(intervalId);
  }
};

/**
 * Converts BigNumber instance to BN
 * The only reason we convert to BN is to remain compatible with `ethABI. soliditySHA3` that
 * expects values of Solidity type `uint` to be passed as type `BN`.
 * We do not use BN anywhere else in the codebase.
 */
function bigNumberToBN(value: BigNumber) {
  return new BN(value.toString(10), 10);
}
