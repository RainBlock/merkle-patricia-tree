import 'mocha';

import * as chai from 'chai';
import {RlpEncode, RlpList} from 'rlp-stream';

const ethUtil = require('ethereumjs-util');

import {MerklePatriciaTree} from './index';

// Needed for should.not.be.undefined.
/* tslint:disable:no-unused-expression */
const should = chai.should();


interface GethStateDumpAccount {
  balance: string;
  nonce: number;
  root: string;
  codeHash: string;
  code: string;
  storage: {[key: string]: string};
}
interface GethStateDump {
  root: string;
  accounts: {[id: string]: GethStateDumpAccount};
}

const genesisJson = require('../test/genesis.json') as GethStateDump;

type BigInt = number;
declare const BigInt: typeof Number;

function ethereumAccountToRlp(account: GethStateDumpAccount): Buffer {
  let hexBalance = BigInt(`${account.balance}`).toString(16);
  if (hexBalance === '0') {
    hexBalance = '';
  } else if (hexBalance.length % 2 === 1) {
    hexBalance = `0${hexBalance}`;
  }

  return RlpEncode([
    account.nonce, Buffer.from(hexBalance, 'hex'),
    Buffer.from(
        '56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
        'hex'),
    Buffer.from(
        'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
        'hex')
  ] as RlpList);
}

describe('Generate the full genesis tree from a state dump', () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  it('should insert all values', async () => {
    const i = 0;
    for (const [id, account] of Object.entries(genesisJson.accounts)) {
      const hash = ethUtil.sha3(Buffer.from(id, 'hex'));
      tree.put(hash, ethereumAccountToRlp(account));
    }
  });

  it('should contain cf67b71c90b0d523dd5004cf206f325748da347685071b34812e21801f5270c4',
     async () => {
       const witness = tree.get(Buffer.from(
           'cf67b71c90b0d523dd5004cf206f325748da347685071b34812e21801f5270c4',
           'hex'));
       witness.value!.should.deep.equal(Buffer.from(
           'f84d80890ad78ebc5ac6200000a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a0c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
           'hex'));
     });

  it('should contain all values', async () => {
    for (const [id, account] of Object.entries(genesisJson.accounts)) {
      const hash = ethUtil.sha3(Buffer.from(id, 'hex'));
      const witness = tree.get(hash);
      should.exist(witness.value);
      witness.value!.should.deep.equal(ethereumAccountToRlp(account));
    }
  });

  it('should have correct state root', async () => {
    tree.root.toString('hex').should.equal(
        'd7f8974fb5ac78d9ac099b9ad5018bedc2ce0a72dad1827a1709da30580f0544');
  });
});
