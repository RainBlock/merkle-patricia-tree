import {RlpEncode} from 'rlp-stream';

const original = require('./index_original');
const originalNode = require('./trieNode');
const ethUtil = require('ethereumjs-util');
const matchingNibbleLength = require('./util').matchingNibbleLength;

export interface OriginalTreeNode {
  value: Buffer;
  type: string;
  raw: Buffer[]|Buffer[][];
  key: Buffer;
  serialize(): Buffer;
}
interface OriginalTree {
  root: Buffer;
  put: (key: Buffer, val: Buffer, callback: (err: string) => void) => void;
  get: (key: Buffer, callback: (err: string, val: Buffer|null) => void) => void;
  del: (key: Buffer, callback: (err: string) => void) => void;
  batch: (ops: OriginalBatchOp[], callback: (err: string) => void) => void;
  findPath:
      (key: Buffer,
       callback:
           (err: string, node: OriginalTreeNode|null, keyRemainder: Buffer,
            stack: OriginalTreeNode[]) => void) => void;
}

/**
 * An interface for a [[Witness]], which is a combination of a value and a proof
 * (witnessed at a certain root)
 */
export interface Witness {
  /** The value mapped to the key */
  value: Buffer|null;
  /**
   * A proof, which consists of the list of nodes traversed to reach the node
   * containing the value.
   */
  proof: Buffer[];
}

export interface SearchResult {
  node: OriginalTreeNode|null;
  remainder: Buffer;
  stack: OriginalTreeNode[];
}

/** Describes a key value pair used in a batched put operation. */
export interface BatchPut {
  /** The key to insert. */
  key: Buffer;
  /** The value to insert */
  val: Buffer;
}

interface OriginalBatchOp {
  type: string;
  key: Buffer;
  value?: Buffer;
}

/** A Merkle Patricia Tree, as defined in the Ethereum Yellow Paper. */
export class MerklePatriciaTree {
  /** The original tree. */
  private originalTree: OriginalTree;

  /**
   * A Buffer representing the root hash of the tree. Always 256-bits (32
   * bytes).
   */
  get root(): Buffer {
    return this.originalTree.root;
  }

  /** Construct a new Merkle Patricia Tree. */
  constructor() {
    this.originalTree = new original();
  }

  /**
   * Insert a new mapping into the tree. If the key is already mapped in the
   * tree, it is updated with the new value.
   *
   * @param key   The key to insert.
   * @param val   A Buffer representing the value.
   *
   * @returns     A [[Promise]], resolved when the put is completed.
   */
  put(key: Buffer, val: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.originalTree.put(key, val, (err: string) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Given a key, retrieve a [[Witness]] for the mapping.
   *
   * @param key   The key to retrieve the [[Witness]] for.
   *
   * @returns     A [[Witness]], with a proof of the value read (or a null
   * value, with a proof of the value's nonexistence).
   */
  async get(key: Buffer): Promise<Witness> {
    const search = await this.search(key);
    const value = search.remainder.length === 0 && search.node !== null ?
        search.node.value :
        null;
    const proof: Buffer[] = [];
    for (const [idx, node] of search.stack.entries()) {
      const rlp = node.serialize();
      if (rlp.length >= 32 || (idx === 0)) {
        proof.push(rlp);
      }
    }
    return {value, proof};
  }

  /**
   * Given a key, delete any mapping that exists for that key.
   *
   * @param key   The key to unmap.
   *
   * @returns     A Promise, resolved when the key is unmapped.
   */
  del(key: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.originalTree.del(key, (err: string) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Execute a batch of put and delete operations. The execution is batched,
   * so calling this function with multiple updates provides more opportunities
   * for optimization and can be faster than call put() and del() multiple
   * times.
   *
   * @param putOps  An array of put operations on the tree, of type
   * [[BatchPut]].
   * @param delOps  An optional array of keys to delete from the tree.
   *
   * @returns       A promise, resolved with the root that results from this
   *                set of operations.
   */
  batch(putOps: BatchPut[], delOps: Buffer[] = []): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const originalBatchOps = [];
      for (const put of putOps) {
        originalBatchOps.push(
            {type: 'put', key: put.key, value: put.val} as OriginalBatchOp);
      }
      for (const del of delOps) {
        originalBatchOps.push({type: 'del', key: del});
      }
      this.originalTree.batch(originalBatchOps, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(this.root);
        }
      });
    });
  }

