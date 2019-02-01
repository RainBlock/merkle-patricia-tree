import {BatchPut, MerklePatriciaTree, MerklePatriciaTreeNode, MerklePatriciaTreeOptions, Witness} from './index';

export interface CheckpointInterface {
  isCheckpoint: () => boolean;
  commit: () => void;
  revert: () => void;
  checkpoint: () => void;
}

export class CheckpointTrie<K = Buffer, V = Buffer> extends
    MerklePatriciaTree<K, V> implements CheckpointInterface {
  _checkpoints: Array<MerklePatriciaTree<K, V>> = new Array();
  inCPMode = false;

  constructor(
      options: MerklePatriciaTreeOptions<K, V> = {putCanDelete: true},
      trie?: MerklePatriciaTree<K, V>) {
    super(options);
    if (trie) {
      this.rootNode = trie.rootNode;
      this.needsCOW = trie.needsCOW;
      this.copies = trie.copies;
    }
  }

  isCheckpoint(): boolean {
    return this._checkpoints.length > 0;
  }

  checkpoint() {
    const wasCheckpoint = this.isCheckpoint();
    this._checkpoints.push(this.copy());
    if (this.isCheckpoint() && !wasCheckpoint) {
      this.inCPMode = true;
    }
  }

  commit() {
    if (this.isCheckpoint()) {
      const commitNode = this._checkpoints.pop();
      if (!this.isCheckpoint() && commitNode) {
        this.inCPMode = false;
      }
    } else {
      throw new Error('Trying to commit when not checkpointed');
    }
  }

  revert() {
    if (this.isCheckpoint()) {
      const lastNode = this._checkpoints.pop();
      if (lastNode) {
        this.rootNode = lastNode.rootNode;
      }
      if (!this.isCheckpoint()) {
        this.inCPMode = false;
      }
    } else {
      throw new Error('Trying to revert when not checkpointed');
    }
  }

  batchCOW(putOps: Array<BatchPut<K, V>>, delOps: K[] = []):
      CheckpointTrie<K, V> {
    const copyTrie: MerklePatriciaTree<K, V> = super.batchCOW(putOps, delOps);
    const cpCopyTrie = new CheckpointTrie<K, V>(this.options, copyTrie);
    cpCopyTrie._checkpoints = this._checkpoints.slice();
    cpCopyTrie.inCPMode = this.inCPMode;
    return cpCopyTrie;
  }

  copy(): CheckpointTrie<K, V> {
    const copyTrie: MerklePatriciaTree<K, V> = super.copy();
    const cpCopyTrie = new CheckpointTrie<K, V>(this.options, copyTrie);
    cpCopyTrie._checkpoints = this._checkpoints.slice();
    cpCopyTrie.inCPMode = this.inCPMode;
    return cpCopyTrie;
  }
}