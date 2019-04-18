import {hashAsBuffer, HashType} from 'bigint-hash';
import * as fs from 'fs';
import {RlpEncode, RlpList} from 'rlp-stream/build/src/rlp-stream';

import {MerklePatriciaTree} from './index';

export interface GethStateDumpAccount {
  balance: string;
  nonce: number;
  root: string;
  codeHash: string;
  code: string;
  storage: {[key: string]: string};
}

export interface GethStateDump {
  root: string;
  accounts: {[id: string]: GethStateDumpAccount};
}

export const gethAccountToRlp = (account: GethStateDumpAccount) => {
  let hexBalance = BigInt(`${account.balance}`).toString(16);
  if (hexBalance === '0') {
    hexBalance = '';
  } else if (hexBalance.length % 2 === 1) {
    hexBalance = `0${hexBalance}`;
  }

  return RlpEncode([
    account.nonce, Buffer.from(hexBalance, 'hex'),
    Buffer.from(account.root, 'hex'), Buffer.from(account.codeHash, 'hex')
  ] as RlpList);
};

const newAccount: GethStateDumpAccount = {
  balance: '100000',
  nonce: 0,
  codeHash: 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
  storage: {},
  code: '',
  root: '56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'
};

export const getKeyPairs = (rounds: number) => {
  const rlpAccount = gethAccountToRlp(newAccount);
  let seed = Buffer.alloc(32, 0 + Math.floor(Math.random() * (9)));
  const batchOps = [];
  for (let i = 1; i <= rounds; i++) {
    seed = hashAsBuffer(HashType.KECCAK256, seed);
    batchOps.push({
      key: seed,
      val: rlpAccount,
    });
  }
  return batchOps;
};

export const generateGethDump =
    (filename: string, numberOfAccounts: number) => {
      const keyPairs = getKeyPairs(numberOfAccounts);
      const tree = new MerklePatriciaTree();
      const root = tree.batch(keyPairs);
      const accounts: {[id: string]: GethStateDumpAccount} = {};
      for (const ops of keyPairs) {
        accounts[ops.key.toString('hex')] = newAccount;
      }
      const gethDump: GethStateDump = {root: root.toString('hex'), accounts};
      fs.writeFile(filename, JSON.stringify(gethDump, null, 2), (err) => {
        if (err) {
          console.log('Couldn\'t generate the stateDump due to ', err);
          return;
        }
        console.log('Done generating state');
      });
    };

if (process.argv.length !== 4) {
  console.log(
      'USAGE: node -r ts-node/register stateDumpGenerator.ts filename numberOfAccounts');
  process.exit(-1);
}
generateGethDump(process.argv[2], Number(process.argv[3]));