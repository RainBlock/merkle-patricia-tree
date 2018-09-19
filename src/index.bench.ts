
import * as benchmark from 'benchmark';

import {BatchPut, MerklePatriciaTree} from './index';

const ethUtil = require('ethereumjs-util');

// This file contains the benchmark test suite. It includes the benchmark and
// some lightweight boilerplate code for running benchmark.js in async mode. To
// run the benchmarks, execute `npm run benchmark` from the package directory.
const suite = new benchmark.Suite();

interface BenchmarkDeferrable {
  resolve: () => void;
}

interface BenchmarkRun {
  name: string;
  hz: number;
  stats: benchmark.Stats;
}

/**
 * Simple wrapper for benchmark.js to add an asynchronous test.
 *  @param name         The name of the test to run.
 *  @param asyncTest    An async function which contains the test to be run. If
 * a setup function is provided, the state will be present in the {state}
 * parameter. Otherwise, the {state} parameter will be undefined.
 *  @param setup        Optional setup which provides state to {asyncTest}.
 */
const addAsyncTest = <T>(
    name: string, asyncTest: (state: T) => Promise<void>, setup?: () => T) => {
  let state: T;
  suite.add(name, {
    defer: true,
    setup: () => {
      if (setup !== undefined) {
        state = setup();
      }
    },
    fn: (deferred: BenchmarkDeferrable) => {
      asyncTest(state).then(() => deferred.resolve());
    }
  });
};

/**
 * Generates a standard tree as defined in
 * https://github.com/ethereum/wiki/wiki/Benchmarks Note that this generates the
 * same tree as the original ethereumjs/merkle-patricia-tree random.js
 * benchmark. It doesn't seem to match the root as defined under "standard
 * dataset".
 *
 *  Also, this implementation only supports 32-byte trees.
 *
 *  @param rounds       The number of rounds to go through
 *  @param eraSize      The number of eras. This is the number of inserts per
 * round.
 *  @param symmetric    True, if the keys and values should be the same, false
 * otherwise.
 *
 *  @returns            A {MerklePatriciaTree} initialized to the given inputs.
 */
const generateStandardTree =
    (rounds: number, eraSize: number, symmetric: boolean,
     seed: Buffer = Buffer.alloc(32, 0)) => {
      const tree = new MerklePatriciaTree();
      let batchOps: BatchPut[] = [];
      for (let i = 1; i <= rounds; i++) {
        seed = ethUtil.sha3(seed);
        batchOps.push({key: seed, val: symmetric ? seed : ethUtil.sha3(seed)});
        if (i % eraSize === 0) {
          seed = tree.batch(batchOps);
          batchOps = [];
        }
      }
      return tree;
    };

//#region Simple tests

// Tests the performance of a no-op.
addAsyncTest('no-op', async () => {}, () => null);

// Tests the performance of inserting into an empty tree.
addAsyncTest('put (empty tree)', async (tree) => {
  tree.put(Buffer.from('a'), Buffer.from('b'));
}, () => new MerklePatriciaTree());

// Tests the performance of getting from an empty tree.
addAsyncTest('get (empty tree)', async (tree) => {
  tree.get(Buffer.from('a'));
}, () => new MerklePatriciaTree());

//#endregion

//#region Tree generation tests
addAsyncTest('generate 1k-10k-32-ran', async () => {
  generateStandardTree(1000, 10000, true);
});

addAsyncTest('generate 1k-1k-32-ran', async () => {
  generateStandardTree(1000, 1000, true);
});

addAsyncTest('generate 1k-1k-32-mir', async () => {
  generateStandardTree(1000, 1000, false);
});

addAsyncTest('generate 1k-9-32-ran', async () => {
  generateStandardTree(1000, 9, true);
});

addAsyncTest('generate 1k-5-32-ran', async () => {
  generateStandardTree(1000, 5, true);
});

addAsyncTest('generate 1k-3-32-ran', async () => {
  generateStandardTree(1000, 3, true);
});
//#endregion

const bulkKeys = [
  '90c83efcab8a7f169c5b0d2150d2ae195d85b83a96908108963332b75eccf60c',
  '8539536250b3ea82ae5d5e8ddd5604386fdbd5f8d4c4a959456fdade09d1390c',
  'e8e3979fde5089922656a01fdffa33579a4c40dfdb867185bcf5046bd95fb7e8',
  '3d0163ac95b188031f08f63ca8b0c8d9af257f90b34e0fd8f795536451ee67bf',
  '18893585948d645f6f348b7a6d781dc60211c753878d57436c7406b721e63da4',
  '6a50e1ee7a58f75c39ae94c514871d00dd88e51d69cdf40b85632ce84f36886a',
  'e7a644078640f86a55b2402d7f59cb4d86f3c214b21162531bbbf61e59252e3b',
  'ff111bf3de99f8d4c4bda62c2a8f4adb4dbe59da0be4e685b1c70a6d2bfbe487',
  '0177eb9d8132f368f8aff30947e8174f027762c09a1ee37dca7fa30f41649cdc',
  '0c6efda1acbe4423c057228cf8e6a93fe309b132681d6bd8a35b83cfd15e69cc',
  '3ebe37920d4e63c2b5e85dcd9a7af50be38a0c9c598bc4bb0b1cc39f7304c485',
  'e1f6a54894212db14e76c80c4df35cc72dbff8834b38def366afafc5bfa568e6',
  'be53beda882e0b553825ccd238eb05dee54a866c4b010ea40af54e77a69f6fc9',
  'ee63823ad49b0bf8f7f3d0a67886b50ddf08cba5989dd911a6b8471adbf79c7d'
].map(str => Buffer.from(str, 'hex'));

addAsyncTest('individual bulk get', async (tree) => {
  for (const key of bulkKeys) {
    tree.get(key);
  }
}, () => generateStandardTree(10000, 1000, true));

addAsyncTest('bulk get', async (tree) => {
  tree.getBulk(bulkKeys);
}, () => generateStandardTree(10000, 1000, true));

addAsyncTest('individual get 1', async (tree) => {
  tree.get(bulkKeys[0]);
}, () => generateStandardTree(10000, 1000, true));

addAsyncTest('bulk get 1', async (tree) => {
  tree.getBulk(bulkKeys.slice(0, 1));
}, () => generateStandardTree(10000, 1000, true));


// Reporter for each benchmark
suite.on('cycle', (event: benchmark.Event) => {
  const benchmarkRun: BenchmarkRun = event.target as BenchmarkRun;
  const stats = benchmarkRun.stats as benchmark.Stats;
  const meanInMillis = (stats.mean * 1000).toFixed(3);
  const stdDevInMillis = (stats.deviation * 1000).toFixed(4);
  const runs = stats.sample.length;
  const ops = benchmarkRun.hz.toFixed(benchmarkRun.hz < 100 ? 2 : 0);
  const err = stats.rme.toFixed(2);

  console.log(`${benchmarkRun.name}: ${ops}±${err}% ops/s ${meanInMillis}±${
      stdDevInMillis} ms/op (${runs} run${runs === 0 ? '' : 's'})`);
});

// Runs the test suite
suite.run({async: true});