  /**
   * Search for the given key, returning a [[SearchResult]] which contains the
   * path traversed to search for the key.
   *
   * @param key    The key to search for.
   * @returns      A [[SearchResult]] containig
   */
  search(key: Buffer): Promise<SearchResult> {
    return new Promise((resolve, reject) => {
      this.originalTree.findPath(
          key,
          (error: string, node: OriginalTreeNode|null, remainder: Buffer,
           stack: OriginalTreeNode[]) => {
            if (error) {
              reject(error);
            } else {
              // Fixes bug in original code where remainder is undefined if tree
              // is empty
              if (remainder === undefined) {
                remainder = key;
              }
              // Same with stack.
              if (stack === undefined) {
                stack = [];
              }
              resolve({node, remainder, stack});
            }
          });
    });
  }
}

/** This Error indicates that there was a problem verifying a witness. */
export class VerificationError extends Error {}

/**
 * Verifies that a [[Witness]] is correct for the given root and key.
 *
 * @param root                  A [[Buffer]] containing the root of the tree to
 * check
 * @param key                   A [[Buffer]] containing the key to check
 * @param witness               The [[Witness]] to verify
 *
 * @throws [[VerificationError]]  If there was an error verifying the witness
 * using the given key and root.
 * @return                      A promise, which is resolved if the witness was
 * valid. Otherwise, the promise is completed exceptionally with the failure
 * reason.
 */
export function VerifyWitness(root: Buffer, key: Buffer, witness: Witness) {
  let targetHash: Buffer = root;
  let currentKey: number[] = originalNode.stringToNibbles(key);
  let cld;

  for (const [idx, serializedNode] of witness.proof.entries()) {
    const hash = ethUtil.sha3(serializedNode);
    if (Buffer.compare(hash, targetHash)) {
      throw new VerificationError(`Hash mismatch: expected ${
          targetHash.toString('hex')} got ${hash.toString('hex')}`);
    }
    const node: OriginalTreeNode =
        new originalNode(ethUtil.rlp.decode(serializedNode));
    if (node.type === 'branch') {
      if (currentKey.length === 0) {
        if (idx !== witness.proof.length - 1) {
          throw new VerificationError(
              `Proof length mismatch (branch): expected ${idx + 1} but got ${
                  witness.proof.length}`);
        }
        if (!node.value.equals(witness.value!)) {
          throw new VerificationError(`Value mismatch: expected ${
              witness.value} but got ${node.value}`);
        }
        return;
      }
      cld = node.raw[currentKey[0]];
      currentKey = currentKey.slice(1);
      if (cld.length === 2) {
        const embeddedNode = new originalNode(cld);
        if (idx !== witness.proof.length - 1) {
          throw new VerificationError(
              `Proof length mismatch (embeddedNode): expected ${
                  idx + 1} but got ${witness.proof.length}`);
        }
        if (matchingNibbleLength(embeddedNode.key, currentKey) !==
            embeddedNode.key.length) {
          throw new VerificationError(
              `Key length mismatch (embeddedNode): expected ${
                  matchingNibbleLength(
                      embeddedNode.key,
                      currentKey)} but got ${embeddedNode.key.length}`);
        }
        currentKey = currentKey.slice(embeddedNode.key.length);
        if (currentKey.length !== 0) {
          throw new VerificationError(
              `Key does not match the proof (embeddedNode)`);
        }
        if (!embeddedNode.value.equals(witness.value!)) {
          throw new VerificationError(`Value mismatch: expected ${
              witness.value} but got ${embeddedNode.value}`);
        }
        return;
      } else {
        targetHash = cld as Buffer;
      }
    } else if ((node.type === 'extention') || (node.type === 'leaf')) {
      if (matchingNibbleLength(node.key, currentKey) !== node.key.length) {
        throw new VerificationError(`Key does not match the proof ${
            node.type}: expected ${node.key}, but got ${currentKey}`);
      }
      cld = node.value as (Buffer | Buffer[][]);
      currentKey = currentKey.slice(node.key.length);
      if (currentKey.length === 0 ||
          (cld.length === 17 && currentKey.length === 1)) {
        if (cld.length === 17) {
          cld = (cld[currentKey[0]] as Buffer[])[1];
          currentKey = currentKey.slice(1);
        }
        if (idx !== witness.proof.length - 1) {
          throw new VerificationError(
              `Key length mismatch (${node.type}): expected ${
                  idx + 1} but got ${witness.proof.length}`);
        }
        if (!(cld as Buffer).equals(witness.value!)) {
          throw new VerificationError(
              `Value mismatch: expected ${witness.value} but got ${cld}`);
        }
        return;
      } else {
        targetHash = cld as Buffer;
      }
    } else {
      throw new VerificationError(`Unexpected node type ${node.type}`);
    }
  }
  throw new VerificationError(`Unexpected end of proof`);
}