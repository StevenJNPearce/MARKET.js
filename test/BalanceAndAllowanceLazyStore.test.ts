import { mock, SinonMock } from 'sinon';
import BigNumber from 'bignumber.js';

import { Market, Utils } from '../src';

import { BalanceAndAllowanceLazyStore } from '../src/stores';
import { ContractWrapper } from '../src/contract_wrappers/ContractWrapper';

describe('Token Balance and Allowance store', async () => {
  let contractWrapper: ContractWrapper;
  let mockContractWrapper: SinonMock;
  let store: BalanceAndAllowanceLazyStore;
  let token: string;
  let user: string;
  let spender: string;

  beforeEach(() => {
    contractWrapper = new ContractWrapper({}, {} as Market);
    store = new BalanceAndAllowanceLazyStore(contractWrapper);
    mockContractWrapper = mock(contractWrapper);
    token = '0x000';
    user = '0x001';
    spender = '0x002';
  });

  describe.each([
    ['getBalanceAsync', 'getBalanceAsync', 'deleteBalance', new BigNumber(5), [token, user]],
    [
      'getAllowanceAsync',
      'getAllowanceAsync',
      'deleteAllowance',
      new BigNumber(5),
      [token, user, spender]
    ],
    [
      'getCollateralBalanceAsync',
      'getUserUnallocatedCollateralBalanceAsync',
      'deleteCollateralBalance',
      new BigNumber(5),
      [token, user]
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
