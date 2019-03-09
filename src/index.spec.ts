import 'mocha';

import * as chai from 'chai';
import * as path from 'path';
import {RlpEncode, RlpList} from 'rlp-stream';

import {MerklePatriciaTree, verifyWitness} from './index';
const utils = require('ethereumjs-util');


// Needed for should.not.be.undefined.
/* tslint:disable:no-unused-expression */

chai.should();
const should = chai.should();

describe('Try original simple-save-retrieve', () => {
  const tree: MerklePatriciaTree<string, string> =
      new MerklePatriciaTree<string, string>({
        keyConverter: (k) => Buffer.from(k),
        valueConverter: (v) => Buffer.from(v),
        putCanDelete: false
      });

  it('should save a value', async () => {
    tree.put('test', 'one');
  });

  it('should get a value', async () => {
    const val = tree.get('test');
    should.exist(val.value);
    val.value!.should.equal('one');
  });

  it('should batch get a value', async () => {
    const val1 = tree.batchGet(['test']);
    const val = tree.get('test');
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });

  it('should update a value', async () => {
    tree.put('test', 'two');
    const val = tree.get('test');
    should.exist(val.value);
    val.value!.should.equal('two');
  });

  it('should batch get an updated value', async () => {
    const val1 = tree.batchGet(['test']);
    const val = tree.get('test');
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });

  it('should delete value', async () => {
    tree.del('test');
    const witness = tree.rlpSerializeWitness(tree.get('test'));
    should.not.exist(witness.value);
    verifyWitness(tree.root, Buffer.from('test'), witness);
  });

  it('should recreate value', async () => {
    tree.put('test', 'one');
  });

  it('should get updated value', async () => {
    const val = tree.get('test');
    should.exist(val.value);
    val.value!.should.equal('one');
  });

  it('should batch get an updated value', async () => {
    const val1 = tree.batchGet(['test']);
    const val = tree.get('test');
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });

  it('should create a branch', async () => {
    tree.put('doge', 'coin');
    tree.root.toString('hex').should.equal(
        'de8a34a8c1d558682eae1528b47523a483dd8685d6db14b291451a66066bf0fc');
  });

  it('should get a value in a branch', async () => {
    const val = tree.get('doge');
    should.exist(val.value);
    val.value!.should.equal('coin');
  });

  it('should batch get value from branch', async () => {
    const val1 = tree.batchGet(['doge']);
    const val = tree.get('doge');
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });

  it('should delete from a branch', async () => {
    tree.del('doge');
    const witnessNE = tree.rlpSerializeWitness(tree.get('doge'));
    should.not.exist((tree.get('doge')).value);
    verifyWitness(tree.root, Buffer.from('doge'), witnessNE);
  });
});


describe('Try original storing larger values', () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  const longString = 'this will be a really really really long value';
  const longStringRoot =
      'b173e2db29e79c78963cff5196f8a983fbe0171388972106b114ef7f5c24dfa3';

  it('should store a larger string', async () => {
    tree.put(Buffer.from('done'), Buffer.from(longString));
    tree.put(Buffer.from('doge'), Buffer.from('coin'));
    tree.root.toString('hex').should.equal(longStringRoot);
  });

  it('should retrieve longer values', async () => {
    const val = tree.get(Buffer.from('done'));
    should.exist(val.value);
    val.value!.should.deep.equal(Buffer.from(longString));
  });

  it('should batch get longer values', async () => {
    const val1 = tree.batchGet([Buffer.from('done')]);
    const val = tree.get(Buffer.from('done'));
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });

  it('should be able to update older values', async () => {
    tree.put(Buffer.from('done'), Buffer.from('test'));
    const val = tree.get(Buffer.from('done'));
    should.exist(val.value);
    val.value!.should.deep.equal(Buffer.from('test'));
  });

  it('should batch get updated older values', async () => {
    const val1 = tree.batchGet([Buffer.from('done')]);
    const val = tree.get(Buffer.from('done'));
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });
});

