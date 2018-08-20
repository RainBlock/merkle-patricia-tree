
import * as benchmark from 'benchmark';
import {MerklePatriciaTree} from './index';
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
const generateStandardTree = async (
    rounds: number, eraSize: number, symmetric: boolean,
    seed: Buffer = Buffer.alloc(32, 0)) => {
  const tree = new MerklePatriciaTree();
  for (let i = 1; i <= rounds; i++) {
    seed = ethUtil.sha3(seed);
    await tree.put(seed, symmetric ? seed : ethUtil.sha3(seed));
    if (i % eraSize === 0) {
      seed = tree.root;
    }
  }
  return tree;
};

//#region Simple tests

// Tests the performance of a no-op.
addAsyncTest('no-op', async () => {}, () => null);

// Tests the performance of inserting into an empty tree.
addAsyncTest('put (empty tree)', async (tree) => {
  await tree.put(Buffer.from('a'), Buffer.from('b'));
}, () => new MerklePatriciaTree());

// Tests the performance of getting from an empty tree.
addAsyncTest('get (empty tree)', async (tree) => {
  await tree.get(Buffer.from('a'));
}, () => new MerklePatriciaTree());

//#endregion

//#region Tree generation tests
addAsyncTest('generate 1k-10k-32-ran', async () => {
  await generateStandardTree(1000, 10000, true);
});

addAsyncTest('generate 1k-1k-32-ran', async () => {
  await generateStandardTree(1000, 1000, true);
});

addAsyncTest('generate 1k-1k-32-mir', async () => {
  await generateStandardTree(1000, 1000, false);
});

addAsyncTest('generate 1k-9-32-ran', async () => {
  await generateStandardTree(1000, 9, true);
});

addAsyncTest('generate 1k-5-32-ran', async () => {
  await generateStandardTree(1000, 5, true);
});

addAsyncTest('generate 1k-3-32-ran', async () => {
  await generateStandardTree(1000, 3, true);
});
//#endregion


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