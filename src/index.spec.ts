import 'mocha';

import * as chai from 'chai';
import * as path from 'path';
import {RlpEncode, RlpList} from 'rlp-stream';

import {MerklePatriciaTree} from './index';


// Needed for should.not.be.undefined.
/* tslint:disable:no-unused-expression */

chai.should();
const should = chai.should();

describe('Try original simple-save-retrieve', async () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  const one = Buffer.from('one');
  const two = Buffer.from('two');

  it('should save a value', async () => {
    await tree.put(Buffer.from('test'), one);
  });

  it('should get a value', async () => {
    const val = await tree.get(Buffer.from('test'));
    should.exist(val.value);
    val.value!.should.deep.equal(one);
  });

  it('should update a value', async () => {
    await tree.put(Buffer.from('test'), two);
    const val = await tree.get(Buffer.from('test'));
    should.exist(val.value);
    val.value!.should.deep.equal(two);
  });

  it('should delete value', async () => {
    await tree.del(Buffer.from('test'));
    should.not.exist((await tree.get(Buffer.from('test'))).value);
  });

  it('should recreate value', async () => {
    await tree.put(Buffer.from('test'), one);
  });

  it('should get updated value', async () => {
    const val = await tree.get(Buffer.from('test'));
    should.exist(val.value);
    val.value!.should.deep.equal(one);
  });

  it('should create a branch', async () => {
    await tree.put(Buffer.from('doge'), Buffer.from('coin'));
    tree.root.toString('hex').should.equal(
        'de8a34a8c1d558682eae1528b47523a483dd8685d6db14b291451a66066bf0fc');
  });

  it('should get a value in a branch', async () => {
    const val = await tree.get(Buffer.from('doge'));
    should.exist(val.value);
    val.value!.should.deep.equal(Buffer.from('coin'));
  });

  it('should delete from a branch', async () => {
    await tree.del(Buffer.from('doge'));
    should.not.exist((await tree.get(Buffer.from('doge'))).value);
  });
});


describe('Try original storing larger values', async () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  const longString = 'this will be a really really really long value';
  const longStringRoot =
      'b173e2db29e79c78963cff5196f8a983fbe0171388972106b114ef7f5c24dfa3';

  it('should store a larger string', async () => {
    await tree.put(Buffer.from('done'), Buffer.from(longString));
    await tree.put(Buffer.from('doge'), Buffer.from('coin'));
    tree.root.toString('hex').should.equal(longStringRoot);
  });

  it('should retrieve longer values', async () => {
    const val = await tree.get(Buffer.from('done'));
    should.exist(val.value);
    val.value!.should.deep.equal(Buffer.from(longString));
  });

  it('should be able to update older values', async () => {
    await tree.put(Buffer.from('done'), Buffer.from('test'));
    const val = await tree.get(Buffer.from('done'));
    should.exist(val.value);
    val.value!.should.deep.equal(Buffer.from('test'));
  });
});


describe('Try original extensions and branches', async () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  it('should store a value', async () => {
    await tree.put(Buffer.from('doge'), Buffer.from('coin'));
  });

  it('should create an extension', async () => {
    await tree.put(Buffer.from('do'), Buffer.from('verb'));
    tree.root.toString('hex').should.equal(
        'f803dfcb7e8f1afd45e88eedb4699a7138d6c07b71243d9ae9bff720c99925f9');
  });

  it('should store a new value in the extension', async () => {
    await tree.put(Buffer.from('done'), Buffer.from('finished'));
    tree.root.toString('hex').should.equal(
        '409cff4d820b394ed3fb1cd4497bdd19ffa68d30ae34157337a7043c94a3e8cb');
  });
});

describe('Try original extensions and branches - reverse', async () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  it('should create an extension', async () => {
    await tree.put(Buffer.from('do'), Buffer.from('verb'));
  });

  it('should store another value', async () => {
    await tree.put(Buffer.from('doge'), Buffer.from('coin'));
    tree.root.toString('hex').should.equal(
        'f803dfcb7e8f1afd45e88eedb4699a7138d6c07b71243d9ae9bff720c99925f9');
  });

  it('should store another value in the extension', async () => {
    await tree.put(Buffer.from('done'), Buffer.from('finished'));
    tree.root.toString('hex').should.equal(
        '409cff4d820b394ed3fb1cd4497bdd19ffa68d30ae34157337a7043c94a3e8cb');
  });
});

describe('Try original deletions tests', async () => {
  let tree: MerklePatriciaTree;

  before(async () => {
    tree = new MerklePatriciaTree();
  });

  it('should delete from a branch->branch-branch', async () => {
    const a1 = tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    const a2 = tree.put(
        Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    const a3 = tree.put(
        Buffer.from([12, 33, 44]), Buffer.from('create the last branch'));
    await Promise.all([a1, a2, a3]);
    await tree.del(Buffer.from([12, 22, 22]));
    const val = await tree.get(Buffer.from([12, 22, 22]));
    should.not.exist(val.value);
  });

  it('should delete from a branch->branch-extension', async () => {
    const a1 = tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    const a2 = tree.put(
        Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    const a3 = tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    const a4 = tree.put(
        Buffer.from([12, 33, 44]), Buffer.from('create the last branch'));

    await Promise.all([a1, a2, a3, a4]);
    await tree.del(Buffer.from([12, 22, 22]));
    const val = await tree.get(Buffer.from([12, 22, 22]));
    should.not.exist(val.value);
  });

  it('should delete from a extension->branch-extension', async () => {
    await tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    await tree.put(
        Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    await tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    await tree.put(
        Buffer.from([12, 33, 44]), Buffer.from('create the last branch'));
    await tree.del(Buffer.from([11, 11, 11]));
    const val = await tree.get(Buffer.from([11, 11, 11]));
    should.not.exist(val.value);
  });

  it('should delete from a extension->branch-branch', async () => {
    await tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    await tree.put(
        Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    await tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    await tree.put(
        Buffer.from([12, 34, 44]), Buffer.from('create the last branch'));
    await tree.del(Buffer.from([11, 11, 11]));
    const val = await tree.get(Buffer.from([11, 11, 11]));
    should.not.exist(val.value);
  });
});


describe('Creating the ethereum genesis block', async () => {
  const g = Buffer.from('8a40bfaa73256b60764c1bf40675a99083efb075', 'hex');
  const j = Buffer.from('e6716f9544a56c530d868e4bfbacb172315bdead', 'hex');
  const v = Buffer.from('1e12515ce3e0f817a4ddef9ca55788a1d66bd2df', 'hex');
  const a = Buffer.from('1a26338f0d905e295fccb71fa9ea849ffa12aaf4', 'hex');

  const stateRoot = Buffer.alloc(32, 0);
  const startAmount = Buffer.alloc(26, 0);
  startAmount[0] = 1;

  const account = [
    startAmount, 0, stateRoot,
    Buffer.from(
        'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
        'hex')
  ];
  const rlpAccount = RlpEncode(account as RlpList);
  const genesisStateRoot =
      '2f4399b08efe68945c1cf90ffe85bbe3ce978959da753f9e649f034015b8817d';

  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  it('should match the original genesis root', async () => {
    await tree.put(g, rlpAccount);
    await tree.put(j, rlpAccount);
    await tree.put(v, rlpAccount);
    await tree.put(a, rlpAccount);
    tree.root.toString('hex').should.equal(genesisStateRoot);
  });
});