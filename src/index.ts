import {rejects} from 'assert';
import {resolve} from 'url';

const original = require('./index_original');

interface OriginalTree {
  root: Buffer;
  put: (key: Buffer, val: Buffer, callback: (err: string) => void) => void;
  get: (key: Buffer, callback: (err: string, val: Buffer|null) => void) => void;
  del: (key: Buffer, callback: (err: string) => void) => void;
}


/**
 * An interface for a witness, which is a combination of a value and a proof
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

/** A Merkle Patricia Tree, as defined in the Ethereum Yellow Paper. */
export class MerklePatriciaTree {
  /** The original tree. */
  private originalTree: OriginalTree;

  /**
   * A buffer representing the root hash of the tree. Always 256-bits (32
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
   * @param val   A buffer representing the value.
   *
   * @returns     A promise, resolved when the put is completed.
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
   * Given a key, retrieve the previously mapped value, or null, if no mappping
   * exists.
   *
   * @param key   The key to retrieve the value for.
   *
   * @returns     A promise, containing the value if it exists, or null, if no
   * value was previously mapped to key.
   */
  get(key: Buffer): Promise<Witness> {
    return new Promise((resolve, reject) => {
      this.originalTree.get(key, (err: string, value: Buffer|null) => {
        if (err) {
          reject(err);
        } else {
          try {
            original.prove(
                this.originalTree, key, (err: string, proof: Buffer[]) => {
                  resolve({value, proof});
                });
          } catch (e) {
            // TODO: rewrite proof interface. currently error is thrown if no
            // node exists.
            resolve({value: null, proof: []});
          }
        }
      });
    });
  }

  /**
   * Given a key, delete any mapping that exists for that key.
   *
   * @param key   The key to unmap.
   *
   * @returns     A promise, resolved when the key is unmapped.
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
}

/**
 * Verifies that a witness is correct for the given root and key.
 *
 * @param root      A buffer containing the root of the tree to check
 * @param key       A buffer containing the key to check
 * @param witness   The witness to verify
 *
 * @return          A promise, which is resolved if the witness was valid.
 * Otherwise, the promise is completed exceptionally with the failure reason.
 */
export function VerifyWitness(
    root: Buffer, key: Buffer, witness: Witness): Promise<void> {
  return new Promise((resolve, reject) => {
    original.verifyProof(
        root, key, witness.proof, (err: string, val: Buffer) => {
          if (err) {
            reject(err);
          } else {
            if (val.equals(witness.value as Buffer)) {
              resolve();
            } else {
              reject(new Error(`Expected value ${
                  witness.value} to match value ${val} in proof`));
            }
          }
        });
  });
}