describe('Try simple 3 node test', () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  it('should work in forward mode', async () => {
    tree.put(Buffer.from('12345'), Buffer.from('1'));
    tree.put(Buffer.from('123456'), Buffer.from('2'));
    tree.put(Buffer.from('1234'), Buffer.from('3'));

    const w1 = tree.get(Buffer.from('12345'));
    const w2 = tree.get(Buffer.from('123456'));
    const w3 = tree.get(Buffer.from('1234'));

    verifyWitness(
        tree.root, Buffer.from('12345'), tree.rlpSerializeWitness(w1));
    verifyWitness(
        tree.root, Buffer.from('123456'), tree.rlpSerializeWitness(w2));
    verifyWitness(tree.root, Buffer.from('1234'), tree.rlpSerializeWitness(w3));
  });

  it('Should verify batch get in forward mode', async () => {
    const w = tree.batchGet(
        [Buffer.from('12345'), Buffer.from('123456'), Buffer.from('1234')]);
    verifyWitness(
        tree.root, Buffer.from('12345'), tree.rlpSerializeWitness(w[0]));
    verifyWitness(
        tree.root, Buffer.from('123456'), tree.rlpSerializeWitness(w[1]));
    verifyWitness(
        tree.root, Buffer.from('1234'), tree.rlpSerializeWitness(w[2]));
  });

  it('should work out of order', async () => {
    tree.put(Buffer.from('12345'), Buffer.from('1'));
    tree.put(Buffer.from('1234'), Buffer.from('3'));
    tree.put(Buffer.from('123456'), Buffer.from('2'));

    const w1 = tree.get(Buffer.from('12345'));
    const w2 = tree.get(Buffer.from('123456'));
    const w3 = tree.get(Buffer.from('1234'));

    verifyWitness(
        tree.root, Buffer.from('12345'), tree.rlpSerializeWitness(w1));
    verifyWitness(
        tree.root, Buffer.from('123456'), tree.rlpSerializeWitness(w2));
    verifyWitness(tree.root, Buffer.from('1234'), tree.rlpSerializeWitness(w3));
  });

  it('Should verify batch get out of order', async () => {
    const w = tree.batchGet(
        [Buffer.from('12345'), Buffer.from('123456'), Buffer.from('1234')]);
    verifyWitness(
        tree.root, Buffer.from('12345'), tree.rlpSerializeWitness(w[0]));
    verifyWitness(
        tree.root, Buffer.from('123456'), tree.rlpSerializeWitness(w[1]));
    verifyWitness(
        tree.root, Buffer.from('1234'), tree.rlpSerializeWitness(w[2]));
  });
});

describe('Try original extensions and branches', () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  it('should store a value', async () => {
    tree.put(Buffer.from('doge'), Buffer.from('coin'));
  });

  it('should create an extension', async () => {
    tree.put(Buffer.from('do'), Buffer.from('verb'));
    tree.root.toString('hex').should.equal(
        'f803dfcb7e8f1afd45e88eedb4699a7138d6c07b71243d9ae9bff720c99925f9');
  });

  it('should store a new value in the extension', async () => {
    tree.put(Buffer.from('done'), Buffer.from('finished'));
    tree.root.toString('hex').should.equal(
        '409cff4d820b394ed3fb1cd4497bdd19ffa68d30ae34157337a7043c94a3e8cb');
  });
});

describe('Try original extensions and branches - reverse', () => {
  const tree: MerklePatriciaTree = new MerklePatriciaTree();

  it('should create an extension', async () => {
    tree.put(Buffer.from('do'), Buffer.from('verb'));
  });

  it('should store another value', async () => {
    tree.put(Buffer.from('doge'), Buffer.from('coin'));
    tree.root.toString('hex').should.equal(
        'f803dfcb7e8f1afd45e88eedb4699a7138d6c07b71243d9ae9bff720c99925f9');
  });

  it('should store another value in the extension', async () => {
    tree.put(Buffer.from('done'), Buffer.from('finished'));
    tree.root.toString('hex').should.equal(
        '409cff4d820b394ed3fb1cd4497bdd19ffa68d30ae34157337a7043c94a3e8cb');
  });
});

