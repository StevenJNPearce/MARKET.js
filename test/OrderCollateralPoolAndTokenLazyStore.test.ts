import { mock, SinonMock } from 'sinon';
import BigNumber from 'bignumber.js';

import { Market } from '../src';

import { OrderCollateralPoolAndTokenLazyStore } from '../src/stores';
import { ContractWrapper } from '../src/contract_wrappers/ContractWrapper';

describe('Order Collateral Pool And Token store', async () => {
  let contractWrapper: ContractWrapper;
  let mockContractWrapper: SinonMock;
  let store: OrderCollateralPoolAndTokenLazyStore;
  let contractAddress: string;

  beforeEach(() => {
    contractWrapper = new ContractWrapper({}, {} as Market);
    store = new OrderCollateralPoolAndTokenLazyStore(contractWrapper);
    mockContractWrapper = mock(contractWrapper);
    contractAddress = '0x000';
  });

  describe.each([
    [
      'getCollateralPoolAddressAsync',
      'getCollateralPoolContractAddressAsync',
      'deleteCollateralPoolAddress',
      '0x003',
      [contractAddress]
    ],
    [
      'getCollateralTokenAddressAsync',
      'getCollateralTokenAddressAsync',
      'deleteCollateralTokenAddress',
      '0x002',
      [contractAddress]
    ]
  ])('%s()', (getMethod, mockedContractMethod, deleteMethod, expectedValue, methodArgs) => {
    it('should fetch uncached value', async () => {
      mockContractWrapper
        .expects(mockedContractMethod)
        .once()
        .withArgs(...methodArgs)
        .resolves(expectedValue);

      const actualValue = await store[getMethod](...methodArgs);

      expect(actualValue).toEqual(expectedValue);

      mockContractWrapper.verify();
    });

    it('should not fetch cached value', async () => {
      mockContractWrapper
        .expects(mockedContractMethod)
        .once()
        .withArgs(...methodArgs)
        .resolves(expectedValue);

      await store[getMethod](...methodArgs);
      const actualValue = await store[getMethod](...methodArgs);

      expect(actualValue).toEqual(expectedValue);

      mockContractWrapper.verify();
    });

    it(`should purge cache when ${deleteMethod} is called`, async () => {
      mockContractWrapper
        .expects(mockedContractMethod)
        .twice()
        .withArgs(...methodArgs)
        .resolves(expectedValue);

      await store[getMethod](...methodArgs);
      store[deleteMethod](...methodArgs);
      const actualValue = await store[getMethod](...methodArgs);

      expect(actualValue).toEqual(expectedValue);

      mockContractWrapper.verify();
    });

    it('should purge cache when deleteAll is called', async () => {
      mockContractWrapper
        .expects(mockedContractMethod)
        .twice()
        .withArgs(...methodArgs)
        .resolves(expectedValue);

      await store[getMethod](...methodArgs);
      store.deleteAll();
      const actualValue = await store[getMethod](...methodArgs);

      expect(actualValue).toEqual(expectedValue);

      mockContractWrapper.verify();
    });
  });
});
