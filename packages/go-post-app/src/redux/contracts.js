// @flow

import { createActions, handleActions } from 'redux-actions';
import Web3 from 'web3';

import { getMainContract } from 'go-post-api';

import { initMiniwallet } from './miniwallet';
import { initProfile } from '../app/profile/profile';
import getNetwork from './getNetwork';

export const errorType = {
  NETWORK: 'network',
  NO_METAMASK: 'no_metamask',
  METAMASK_LOCKED: 'metamask_locked',
  DISCONNECTED: 'disconnected'
};

const defaultState = {
  isConnected: false,
  errorType: null,
  error: null,
  web3: null,
  web3Direct: null,
  networkId: null,
  account: null,
  contracts: {
    main: null,
  },
  lastBlockTime: new Date(),
};

const { connected, web3Error, setMainContract, setLastBlockTime } = createActions({
  CONNECTED: (web3, networkId, account) => ({ web3, networkId, account }),
  WEB3_ERROR: (errorType, error) => ({ errorType, error }),
  SET_MAIN_CONTRACT: (contract) => ({ contract }),
  SET_LAST_BLOCK_TIME: (lastBlockTime) => ({ lastBlockTime }),
}, { prefix: 'app/contracts' });

const web3 = new Web3();
const web3Direct = new Web3(); // Not through MetaMask

export const initContracts = () => async dispatch => {
  try {
    let networkId = null;

    if (typeof window.web3 !== 'undefined') { // MetaMask
      web3.setProvider(window.web3.currentProvider);
      networkId = await web3.eth.net.getId();
    } else {
      if (process.env.NODE_ENV === 'development') {
        // In development, fall back to ganache-cli.
        web3.setProvider('ws://localhost:8545');
        networkId = await web3.eth.net.getId();
      } else {
        // No MetaMask, not developing.
        dispatch(web3Error(errorType.NO_METAMASK, new Error('No MetaMask')));
        return;
      }
    }

    if (!networkId) {
      dispatch(web3Error(errorType.NETWORK, new Error('Could not connect to web3 provider.')));
      return;
    }

    let network = networkId > 10000000 ? getNetwork('local') : getNetwork(networkId);

    if (!network) {
      dispatch(web3Error(errorType.NETWORK, new Error('web3 error')));
      return;
    }

    console.log('network', network);

    web3Direct.setProvider(network.url);

    const [account] = await web3.eth.getAccounts();

    let interval = null;
    interval = setInterval(async () => {
      try {
        const accounts = await web3.eth.getAccounts();
        if (accounts[0] !== account) {
          window.location.reload();
          return;
        }

        const id = await web3.eth.net.getId();
        if (id !== networkId) {
          window.location.reload();
        }
      } catch (e) {
        console.error('Error checking for account changes', e);
        clearInterval(interval);
        dispatch(web3Error(errorType.DISCONNECTED, e));
      }
    }, 1000);

    if (!account) {
      dispatch(web3Error(errorType.METAMASK_LOCKED, new Error('MetaMask locked')));
      return;
    }

    let lastBlockNum = 0;
    setInterval(() => {
      web3Direct.eth.getBlockNumber((e, res) => {
        if (e) {
          console.error('getBlockNumber error', e);
          dispatch(web3Error(errorType.DISCONNECTED, e));
        }

        if (lastBlockNum < res) {
          lastBlockNum = res;
          console.log('new block', res);
          dispatch(setLastBlockTime(new Date()));
        }
      });
    }, 1000);

    try {
      dispatch(setMainContract(await getMainContract(web3, networkId)));
    } catch (e) {
      console.error('Error getting contract. Are contracts deployed to this network?');
      throw e;
    }

    dispatch(connected(web3, networkId, account));
    await dispatch(initMiniwallet());
    await dispatch(initProfile());
  } catch (e) {
    console.error('contracts init error', e);
    dispatch(web3Error(errorType.NETWORK, e));
  }
}

const reducer = handleActions(
  {
    [connected]: (state, { payload: { web3, networkId, account } }) => ({
      ...state,
      isConnected: true,
      web3,
      networkId,
      account
    }),
    [web3Error]: (state, { payload: { errorType, error  } }) => ({
      ...defaultState,
      errorType,
      error
    }),
    [setMainContract]: (state, { payload: { contract } }) => ({
      ...state,
      contracts: {
        ...state.contracts,
        main: contract
      }
    }),
    [setLastBlockTime]: (state, { payload: { lastBlockTime } }) => ({
      ...state,
      lastBlockTime
    }),
  },
  defaultState
);

export default reducer;
