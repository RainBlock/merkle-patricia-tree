import 'mocha';

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
        tree.put(
            Buffer.from('key1aa'),
            Buffer.from('0123456789012345678901234567890123456789xx'));
        tree.put(Buffer.from('key2bb'), Buffer.from('aval2'));
        tree.put(Buffer.from('key3cc'), Buffer.from('aval3'));

        const w1 = tree.get(Buffer.from('key1aa'));
        const w2 = tree.get(Buffer.from('key2bb'));
        const w3 = tree.get(Buffer.from('key3cc'));

        VerifyWitness(tree.root, Buffer.from('key1aa'), w1);
        VerifyWitness(tree.root, Buffer.from('key2bb'), w2);
        VerifyWitness(tree.root, Buffer.from('key3cc'), w3);
      });

      it('should create a merkle proof and verify it with a single long key',
         async () => {
           tree.put(
               Buffer.from('key1aa'),
               Buffer.from('0123456789012345678901234567890123456789xx'));
           const w1 = tree.get(Buffer.from('key1aa'));
           VerifyWitness(tree.root, Buffer.from('key1aa'), w1);
         });

      it('should create a merkle proof and verify it with a single short key',
         async () => {
           tree.put(Buffer.from('key1aa'), Buffer.from('01234'));
           const w1 = tree.get(Buffer.from('key1aa'));
           VerifyWitness(tree.root, Buffer.from('key1aa'), w1);
         });

      it('should create a merkle proof with keys in the middle', async () => {
        tree.put(
            Buffer.from('key1aa'),
            Buffer.from('0123456789012345678901234567890123456789xxx'));
        tree.put(
            Buffer.from('key1'),
            Buffer.from('0123456789012345678901234567890123456789Very_Long'));
        tree.put(Buffer.from('key2bb'), Buffer.from('aval3'));
        tree.put(Buffer.from('key2'), Buffer.from('short'));
        tree.put(Buffer.from('key3cc'), Buffer.from('aval3'));
        tree.put(
            Buffer.from('key3'),
            Buffer.from('1234567890123456789012345678901'));

        const w1 = tree.get(Buffer.from('key1'));
        const w2 = tree.get(Buffer.from('key2'));
        const w3 = tree.get(Buffer.from('key3'));

        VerifyWitness(tree.root, Buffer.from('key1'), w1);
        VerifyWitness(tree.root, Buffer.from('key2'), w2);
        VerifyWitness(tree.root, Buffer.from('key3'), w3);
      });


      it('should create a merkle proof with an extension and embedded branch',
         async () => {
           tree.put(Buffer.from('a'), Buffer.from('a'));
           tree.put(Buffer.from('b'), Buffer.from('b'));
           tree.put(Buffer.from('c'), Buffer.from('c'));

           const w1 = tree.get(Buffer.from('a'));
           const w2 = tree.get(Buffer.from('b'));
           const w3 = tree.get(Buffer.from('c'));

           VerifyWitness(tree.root, Buffer.from('a'), w1);
           VerifyWitness(tree.root, Buffer.from('b'), w2);
           VerifyWitness(tree.root, Buffer.from('c'), w3);
         });
    });
