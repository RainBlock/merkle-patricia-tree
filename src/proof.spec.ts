import 'mocha';

import {AsyncResource} from 'async_hooks';
import * as chai from 'chai';
import * as path from 'path';
import {RlpEncode, RlpList} from 'rlp-stream';

import {MerklePatriciaTree, VerifyWitness} from './index';



// Needed for should.not.be.undefined.
/* tslint:disable:no-unused-expression */

chai.should();
const should = chai.should();

describe(
    'Try original simple merkle proofs generation and verification',
    async () => {
      let tree: MerklePatriciaTree;

      before(async () => {
        tree = new MerklePatriciaTree();
      });

      it('should create a merkle proof and verify it', async () => {
        await tree.put(
            Buffer.from('key1aa'),
            Buffer.from('0123456789012345678901234567890123456789xx'));
        await tree.put(Buffer.from('key2bb'), Buffer.from('aval2'));
        await tree.put(Buffer.from('key3cc'), Buffer.from('aval3'));

        const w1 = await tree.get(Buffer.from('key1aa'));
        const w2 = await tree.get(Buffer.from('key2bb'));
        const w3 = await tree.get(Buffer.from('key3cc'));

        VerifyWitness(tree.root, Buffer.from('key1aa'), w1);
        VerifyWitness(tree.root, Buffer.from('key2bb'), w2);
        VerifyWitness(tree.root, Buffer.from('key3cc'), w3);
      });

      it('should create a merkle proof and verify it with a single long key',
         async () => {
           await tree.put(
               Buffer.from('key1aa'),
               Buffer.from('0123456789012345678901234567890123456789xx'));
           const w1 = await tree.get(Buffer.from('key1aa'));
           VerifyWitness(tree.root, Buffer.from('key1aa'), w1);
         });

      it('should create a merkle proof and verify it with a single short key',
         async () => {
           await tree.put(Buffer.from('key1aa'), Buffer.from('01234'));
           const w1 = await tree.get(Buffer.from('key1aa'));
           VerifyWitness(tree.root, Buffer.from('key1aa'), w1);
         });

      it('should create a merkle proof with keys in the middle', async () => {
        await tree.put(
            Buffer.from('key1aa'),
            Buffer.from('0123456789012345678901234567890123456789xxx'));
        await tree.put(
            Buffer.from('key1'),
            Buffer.from('0123456789012345678901234567890123456789Very_Long'));
        await tree.put(Buffer.from('key2bb'), Buffer.from('aval3'));
        await tree.put(Buffer.from('key2'), Buffer.from('short'));
        await tree.put(Buffer.from('key3cc'), Buffer.from('aval3'));
        await tree.put(
            Buffer.from('key3'),
            Buffer.from('1234567890123456789012345678901'));

        const w1 = await tree.get(Buffer.from('key1'));
        const w2 = await tree.get(Buffer.from('key2'));
        const w3 = await tree.get(Buffer.from('key3'));

        VerifyWitness(tree.root, Buffer.from('key1'), w1);
        VerifyWitness(tree.root, Buffer.from('key2'), w2);
        VerifyWitness(tree.root, Buffer.from('key3'), w3);
      });
    });