describe('Try original deletions tests', () => {
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
    tree.del(Buffer.from([12, 22, 22]));
    const val = tree.rlpSerializeWitness(tree.get(Buffer.from([12, 22, 22])));
    should.not.exist(val.value);
    verifyWitness(tree.root, Buffer.from([12, 22, 22]), val);
  });

  it('should delete from a branch->branch-extension', async () => {
    const a1 = tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    const a2 = tree.put(
        Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    const a3 = tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    const a4 = tree.put(
        Buffer.from([12, 33, 44]), Buffer.from('create the last branch'));

    tree.del(Buffer.from([12, 22, 22]));
    const val = tree.rlpSerializeWitness(tree.get(Buffer.from([12, 22, 22])));
    should.not.exist(val.value);
    verifyWitness(tree.root, Buffer.from([12, 22, 22]), val);
  });

  it('should delete from a extension->branch-extension', async () => {
    tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    tree.put(Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    tree.put(Buffer.from([12, 33, 44]), Buffer.from('create the last branch'));
    tree.del(Buffer.from([11, 11, 11]));
    const val = tree.rlpSerializeWitness(tree.get(Buffer.from([11, 11, 11])));
    should.not.exist(val.value);
    verifyWitness(tree.root, Buffer.from([11, 11, 11]), val);
  });

  it('should delete from a extension->branch-branch', async () => {
    tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    tree.put(Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    tree.put(Buffer.from([12, 34, 44]), Buffer.from('create the last branch'));
    tree.del(Buffer.from([11, 11, 11]));
    const val = tree.rlpSerializeWitness(tree.get(Buffer.from([11, 11, 11])));
    should.not.exist(val.value);
    verifyWitness(tree.root, Buffer.from([11, 11, 11]), val);
  });
});


describe('Creating the ethereum genesis block', () => {
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
    tree.put(g, rlpAccount);
    tree.put(j, rlpAccount);
    tree.put(v, rlpAccount);
    tree.put(a, rlpAccount);
    tree.root.toString('hex').should.equal(genesisStateRoot);
  });

  const treeBatch: MerklePatriciaTree = new MerklePatriciaTree();

  it('should match the original genesis root in batch mode', async () => {
    const root = treeBatch.batch([
      {key: g, val: rlpAccount},
      {key: j, val: rlpAccount},
      {key: v, val: rlpAccount},
      {key: a, val: rlpAccount},
    ]);
    root.toString('hex').should.equal(genesisStateRoot);
  });
});

