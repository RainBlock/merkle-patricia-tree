import {CheckpointTrie} from './checkpointTrie';
import {MerklePatriciaTreeOptions, Witness} from './index';

const ethUtil = require('ethereumjs-util');

export interface SecureInterface<K, V> {
  copy: () => SecureTrie<K, V>;
  get: (key: K) => Witness<V>;
  put: (key: K, value: V) => void;
  del: (key: K) => void;
}

export class SecureTrie<K = Buffer, V = Buffer> extends
    CheckpointTrie<K, V> implements SecureInterface<K, V> {
  constructor(
      options: MerklePatriciaTreeOptions<K, V> = {putCanDelete: true},
      trie?: CheckpointTrie<K, V>) {
    super(options);
    if (trie && trie.rootNode) {
      this.rootNode = trie.rootNode;
    }
  }

  copy(): SecureTrie<K, V> {
    return new SecureTrie<K, V>(this.options, super.copy());
  }

  get(key: K): Witness<V> {
    const hash = ethUtil.keccak256(key);
    return super.get(hash);
  }

  put(key: K, value: V) {
    if (this.options.putCanDelete && !value) {
      return this.del(key);
    }
    const hash = ethUtil.keccak256(key);
    super.put(hash, value);
  }

  del(key: K) {
    const hash = ethUtil.keccak256(key);
    super.del(hash);
  }
}