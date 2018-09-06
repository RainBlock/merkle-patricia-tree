# ☔️🌲 @rainblock/merkle-patricia-tree - In-Memory Merkle Tree
[![NPM Package](https://img.shields.io/npm/v/@rainblock/merkle-patricia-tree.svg?style=flat-square)](https://www.npmjs.org/package/@rainblock/merkle-patricia-tree)
[![Build Status](https://img.shields.io/travis/RainBlock/merkle-patricia-tree.svg?branch=master&style=flat-square)](https://travis-ci.org/RainBlock/merkle-patricia-tree)
[![Coverage Status](https://img.shields.io/coveralls/RainBlock/merkle-patricia-tree.svg?style=flat-square)](https://coveralls.io/r/RainBlock/merkle-patricia-tree)

[@rainblock/merkle-patricia-tree](https://www.npmjs.org/package/@rainblock/merkle-patricia-tree) is an in-memory merkle tree which conforms to the specifications of the modified merkle patricia tree used by Ethereum. It is a fork of the [EthereumJS](https://github.com/ethereumjs) [library](https://github.com/ethereumjs/merkle-patricia-tree), and released under the same license, however, the API has changed to be synchronous instead of callback based. The goals of @rainblock/merkle-patricia-tree are to be:

- __In-Memory Optimized.__  @rainblock/merkle-patricia-tree is optimized for in-memory use and does not support persistence. 

- __High performance.__  By taking advantage of in-memory optimizations, @rainblock/merkle-patricia-tree aims to be high performance - currently, it is 2-8x more performance than EthereumJS's merkle tree on standard benchmarks.

- __Well documented.__  [API documentation](https://rainblock.github.io/merkle-patricia-tree/) is automatically generated from the JSdoc embedded in the typescript source, and the source code aims to be commented and maintainable.

- __Ethereum compatible.__ The root hashes produced by @rainblock/merkle-patricia-tree should produce the same root hashes as other Ethereum merkle tree libraries given the same input data.

# Install

Add @rainblock/merkle-patricia-tree to your project with:

> `npm install @rainblock/merkle-patricia-tree`

# Usage

Basic API documentation can be found [here](https://rainblock.github.io/merkle-patricia-tree/), but the following example shows basic use of puts and gets and verification:

```typescript
import {MerklePatriciaTree, VerifyWitness} from '@rainblock/merkle-patricia-tree';
const tree = new MerklePatriciaTree();

tree.put(Buffer.from('a'), Buffer.from('b'));

// Get returns a witness which contains { value, proof }
const witness = tree.get(Buffer.from('a'));

// VerifyWitness will throw an error if the proof doesn't match the given root
VerifyWitness(witness, tree.root);
```
# Benchmarks

Benchmarks can be run by executing `npm run benchmark` from the package directory.