describe('Try batch operations', () => {
  it('put a simple batch', async () => {
    const tree = new MerklePatriciaTree();
    const root = tree.batch([
      {key: Buffer.from('a'), val: Buffer.from('a')},
      {key: Buffer.from('b'), val: Buffer.from('b')},
      {key: Buffer.from('c'), val: Buffer.from('c')}
    ]);

    const w1 = tree.get(Buffer.from('a'));
    const w2 = tree.get(Buffer.from('b'));
    const w3 = tree.get(Buffer.from('c'));

    verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w1));
    verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w2));
    verifyWitness(root, Buffer.from('c'), tree.rlpSerializeWitness(w3));
  });

  it('put simple batch verifying with batch get', async () => {
    const tree = new MerklePatriciaTree();
    const root = tree.batch([
      {key: Buffer.from('a'), val: Buffer.from('a')},
      {key: Buffer.from('b'), val: Buffer.from('b')},
      {key: Buffer.from('c'), val: Buffer.from('c')}
    ]);

    const w =
        tree.batchGet([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
    verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w[0]));
    verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w[1]));
    verifyWitness(root, Buffer.from('c'), tree.rlpSerializeWitness(w[2]));
  });

  it('put and del a simple batch', async () => {
    const tree = new MerklePatriciaTree();
    tree.put(Buffer.from('d'), Buffer.from('d'));

    const root = tree.batch(
        [
          {key: Buffer.from('a'), val: Buffer.from('a')},
          {key: Buffer.from('b'), val: Buffer.from('b')},
          {key: Buffer.from('c'), val: Buffer.from('c')}
        ],
        [Buffer.from('d')]);

    const w1 = tree.get(Buffer.from('a'));
    const w2 = tree.get(Buffer.from('b'));
    const w3 = tree.get(Buffer.from('c'));

    verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w1));
    verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w2));
    verifyWitness(root, Buffer.from('c'), tree.rlpSerializeWitness(w3));

    const w4 = tree.rlpSerializeWitness(tree.get(Buffer.from('d')));
    should.not.exist(w4.value);
    verifyWitness(root, Buffer.from('d'), w4);
  });

  it('put and del a simple batch verifying with batch get', async () => {
    const tree = new MerklePatriciaTree();
    tree.put(Buffer.from('d'), Buffer.from('d'));

    const root = tree.batch(
        [
          {key: Buffer.from('a'), val: Buffer.from('a')},
          {key: Buffer.from('b'), val: Buffer.from('b')},
          {key: Buffer.from('c'), val: Buffer.from('c')}
        ],
        [Buffer.from('d')]);

    const w =
        tree.batchGet([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
    verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w[0]));
    verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w[1]));
    verifyWitness(root, Buffer.from('c'), tree.rlpSerializeWitness(w[2]));
  });

  it('put and del a simple batch with overlap', async () => {
    const tree = new MerklePatriciaTree();
    const root = tree.batch(
        [
          {key: Buffer.from('a'), val: Buffer.from('a')},
          {key: Buffer.from('b'), val: Buffer.from('b')},
          {key: Buffer.from('c'), val: Buffer.from('c')}
        ],
        [Buffer.from('c')]);

    const w1 = tree.get(Buffer.from('a'));
    const w2 = tree.get(Buffer.from('b'));
    const w3 = tree.rlpSerializeWitness(tree.get(Buffer.from('c')));

    verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w1));
    verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w2));
    should.not.exist(w3.value);
    verifyWitness(root, Buffer.from('c'), w3);
  });

  it('put and del a simple batch with overlap, verifying with batch get',
     async () => {
       const tree = new MerklePatriciaTree();
       const root = tree.batch(
           [
             {key: Buffer.from('a'), val: Buffer.from('a')},
             {key: Buffer.from('b'), val: Buffer.from('b')},
             {key: Buffer.from('c'), val: Buffer.from('c')}
           ],
           [Buffer.from('c')]);

       const w = tree.batchGet([Buffer.from('a'), Buffer.from('b')]);
       verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w[0]));
       verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w[1]));
     });
});

