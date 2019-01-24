import {MerklePatriciaTree, MerklePatriciaTreeNode} from './index';
import {BranchNode, ExtensionNode, LeafNode, NullNode} from './index';

const Readable = require('readable-stream').Readable;

export class ReadStream extends Readable {
  constructor(trie: MerklePatriciaTree) {
    super({objectMode: true});
    this.trie = trie;
    this.next = null;
  }

  _read() {
    if (!this._started) {
      this.started = true;
      findValueNodes(this, this.trie.rootNode, []);
      this.push(null);
    }
  }
}

function nibblesToBuffer(nibbles: number[]): Buffer {
  const buffer = new Buffer(nibbles.length / 2);
  for (let i = 0; i < buffer.length; i++) {
    let q = i * 2;
    buffer[i] = (nibbles[q] << 4) + nibbles[++q];
  }
  return buffer;
}

function findValueNodes(
    stream: ReadStream, node: MerklePatriciaTreeNode<Buffer>, key: number[]) {
  if (node instanceof NullNode) {
    return;
  } else if (node instanceof LeafNode) {
    stream.push(nibblesToBuffer(key.concat(node.nibbles)), node.value);
    return;
  } else if (node instanceof BranchNode) {
    if (node.value) {
      stream.push(nibblesToBuffer(key.concat(node.nibbles)), node.value);
    }
    for (let i = 0; i < node.branches.length; i++) {
      if (node.branches[i] === undefined) continue;
      findValueNodes(stream, node.branches[i], key.concat(node.nibbles));
    }
    return;
  } else if (node instanceof ExtensionNode) {
    findValueNodes(stream, node.nextNode, key.concat(node.nibbles));
    return;
  } else {
    throw new Error('node of unknown type');
  }
}
