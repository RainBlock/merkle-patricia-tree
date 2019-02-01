import 'mocha';

import * as chai from 'chai';
import {RlpEncode, RlpList} from 'rlp-stream';

import {CheckpointTrie} from './checkpointTrie';
import {verifyWitness} from './index';



// Needed for should.not.be.undefined.
/* tslint:disable:no-unused-expression */

chai.should();
const should = chai.should();

describe('Try original simple-save-retrieve', () => {
  const tree: CheckpointTrie<string, string> =
      new CheckpointTrie<string, string>({
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
    const val1 = tree.batchGet([Buffer.from('test')]);
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
    const val1 = tree.batchGet([Buffer.from('test')]);
    const val = tree.get('test');
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });

  it('should delete value', async () => {
    tree.del('test');
    should.not.exist((tree.get('test')).value);
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
    const val1 = tree.batchGet([Buffer.from('test')]);
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
    const val1 = tree.batchGet([Buffer.from('doge')]);
    const val = tree.get('doge');
    val.value!.should.deep.equal(val1[0].value);
    for (let i = 0; i < val.proof.length; i++) {
      val.proof[i].should.deep.equal(val1[0].proof[i]);
    }
  });

  it('should delete from a branch', async () => {
    tree.del('doge');
    should.not.exist((tree.get('doge')).value);
  });
});


describe('Try original storing larger values', () => {
  const tree: CheckpointTrie = new CheckpointTrie();

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
  const tree: CheckpointTrie = new CheckpointTrie();

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
  const tree: CheckpointTrie = new CheckpointTrie();

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
  const tree: CheckpointTrie = new CheckpointTrie();

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
  let tree: CheckpointTrie;

  before(async () => {
    tree = new CheckpointTrie();
  });

  it('should delete from a branch->branch-branch', async () => {
    const a1 = tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    const a2 = tree.put(
        Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    const a3 = tree.put(
        Buffer.from([12, 33, 44]), Buffer.from('create the last branch'));
    tree.del(Buffer.from([12, 22, 22]));
    const val = tree.get(Buffer.from([12, 22, 22]));
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

    tree.del(Buffer.from([12, 22, 22]));
    const val = tree.get(Buffer.from([12, 22, 22]));
    should.not.exist(val.value);
  });

  it('should delete from a extension->branch-extension', async () => {
    tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    tree.put(Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    tree.put(Buffer.from([12, 33, 44]), Buffer.from('create the last branch'));
    tree.del(Buffer.from([11, 11, 11]));
    const val = tree.get(Buffer.from([11, 11, 11]));
    should.not.exist(val.value);
  });

  it('should delete from a extension->branch-branch', async () => {
    tree.put(Buffer.from([11, 11, 11]), Buffer.from('first'));
    tree.put(Buffer.from([12, 22, 22]), Buffer.from('create the first branch'));
    tree.put(
        Buffer.from([12, 33, 33]), Buffer.from('create the middle branch'));
    tree.put(Buffer.from([12, 34, 44]), Buffer.from('create the last branch'));
    tree.del(Buffer.from([11, 11, 11]));
    const val = tree.get(Buffer.from([11, 11, 11]));
    should.not.exist(val.value);
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

  const tree: CheckpointTrie = new CheckpointTrie();

  it('should match the original genesis root', async () => {
    tree.put(g, rlpAccount);
    tree.put(j, rlpAccount);
    tree.put(v, rlpAccount);
    tree.put(a, rlpAccount);
    tree.root.toString('hex').should.equal(genesisStateRoot);
  });

  const treeBatch: CheckpointTrie = new CheckpointTrie();

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
    const tree = new CheckpointTrie();
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
    const tree = new CheckpointTrie();
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
    const tree = new CheckpointTrie();
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

    const w4 = tree.get(Buffer.from('d'));
    should.not.exist(w4.value);
  });

  it('put and del a simple batch verifying with batch get', async () => {
    const tree = new CheckpointTrie();
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
    const tree = new CheckpointTrie();
    const root = tree.batch(
        [
          {key: Buffer.from('a'), val: Buffer.from('a')},
          {key: Buffer.from('b'), val: Buffer.from('b')},
          {key: Buffer.from('c'), val: Buffer.from('c')}
        ],
        [Buffer.from('c')]);

    const w1 = tree.get(Buffer.from('a'));
    const w2 = tree.get(Buffer.from('b'));
    const w3 = tree.get(Buffer.from('c'));

    verifyWitness(root, Buffer.from('a'), tree.rlpSerializeWitness(w1));
    verifyWitness(root, Buffer.from('b'), tree.rlpSerializeWitness(w2));
    should.not.exist(w3.value);
  });

  it('put and del a simple batch with overlap, verifying with batch get',
     async () => {
       const tree = new CheckpointTrie();
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

describe('testing checkpoints', () => {
  let tree: CheckpointTrie<string, string>, preRoot: string, postRoot: string,
      treeCopy: CheckpointTrie<string, string>;

  it('setup', async () => {
    tree = new CheckpointTrie<string, string>({
      keyConverter: (k) => Buffer.from(k),
      valueConverter: (v) => Buffer.from(v),
      putCanDelete: false
    });
    tree.put('do', 'verb');
    tree.put('doge', 'coin');
    preRoot = tree.root.toString('hex');
  });

  it('should copy trie and get value before checkpoint', async () => {
    treeCopy = tree.copy();
    treeCopy.root.toString('hex').should.equal(preRoot);
    const val = treeCopy.get('do').value;
    val!.should.equal('verb');
  });

  it('should create a checkpoint', async () => {
    tree.checkpoint();
  });

  it('should save to the cache', async () => {
    tree.put('test', 'something');
    tree.put('love', 'emotion');
    postRoot = tree.root.toString('hex');
  });

  it('should get values from before checkpoint', async () => {
    const res = tree.get('doge');
    res.value!.should.equal('coin');
  });

  it('should get values from cache', async () => {
    const res = tree.get('love');
    res.value!.should.equal('emotion');
  });

  it('should copy trie and get upstream and cache values after checkpoint',
     async () => {
       treeCopy = tree.copy();
       treeCopy.root.toString('hex').should.equal(postRoot);
       treeCopy._checkpoints.length.should.equal(1);
       treeCopy.isCheckpoint().should.equal(true);
       let res = treeCopy.get('do');
       res.value!.should.equal('verb');
       res = treeCopy.get('love');
       res.value!.should.equal('emotion');
     });

  it('should revert to the original root', async () => {
    tree.isCheckpoint().should.equal(true);
    tree.revert();
    tree.root.toString('hex').should.equal(preRoot);
    tree.isCheckpoint().should.equal(false);
  });

  it('should not get values from cache after revert', async () => {
    const res = tree.get('love');
    should.not.exist(res.value);
  });

  it('should commit a checkpoint', async () => {
    tree.checkpoint();
    tree.put('test', 'something');
    tree.put('love', 'emotion');
    tree.commit();
    tree.isCheckpoint().should.equal(false);
    tree.root.toString('hex').should.equal(postRoot);
  });

  it('should get new values after commit', async () => {
    const res = tree.get('love');
    res.value!.should.equal('emotion');
  });

  it('should commit a nested checkpoint', async () => {
    tree.checkpoint();
    let root: Buffer;
    tree.put('test', 'something else');
    root = tree.root;
    tree.checkpoint();
    tree.put('the feels', 'emotion');
    tree.revert();
    tree.commit();
    tree.isCheckpoint().should.equal(false);
    tree.root.toString('hex').should.equal(root.toString('hex'));
  });
});