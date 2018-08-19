import 'mocha';

import * as chai from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import {RlpEncode, RlpList} from 'rlp-stream';

const ethUtil = require('ethereumjs-util');

import {MerklePatriciaTree} from './index';
import {triggerAsyncId} from 'async_hooks';


// Needed for should.not.be.undefined.
/* tslint:disable:no-unused-expression */

chai.should();
const should = chai.should();

interface TestData {
  in : string[][];
  root: string;
}

const testDataToBuffer = (input: string): Buffer => {
  if (input === null) {
    return Buffer.from([]);
  } else if (input.startsWith('0x')) {
    return Buffer.from(input.slice(2), 'hex');
  }
  return Buffer.from(input);
};

const secureTestDataToBuffer = (input: string): Buffer => {
  if (input === null) {
    return ethUtil.sha3(Buffer.from([]));
  } else if (input.startsWith('0x')) {
    return ethUtil.sha3(Buffer.from(input.slice(2), 'hex'));
  }
  return ethUtil.sha3(Buffer.from(input));
};

describe('Run official tests', () => {
  const testJson: {[testName: string]: TestData} =
      fs.readJSONSync(path.join(__dirname, '../test/trietest.json'));

  for (const [testName, testData] of Object.entries(testJson)) {
    const tree = new MerklePatriciaTree();

    it(`should pass official test ${testName}`, async () => {
      for (const pair of testData.in) {
        await tree.put(testDataToBuffer(pair[0]), testDataToBuffer(pair[1]));
      }
      `0x${tree.root.toString('hex')}`.should.equal(testData.root);
    });
  }
});

describe('Run official tests async', () => {
  const testJson: {[testName: string]: TestData} =
      fs.readJSONSync(path.join(__dirname, '../test/trietest.json'));

  for (const [testName, testData] of Object.entries(testJson)) {
    const tree = new MerklePatriciaTree();

    it(`should pass official test ${testName}`, async () => {
      const promises = [];
      for (const pair of testData.in) {
        promises.push(
            tree.put(testDataToBuffer(pair[0]), testDataToBuffer(pair[1])));
      }
      await Promise.all(promises);
      `0x${tree.root.toString('hex')}`.should.equal(testData.root);
    });
  }
});

describe('Run official tests (secure)', () => {
  const testJson: {[testName: string]: TestData} =
      fs.readJSONSync(path.join(__dirname, '../test/trietest_secureTrie.json'));

  for (const [testName, testData] of Object.entries(testJson)) {
    const tree = new MerklePatriciaTree();

    it(`should pass official test ${testName}`, async () => {
      for (const pair of testData.in) {
        await tree.put(
            secureTestDataToBuffer(pair[0]), testDataToBuffer(pair[1]));
      }
      `0x${tree.root.toString('hex')}`.should.equal(testData.root);
    });
  }
});

describe('Run official tests (secure) async', () => {
  const testJson: {[testName: string]: TestData} =
      fs.readJSONSync(path.join(__dirname, '../test/trietest_secureTrie.json'));

  for (const [testName, testData] of Object.entries(testJson)) {
    const tree = new MerklePatriciaTree();

    it(`should pass official test ${testName}`, async () => {
      const promises = [];
      for (const pair of testData.in) {
        promises.push(tree.put(
            secureTestDataToBuffer(pair[0]), testDataToBuffer(pair[1])));
      }
      await Promise.all(promises);
      `0x${tree.root.toString('hex')}`.should.equal(testData.root);
    });
  }
});