describe('Try batchCOW operations', () => {
  it('put a simple batchCOW', async () => {
    const tree = new MerklePatriciaTree();
    const copyTree = tree.batchCOW([
      {key: Buffer.from('a'), val: Buffer.from('a')},
      {key: Buffer.from('b'), val: Buffer.from('b')},
      {key: Buffer.from('c'), val: Buffer.from('c')}
    ]);
    const copyRoot = copyTree.root;
    const root = tree.batch([
      {key: Buffer.from('a'), val: Buffer.from('a')},
      {key: Buffer.from('b'), val: Buffer.from('b')},
      {key: Buffer.from('c'), val: Buffer.from('c')}
    ]);
    root.should.deep.equal(copyRoot);

    const cw1 = copyTree.get(Buffer.from('a'));
    const cw2 = copyTree.get(Buffer.from('b'));
    const cw3 = copyTree.get(Buffer.from('c'));

    verifyWitness(
        copyRoot, Buffer.from('a'), copyTree.rlpSerializeWitness(cw1));
    verifyWitness(
        copyRoot, Buffer.from('b'), copyTree.rlpSerializeWitness(cw2));
    verifyWitness(
        copyRoot, Buffer.from('c'), copyTree.rlpSerializeWitness(cw3));
  });

  it('put simple batchCOW verifying with batch get', async () => {
    const tree = new MerklePatriciaTree();
    const copyTree = tree.batchCOW([
      {key: Buffer.from('a'), val: Buffer.from('x')},
      {key: Buffer.from('b'), val: Buffer.from('x')},
      {key: Buffer.from('c'), val: Buffer.from('x')}
    ]);
    const root = copyTree.batch([
      {key: Buffer.from('a'), val: Buffer.from('a')},
      {key: Buffer.from('b'), val: Buffer.from('b')},
      {key: Buffer.from('c'), val: Buffer.from('c')}
    ]);

    const w = copyTree.batchGet(
        [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
    verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w[0]));
    verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w[1]));
    verifyWitness(root, Buffer.from('c'), tree.rlpSerializeWitness(w[2]));
    const genesisStateRoot = utils.KECCAK256_RLP_S;
    tree.root.toString('hex').should.equal(genesisStateRoot);
  });

  it('put and del a simple batchCOW', async () => {
    const tree = new MerklePatriciaTree();
    tree.put(Buffer.from('d'), Buffer.from('d'));
    const initRoot = tree.root;

    const copyTree = tree.batchCOW(
        [
          {key: Buffer.from('a'), val: Buffer.from('a')},
          {key: Buffer.from('b'), val: Buffer.from('b')},
          {key: Buffer.from('c'), val: Buffer.from('c')}
        ],
        [Buffer.from('d')]);

    const w1 = copyTree.get(Buffer.from('a'));
    const w2 = copyTree.get(Buffer.from('b'));
    const w3 = copyTree.get(Buffer.from('c'));
    const root = copyTree.root;

    verifyWitness(root, Buffer.from('a'), copyTree.rlpSerializeWitness(w1));
    verifyWitness(root, Buffer.from('b'), copyTree.rlpSerializeWitness(w2));
    verifyWitness(root, Buffer.from('c'), copyTree.rlpSerializeWitness(w3));

    const w4 = copyTree.rlpSerializeWitness(copyTree.get(Buffer.from('d')));
    should.not.exist(w4.value);
    verifyWitness(copyTree.root, Buffer.from('d'), w4);

    const w5 = tree.get(Buffer.from('d'));
    should.exist(w5.value);
    tree.root.should.deep.equal(initRoot);
  });

  it('put and del a simple batchCOW verifying with batch get', async () => {
    const tree = new MerklePatriciaTree();
    tree.put(Buffer.from('d'), Buffer.from('d'));

    const copyTree = tree.batchCOW(
        [
          {key: Buffer.from('a'), val: Buffer.from('a')},
          {key: Buffer.from('b'), val: Buffer.from('b')},
          {key: Buffer.from('c'), val: Buffer.from('c')}
        ],
        [Buffer.from('d')]);
    const root = copyTree.root;

    const w = copyTree.batchGet(
        [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
    verifyWitness(root, Buffer.from('a'), copyTree.rlpSerializeWitness(w[0]));
    verifyWitness(root, Buffer.from('b'), copyTree.rlpSerializeWitness(w[1]));
    verifyWitness(root, Buffer.from('c'), copyTree.rlpSerializeWitness(w[2]));
  });

  it('put and del a simple batchCOW with overlap', async () => {
    const tree = new MerklePatriciaTree();
    const copyTree = tree.batchCOW(
        [
          {key: Buffer.from('a'), val: Buffer.from('a')},
          {key: Buffer.from('b'), val: Buffer.from('b')},
          {key: Buffer.from('c'), val: Buffer.from('c')}
        ],
        [Buffer.from('c')]);

    const w1 = copyTree.get(Buffer.from('a'));
    const w2 = copyTree.get(Buffer.from('b'));
    const w3 = copyTree.rlpSerializeWitness(copyTree.get(Buffer.from('c')));
    const root = copyTree.root;

    verifyWitness(root, Buffer.from('a'), copyTree.rlpSerializeWitness(w1));
    verifyWitness(root, Buffer.from('b'), copyTree.rlpSerializeWitness(w2));
    should.not.exist(w3.value);
    verifyWitness(root, Buffer.from('c'), w3);
  });

  it('put and del a simple batchCOW with overlap, verifying with batch get',
     async () => {
       const tree = new MerklePatriciaTree();
       const copyTree = tree.batchCOW(
           [
             {key: Buffer.from('a'), val: Buffer.from('a')},
             {key: Buffer.from('b'), val: Buffer.from('b')},
             {key: Buffer.from('c'), val: Buffer.from('c')}
           ],
           [Buffer.from('c')]);

       const w = copyTree.batchGet([Buffer.from('a'), Buffer.from('b')]);
       const root = copyTree.root;
       verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w[0]));
       verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w[1]));
     });
});