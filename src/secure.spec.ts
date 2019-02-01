import 'mocha';

import * as chai from 'chai';
const secureTrie = require('../build/src/secure').SecureTrie;



// Needed for should.not.be.undefined.
/* tslint:disable:no-unused-expression */

chai.should();
const should = chai.should();

describe('SecureTrie', () => {
  const trie = new secureTrie();
  const k = Buffer.from('foo');
  const v = Buffer.from('bar');

  it('put and get value', async () => {
    trie.put(k, v);
    const res = trie.get(k);
    v.should.equals(res.value);
  });

  it('copy trie', async () => {
    const t = trie.copy();
    const res = t.get(k);
    v.should.equals(res.value);
  });
});

describe('secure tests', async () => {
  let trie = new secureTrie();
  const jsonTests = require('../test/trietest_secureTrie.json');

  it('empty values', async () => {
    for (const row of jsonTests.emptyValues.in) {
      trie.put(new Buffer(row[0]), row[1]);
    }
    ('0x' + trie.root.toString('hex')).should.equal(jsonTests.emptyValues.root);
  });

  it('branchingTests', async () => {
    trie = new secureTrie();
    for (const row of jsonTests.branchingTests.in) {
      trie.put(row[0], row[1]);
    }
    ('0x' + trie.root.toString('hex'))
        .should.equal(jsonTests.branchingTests.root);
  });

  it('jeff', async () => {
    for (const row of jsonTests.jeff.in) {
      let val = row[1];
      if (val) {
        val = new Buffer(row[1].slice(2), 'hex');
      }
      trie.put(new Buffer(row[0].slice(2), 'hex'), val);
    }
    ('0x' + trie.root.toString('hex')).should.equal(jsonTests.jeff.root);
  });
});