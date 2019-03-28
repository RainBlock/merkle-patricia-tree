import {toBigIntBE, toBufferBE} from 'bigint-buffer';
import {hashAsBigInt, hashAsBuffer, HashType} from 'bigint-hash';
import {RlpDecode, RlpEncode, RlpItem, RlpList} from 'rlp-stream';

const originalNode = require('./trieNode');
const matchingNibbleLength = require('./util').matchingNibbleLength;

interface OriginalTreeNode {
  value: Buffer;
  type: string;
  raw: Buffer[]|Buffer[][];
  key: Buffer;
  serialize(): Buffer;
}

/**
 * An interface for a [[Witness]], which is a combination of a value and a proof
 * (witnessed at a certain root)
 */
export interface Witness<V> {
  /** The value mapped to the key, or null, if nothing  */
  value: V|null;
  /**
   * A proof, which consists of the list of nodes traversed to reach the node
   * containing the value.
   */
  proof: Array<MerklePatriciaTreeNode<V>>;
}

/**
 * An interface for a RlpWitness, which is a serialized witness in RLP format.
 */
export interface RlpWitness {
  /** The value mapped to the key, or null, if nothing is mapped */
  value: Buffer|null;
  /**
   * A proof, which consists a RLP serialized list of nodes traversed to reach
   * the node containing the value.
   */
  proof: Buffer[];
}


/**
 * A concise interface for multiple [[Witnesses]], each a combination of a value
 * and proof in case of bulk reads
 */
export interface MultiWitness {
  proofIndex: Buffer[];
  indexedWitnesses: IndexedWitness[];
}

/**
 * A concise interface for a witness, where the proof is a list of indexes
 * index refers to the node at the corresponding index in a list of RLP encoded
 * nodes
 */
export interface IndexedWitness {
  value: Buffer|null;
  proof: number[];
}

/** A search result, returned as a result for searching for a key. */
export interface SearchResult<V = Buffer> {
  /** The node, if found, or null, if no node was found. */
  node: MerklePatriciaTreeNode<V>|null;
  /** Contains any remaining nibbles. */
  remainder: number[];
  /** Contains a stack of nodes encountered while traversing the tree. */
  stack: Array<MerklePatriciaTreeNode<V>>;
}

/** Describes a key value pair used in a batched put operation. */
export interface BatchPut<K = Buffer, V = Buffer> {
  /** The key to insert. */
  key: K;
  /** The value to insert */
  val: V;
}

/** Returned when next() is called on a tree node */
export interface NextNode<V> {
  /** Any remaining nibbles after traversing the node. */
  remainingNibbles: number[];
  /** The next node, or null, if no node was present. */
  next: MerklePatriciaTreeNode<V>|null;
}

/** Represents an abstract node in a modified Ethereum merkle patricia tree. */
export abstract class MerklePatriciaTreeNode<V> {
  /**
   * The nibbles (of the key) used when traversing this node. Not present for
   * branch/null nodes.
   */
  abstract nibbles: number[];
  /**
   * The value stored in the node. Null represents value not present.
   */
  abstract value: V|null;

  /**
   * Memoizing RLP encoding of the serialized node
   */
  rlpNodeEncoding: Buffer|null = null;

  /**
   * Only used for batchCOW to mark nodes to be copied
   */
  markForCopy = false;

  /**
   * Serializes and computed the RLP encoding of the node
   * Also stores it for future references.
   */
  getRlpNodeEncoding(options: MerklePatriciaTreeOptions<{}, V>): Buffer {
    if (options.memoizeSerialization === undefined ||
        options.memoizeSerialization === false) {
      return RlpEncode(this.serialize(options));
    }
    if (this.rlpNodeEncoding === null) {
      this.rlpNodeEncoding = RlpEncode(this.serialize(options));
    }
    return this.rlpNodeEncoding;
  }

  /**
   * Clears the memoized RLP node encoding
   */
  clearRlpNodeEncoding() {
    this.rlpNodeEncoding = null;
  }


  /**
   * Serialize the node into a buffer or an array of buffers which may be RLP
   * serialized.
   */
  abstract serialize(options: MerklePatriciaTreeOptions<{}, V>): RlpItem;

  /** When calling toString(), sets the length of the hashes printed. */
  static HUMAN_READABLE_HASH_LENGTH = 6;
  /**
   * When calling toString(), sets the length of the values printed. Values
   * longer will be appended with ...
   */
  static HUMAN_READABLE_VAL_LENGTH = 6;

  private memoizedHash: bigint|null = null;

  clearMemoizedHash() {
    this.memoizedHash = null;
  }

  /**
   * Return the hash for the node.
   * @param  rlpEncodedBuffer An optional RLP encoded buffer of the node to use
   * for hashing
   * @returns A Buffer containing the hash for the node.
   */
  hash(
      options: MerklePatriciaTreeOptions<{}, V>,
      rlpEncodedBuffer: Buffer|null = null): bigint {
    if (this.memoizedHash === null) {
      if (rlpEncodedBuffer === null) {
        rlpEncodedBuffer = this.getRlpNodeEncoding(options);
      }
      this.memoizedHash = hashAsBigInt(HashType.KECCAK256, rlpEncodedBuffer);
    }
    return this.memoizedHash!;
  }

  /**
   * Returns nibbles remaining if this node were to be traversed.
   *  Only consumes the nibbles if this node is a match.
   *  @param  nibbles Nibbles to process for traversal.
   *  @returns Nibbles remaining after the traversal.
   */
  protected consumeNibbles(nibbles: number[]): number[] {
    let sliceIndex = 0;
    for (let i = 0; i < nibbles.length; i++) {
      if (i > this.nibbles.length - 1 || this.nibbles[i] !== nibbles[i]) {
        return nibbles;  // Don't consume anything if there wasn't a match
      }
      sliceIndex = i + 1;
    }
    return (sliceIndex !== this.nibbles.length) ? nibbles :
                                                  nibbles.slice(sliceIndex);
  }

  /**
   * Get the next node as a result of evaluating the nibbles given.
   * @param nibbles The nibbles to evaluate
   * @returns A [NextNode] with the remaining nibbles and the next node, if any.
   */
  abstract next(nibbles: number[]): NextNode<V>;

  /**
   * Convert a buffer into a nibble representation.
   * @param buffer The buffer to convert.
   * @return An array of nibbles.
   */
  static bufferToNibbles(buffer: Buffer): number[] {
    // Convert to nibbles
    const nibbles = [];
    for (const byte of buffer) {
      nibbles.push((byte & 0xF0) >> 4);  // Top nibble
      nibbles.push(byte & 0x0F);         // Bottom nibble
    }
    return nibbles;
  }

  /**
   * Return the intersecting prefix, which contains the nibbles shared by
   * both n0 and n1 at the beginning of each nibble set.
   *
   * @param n0 The first set of nibbles
   * @param n1 The second set of nibbles
   *
   * @returns A set of nibbles representing the intersecting prefix of both
   * input sets.
   */
  static intersectingPrefix(n0: number[], n1: number[]): number[] {
    const prefix: number[] = [];
    for (let i = 0; i < n0.length; i++) {
      if (n0[i] === n1[i]) {
        prefix.push(n0[i]);
      } else {
        return prefix;
      }
    }
    return prefix;
  }

  /**
   * Converts to node to a human readable hash representation. This is set to
   * the last n characters in the hash, as defined by
   * HUMAN_READABLE_HASH_LENGTH.
   *
   * @returns A human readable hash string.
   */
  toReadableHash(options: MerklePatriciaTreeOptions<{}, V>): string {
    const hash = this.hash(options).toString(16);
    return hash.substring(
        hash.length - MerklePatriciaTreeNode.HUMAN_READABLE_HASH_LENGTH);
  }

  /**
   * Converts a value to a human readable value. This is set to the first n
   * characters of the hex representation of a value, as defined by
   * HUMAN_READABLE_VAL_LENGTH.
   * @param val The value to convert.
   * @returns A human readable value string
   */
  static toReadableValue<V>(val: V): string {
    let hex = (val as {} as Buffer).toString('hex');
    if (hex.length > MerklePatriciaTreeNode.HUMAN_READABLE_VAL_LENGTH) {
      hex = `${
          hex.substring(
              0, MerklePatriciaTreeNode.HUMAN_READABLE_VAL_LENGTH)}...`;
    }
    return hex;
  }

  /**
   * Converts a set of nibbles to its representation as a hex string.
   * @param nibbles The nibbles to convert.
   * @returns The input nibbles as a hex string.
   */
  static nibblesAsHex(nibbles: number[]): string {
    return nibbles.map(n => n.toString(16)).join('');
  }

  /**
   * Converts a set of nibbles and an attached prefix to its buffer
   * representation.
   * @param nibbles The nibbles to convert.
   * @param prefix  The prefix for the nibbles to convert.
   *
   * @returns The representation of the nibbles with the given prefix as a
   * buffer.
   */
  static toBuffer(nibbles: number[], prefix: number): Buffer {
    // NOTE: "optional terminator is not supported"
    const out = Buffer.allocUnsafe((nibbles.length / 2) + 1);
    const odd = nibbles.length % 2 !== 0;

    for (let i = 0; i < out.length; i++) {
      // Append a prefix on the first byte
      if (i === 0) {
        // If there's an even number, we 0 pad
        out[i] = odd ? ((prefix << 4) | nibbles[0]) : (prefix << 4);
      } else {
        // If we're odd, we the first nibble ended up in the prefix, so
        // we need to skip 1.
        const nibbleIndex = odd ? ((i - 1) * 2) + 1 : (i - 1) * 2;
        out[i] = nibbles[nibbleIndex] << 4 | nibbles[nibbleIndex + 1];
      }
    }
    return out;
  }

  /**
   * Converts a buffer to the nibbles and prefix representation.
   * @param Buffer representation of nibbles and prefix
   * @returns nibbles The nibbles to convert.
   * @returns prefix  The prefix for the nibbles to convert.
   */
  static fromBuffer(out: Buffer): {nibbles: number[], prefix: number} {
    // Convert buffer into nibbles
    const nibbles = this.bufferToNibbles(out);
    // Get prefix and nibbles based on the first nibble
    const first = nibbles[0];
    if (first % 2) {
      nibbles.splice(0, 1);
    } else {
      nibbles.splice(0, 2);
    }
    return {nibbles, prefix: first};
  }
}

/**
 * Represents a null node, which is -only- used at the root of the tree to
 * represent a tree with no elements.
 */
export class NullNode<V> extends MerklePatriciaTreeNode<V> {
  /** A null node always has no nibbles. */
  readonly nibbles = [];

  /** The value of a null node cannot be set. */
  set value(val: V) {
    throw new Error('Attempted to set the value of a NullNode');
  }

  /** The hash of a null node is always the empty hash. */
  hash() {
    return BigInt(
        '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421');
  }

  /** The serialized version of a null node is always the empty buffer. */
  serialize() {
    return Buffer.from([]);
  }

  /** Traversing a null node always yields nothing. */
  next(nibbles: number[]) {
    return {remainingNibbles: nibbles, next: null};
  }

  /** Returns the string representation of this null node. */
  toString() {
    return '[NullNode]';
  }
}

/**
 * Represents a branch node in the tree. A branch node contains 16 branches,
 * one for each hex character, and may also act as a "leaf" node by containing a
 * value.
 */
export class BranchNode<V> extends MerklePatriciaTreeNode<V> {
  /** A branch node has no nibbles to be set. */
  readonly nibbles: number[] = [];
  /** The value this branch holds, initially unset. */
  value: V|null = null;

  /** An array of branches this tree node holds. */
  branches: Array<MerklePatriciaTreeNode<V>> =
      new Array<MerklePatriciaTreeNode<V>>(16);

  /**
   * Checks if the last nibble will result in the given branch.
   * This is only the case if the given branch is a LeafNode/BranchNode AND
   * (1) if a LeafNode, it has no nibbles
   * (2) if a BranchNode, it has a value
   * (3) There is only one nibble remaining
   *
   * @param nibbles The input set of nibbles
   * @param branch  The branch to check
   *
   * @returns True, if the last nibble will not result in the given branch.
   */
  private static lastNibbleNoMatch<N>(
      nibbles: number[], branch: MerklePatriciaTreeNode<N>): boolean {
    return nibbles.length === 1 &&
        ((branch instanceof LeafNode && branch.nibbles.length > 0) ||
         (branch instanceof BranchNode && branch.value === null) ||
         branch instanceof ExtensionNode || branch instanceof NullNode);
  }

  /**
   * @inheritdoc
   */
  next(nibbles: number[]) {
    if (nibbles.length === 0) {
      return {next: null, remainingNibbles: nibbles};
    }
    const branch = this.branches[nibbles[0]];

    if (branch === undefined || BranchNode.lastNibbleNoMatch(nibbles, branch)) {
      // Nothing in this branch, or last nibble and branch doesn't match
      return {next: null, remainingNibbles: nibbles};
    } else {
      // Return the branch
      return {next: branch, remainingNibbles: nibbles.slice(1)};
    }
  }

  /**
   * Returns the string representation of this node.
   *
   * @returns The string representation of this node.
   */
  toString(options?: MerklePatriciaTreeOptions<{}, V>) {
    let outString =
        `(${options === undefined ? '?' : this.toReadableHash(options)})`;
    for (const [idx, branch] of this.branches.entries()) {
      if (branch !== undefined) {
        outString += ` ${idx.toString(16)}: ${
            options === undefined ? '?' : branch.toReadableHash(options)}`;
      }
    }
    if (this.value !== null) {
      outString +=
          ` val: ${MerklePatriciaTreeNode.toReadableValue(this.value)}`;
    }
    return `[branch ${outString}]`;
  }

  /**
   * @inheritdoc
   */
  serialize(options: MerklePatriciaTreeOptions<{}, V>) {
    const hashedBranches: RlpItem = [];
    for (const [idx, branch] of this.branches.entries()) {
      if (branch === undefined) {
        hashedBranches[idx] = Buffer.from([]);
      } else if (
          branch instanceof BranchNode || (branch.nibbles.length / 2) > 30) {
        // Will be >32 when RLP serialized, so just hash
        hashedBranches[idx] =
            toBufferBE((branch as MerklePatriciaTreeNode<V>).hash(options), 32);
      } else {
        const serialized = branch.serialize(options);
        const rlpEncoded = branch.getRlpNodeEncoding(options);
        hashedBranches[idx] = (rlpEncoded.length >= 32) ?
            toBufferBE(
                branch.hash(options, rlpEncoded),
                32) :    // Non-embedded node
            serialized;  // Embedded node in branch
      }
    }
    hashedBranches.push(
        this.value === null ? Buffer.from([]) :
                              options.valueConverter!(this.value));
    return hashedBranches;
  }
}

/**
 * Represents an extension node, which "consumes" a set of nibbles and points to
 * another node.
 */
export class ExtensionNode<V> extends MerklePatriciaTreeNode<V> {
  /** Extension nodes never contain a value. */
  readonly value: null = null;

  /** The prefix when the number of nibbles in the extension node is odd. */
  static PREFIX_EXTENSION_ODD = 1;
  /** The prefix when the number of nibbles in the extension node is even. */
  static PREFIX_EXTENSION_EVEN = 0;

  /**
   * Return the prefix for this extension node.
   * @returns The prefix for the node.
   */
  get prefix() {
    return this.nibbles.length % 2 === 0 ? ExtensionNode.PREFIX_EXTENSION_EVEN :
                                           ExtensionNode.PREFIX_EXTENSION_ODD;
  }

  /**
   * @inheritdoc
   */
  next(nibbles: number[]) {
    const intersection =
        MerklePatriciaTreeNode.intersectingPrefix(nibbles, this.nibbles);
    if (intersection.length === this.nibbles.length) {
      return {
        next: this.nextNode,
        remainingNibbles: nibbles.slice(intersection.length)
      };
    } else {
      return {next: null, remainingNibbles: nibbles};
    }
  }

  /**
   * Construct a new extension node.
   * @param nibbles The nibbles that will be consumed when this node is
   * traversed.
   * @param nextNode The node that this node points to.
   */
  constructor(
      public nibbles: number[], public nextNode: MerklePatriciaTreeNode<V>) {
    super();
    if (nibbles.length === 0) {
      throw new Error('Extension branch cannot have 0 nibbles');
    }
  }

  /** @inheritdoc */
  serialize(options: MerklePatriciaTreeOptions<{}, V>) {
    const serialized = this.nextNode!.serialize(options);
    const rlpEncodeNextNode = this.nextNode!.getRlpNodeEncoding(options);
    return [
      MerklePatriciaTreeNode.toBuffer(this.nibbles, this.prefix),
      rlpEncodeNextNode.length >= 32 ?
          toBufferBE(this.nextNode!.hash(options), 32) :
          serialized
    ];
  }

  /**
   * Returns the string representation of this node.
   *
   * @returns The string representation of this node.
   */
  toString(options?: MerklePatriciaTreeOptions<{}, V>) {
    const outString =
        `(${options === undefined ? '?' : this.toReadableHash(options)}) -(${
            MerklePatriciaTreeNode.nibblesAsHex(this.nibbles)})-> ${
            options === undefined ? '?' :
                                    this.nextNode.toReadableHash(options)}`;
    return `[extension ${outString}]`;
  }
}

/**
 * Represents a leaf node, which are terminal nodes in the tree which holds
 * values.
 */
export class LeafNode<V> extends MerklePatriciaTreeNode<V> {
  /** The prefix of the leaf node if the number of nibbles is odd */
  private static PREFIX_LEAF_ODD = 3;
  /** The prefix of the leaf node if the number of nibbles is even. */
  private static PREFIX_LEAF_EVEN = 2;

  /**
   * Constructs a new leaf node with the given nibbles and value.
   * @param nibbles The nibbles consumed by the leaf node.
   * @param value   The value held in the leaf node.
   */
  constructor(public nibbles: number[], public value: V) {
    super();
  }

  /** Returns the prefix for this leaf node. */
  get prefix() {
    return this.nibbles.length % 2 === 0 ? LeafNode.PREFIX_LEAF_EVEN :
                                           LeafNode.PREFIX_LEAF_ODD;
  }

  /** @inheritdoc */
  next(nibbles: number[]) {
    return {remainingNibbles: this.consumeNibbles(nibbles), next: null};
  }

  /** @inheritdoc */
  serialize(options: MerklePatriciaTreeOptions<{}, V>) {
    return [
      MerklePatriciaTreeNode.toBuffer(this.nibbles, this.prefix),
      options.valueConverter!(this.value)
    ];
  }

  /**
   * Returns the string representation of this node.
   *
   * @returns The string representation of this node.
   */
  toString(options: MerklePatriciaTreeOptions<{}, V>) {
    const outString =
        `(${options === undefined ? '?' : this.toReadableHash(options)}) -(${
            MerklePatriciaTreeNode.nibblesAsHex(this.nibbles)})-> val: ${
            MerklePatriciaTreeNode.toReadableValue(this.value)}`;
    return `[leaf ${outString}]`;
  }
}

/**
 * Represents a hash node, which is -only- used for pruning the
 * CachedMerklePatriciaTreeNode to maxCacheDepth.
 */
export class HashNode<V> extends MerklePatriciaTreeNode<V> {
  /** A hash node always has no nibbles. */
  readonly nibbles = [];

  /** nodeHash stores the hash of the current node. */
  nodeHash: bigint;

  /** The serialized version of a hash node. */
  serialization: RlpItem|null = null;

  /** The value of a hash node cannot be set. */
  set value(val: V) {
    throw new Error('Attempted to set the value of a NullNode');
  }

  constructor(hash: bigint, serialization?: RlpItem) {
    super();
    this.nodeHash = hash;
    if (serialization) {
      this.serialization = serialization;
    }
  }

  /** The hash of a hash node returned. */
  hash() {
    return this.nodeHash;
  }

  serialize(): RlpItem {
    if (!this.serialization) {
      throw new Error('Cannot serialize HashNode');
    }
    return this.serialization;
  }

  /** Traversing a hash node always yields nothing. */
  next(nibbles: number[]) {
    return {remainingNibbles: nibbles, next: null};
  }

  /** Returns the string representation of this null node. */
  toString() {
    return `[HashNode ${this.nodeHash}]`;
  }
}

/** The interface for a merkle tree. */
export interface MerkleTree<K, V> {
  /** The root hash of the tree. */
  root: Buffer;
  /**
   * The root hash of the tree, as a bigint. Reading this property is more
   * efficient than obtaining a buffer.
   */
  rootHash: bigint;
  /**
   * Insert a new mapping into the tree. If the key is already mapped in the
   * tree, it is updated with the new value.
   *
   * @param key   The key to insert.
   * @param val   A Buffer representing the value.
   *
   */
  put: (key: K, val: V) => void;
  /**
   * Given a key, retrieve a [[Witness]] for the mapping.
   *
   * @param key   The key to retrieve the [[Witness]] for.
   *
   * @returns     A [[Witness]], with a proof of the value read (or a null
   * value, with a proof of the value's nonexistence).
   */
  get: (key: K) => Witness<V>;
  /**
   * Given a key, delete any mapping that exists for that key.
   *
   * @param key   The key to unmap.
   *
   */
  del: (key: K) => void;
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
   * @returns       The root that results from this set of operations.
   */
  batch: (putOps: Array<BatchPut<K, V>>, delOps?: K[]) => Buffer;
  /**
   * Search for the given key, returning a [[SearchResult]] which contains the
   * path traversed to search for the key.
   *
   * @param key    The key to search for.
   * @returns      A [[SearchResult]] containing the path to the key, and the
   * value if it was present.
   */
  search: (key: K) => SearchResult<V>;
}

/** Configuration for a merkle tree. */
export interface MerklePatriciaTreeOptions<K, V> {
  /** A function which converts keys to the native type of the tree. */
  keyConverter?: (key: K) => Buffer;
  /** A function which converts values to the native type of the tree */
  valueConverter?: (val: V) => Buffer;
  /**
   * Whether a put with an empty value can delete a node. Note that turning
   * this on will require serialization at insert time.
   */
  putCanDelete: boolean;
  /**
   * Whether or not to memoize serializations or not. If true, serializations
   * will be memoized, which will increase the speed of proof generation at
   * the cost of increased memory overhead.
   */
  memoizeSerialization?: boolean;
}

/** A Merkle Patricia Tree, as defined in the Ethereum Yellow Paper. */
export class MerklePatriciaTree<K = Buffer, V = Buffer> implements
    MerkleTree<K, V> {
  /** The root node of the tree. */
  rootNode: MerklePatriciaTreeNode<V>;

  /**
   * A Buffer representing the root hash of the tree. Always 256-bits (32
   * bytes).
   */
  get root(): Buffer {
    return toBufferBE(
        this.rootNode.hash(
            this.options as {} as MerklePatriciaTreeOptions<{}, V>),
        32);
  }

  /**
   * The root hash of the tree, as a bigint. Reading this property is more
   * efficient than obtaining a buffer.
   */
  get rootHash(): bigint {
    return this.rootNode.hash(
        this.options as {} as MerklePatriciaTreeOptions<{}, V>);
  }

  /** Construct a new Merkle Patricia Tree. */
  constructor(public options: MerklePatriciaTreeOptions<K, V> = {
    putCanDelete: true
  }) {
    if (options.valueConverter === undefined) {
      options.valueConverter = (v) => v as {} as Buffer;
    }
    if (options.keyConverter === undefined) {
      options.keyConverter = (k) => k as {} as Buffer;
    }
    this.rootNode = new NullNode<V>();
  }

  /**
   * Insert a new mapping into the tree. If the key is already mapped in the
   * tree, it is updated with the new value.
   *
   * @param key   The key to insert.
   * @param val   A Buffer representing the value.
   *
   */
  put(key: K, val: V) {
    const convKey = this.options.keyConverter!(key);

    if (convKey.length === 0) {
      throw new Error('Empty key is not supported');
    }
    if (this.options.putCanDelete &&
        this.options.valueConverter!(val).length === 0) {
      this.del(key);
      return;
    }
    if (this.rootNode instanceof NullNode) {
      // Null node, so insert this value as a leaf.
      this.rootNode =
          new LeafNode(MerklePatriciaTreeNode.bufferToNibbles(convKey), val);
    } else {
      // search
      const result = this.search(key);
      if (result.remainder.length === 0 && result.node !== null) {
        // Matches, update the value.
        result.node!.value = val;
      } else {
        // Doesn't match, perform tree insertion using stack
        this.insert(result.stack, result.remainder, val);
      }
      // Clear all memoized hashes in the path, they will be reset.
      for (const node of result.stack) {
        node.clearMemoizedHash();
        node.clearRlpNodeEncoding();
      }
    }
  }

  /**
   * Copies only the node; leaving its successors the same
   * @param node : Node for copy
   */
  getNodeCopy(node: MerklePatriciaTreeNode<V>): MerklePatriciaTreeNode<V> {
    if (node instanceof BranchNode) {
      const copyNode = new BranchNode<V>();
      for (const nib of node.nibbles) {
        copyNode.nibbles.push(nib);
      }
      for (let i = 0; i < node.branches.length; i++) {
        copyNode.branches[i] = node.branches[i];
      }
      if (node.value) {
        copyNode.value = node.value.slice(0);
      }
      return copyNode;
    } else if (node instanceof ExtensionNode) {
      const copyNode = new ExtensionNode<V>(node.nibbles, node.nextNode);
      return copyNode;
    } else if (node instanceof LeafNode) {
      const copyNode = new LeafNode<V>(node.nibbles, node.value);
      return copyNode;
    }
    return new NullNode<V>();
  }

  private copyPath(key: K, newTree: MerklePatriciaTree<K, V>, flag?: boolean) {
    let keyNibbles: number[] =
        MerklePatriciaTreeNode.bufferToNibbles(this.options.keyConverter!(key));
    let currNode: MerklePatriciaTreeNode<V>|null = newTree.rootNode;
    let nextNode: MerklePatriciaTreeNode<V>|null;
    const result: SearchResult<V> = this.search(key);
    for (let i = 1; i < result.stack.length; i++) {
      nextNode = this.getNodeCopy(result.stack[i]);
      if (currNode instanceof BranchNode) {
        currNode.branches[keyNibbles[0]] = nextNode;
        keyNibbles.shift();
      } else if (currNode instanceof ExtensionNode) {
        currNode.nextNode = nextNode;
        keyNibbles = keyNibbles.slice(currNode.nibbles.length);
      }
      currNode = nextNode;
    }
  }

  /**
   * CopyTreePaths
   * Copies paths that are marked for copy
   */
  private copyTreePaths(
      node1: MerklePatriciaTreeNode<V>,
      node2: MerklePatriciaTreeNode<V>): MerklePatriciaTreeNode<V> {
    if (node1.markForCopy) {
      node2 = this.getNodeCopy(node1);
      if (node1 instanceof BranchNode && node2 instanceof BranchNode) {
        for (let branchIdx = 0; branchIdx < node1.branches.length;
             branchIdx += 1) {
          if (node1.branches[branchIdx]) {
            node2.branches[branchIdx] = this.copyTreePaths(
                node1.branches[branchIdx], node2.branches[branchIdx]);
          }
        }
      } else if (
          node1 instanceof ExtensionNode && node2 instanceof ExtensionNode) {
        node2.nextNode = this.copyTreePaths(node1.nextNode, node2.nextNode);
      } else if (
          node1 instanceof LeafNode && node2 instanceof LeafNode ||
          node1 instanceof NullNode && node2 instanceof NullNode) {
        return node2;
      } else {
        throw new Error('Unexpected node type while copying nodes');
      }
    }
    return node2;
  }

  /**
   * multiSearch searches the tree for all keys and marks nodes for copy
   * @param putOps : List of key, value pairs
   * @param delOps : List of keys
   * @param flag   : True if we want to mark the nodes for copy
   */
  multiSearch(putOps: Array<BatchPut<K, V>>, delOps: K[], flag: boolean) {
    for (const put of putOps) {
      this.search(put.key, flag);
    }
    for (const key of delOps) {
      this.search(key, flag);
    }
  }

  /**
   * Insert a node with the given value after a search.
   * @param stack     The stack as a result of the search
   * @param remainder The remainder as a result of the search
   * @param value     The value to insert.
   */
  insert(
      stack: Array<MerklePatriciaTreeNode<V>>, remainder: number[], value: V) {
    const last = stack[stack.length - 1];
    if (remainder.length === 0) {
      last.value = value;
    } else {
      if (last instanceof BranchNode) {
        // Insert into branch
        if (last.branches[remainder[0]] !== undefined) {
          // Branch occupied. Create new branch
          const branch = new BranchNode();
          const prevNode = last.branches[remainder[0]];

          if (remainder.length === 1) {
            branch.value = value;
          } else {
            branch.branches[remainder[1]] =
                new LeafNode(remainder.slice(2), value);
          }

          if (prevNode instanceof LeafNode) {
            if (prevNode.nibbles.length === 0) {
              branch.value = value;
            } else {
              branch.branches[prevNode.nibbles[0]] =
                  new LeafNode(prevNode.nibbles.slice(1), prevNode.value);
            }
          } else if (prevNode instanceof ExtensionNode) {
            branch.branches[prevNode.nibbles[0]] = prevNode;
            prevNode.nibbles = prevNode.nibbles.slice(1);
          } else if (prevNode instanceof BranchNode) {
            throw new Error('Unexpected branch node in occupied branch');
          }

          last.branches[remainder[0]] = branch;
        } else {
          last.branches[remainder[0]] = new LeafNode(remainder.slice(1), value);
        }
      } else if (last instanceof ExtensionNode) {
        // We will be shrinking this extension node and inserting a branch
        const intersection =
            MerklePatriciaTreeNode.intersectingPrefix(remainder, last.nibbles);
        const prevNibbles = last.nibbles;
        let prevNext = last.nextNode;
        const branch = new BranchNode<V>();

        // The intersection is now the extension
        last.nibbles = intersection;
        last.nextNode = branch;

        // And update the branch according to what type was previously in the
        // extension
        if (prevNext instanceof LeafNode) {
          // If leaf node, update the key for the leaf node
          prevNext.nibbles =
              prevNibbles.slice(intersection.length).concat(prevNext.nibbles);
        } else if (prevNext instanceof BranchNode) {
          if (prevNibbles.length > intersection.length + 1) {
            // Otherwise, if branch node and the remainder is > 1, create an
            // extension
            const extension = new ExtensionNode(
                prevNibbles.slice(intersection.length + 1), prevNext);
            prevNext = extension;
          }
        }

        // And insert both the new value and prevNext into the branch
        branch.branches[prevNibbles[intersection.length]] = prevNext;
        if (intersection.length === remainder.length) {
          // Goes in as value
          branch.value = value;
        } else if (intersection.length >= remainder.length) {
          // Unexpected, intersection is longer than remainder
          throw new Error('Unexpected remainder longer than intersection');
        } else {
          // Insert new value
          branch.branches[remainder[intersection.length]] =
              new LeafNode<V>(remainder.slice(intersection.length + 1), value);
        }

        // If the intersection is 0, then eliminate the extension.
        if (intersection.length === 0) {
          // Remove the extension
          if (stack.length === 1) {
            this.rootNode = branch;
          } else {
            const prevNode = stack[stack.length - 2];
            if (prevNode instanceof BranchNode) {
              for (const [idx, prevBranch] of prevNode.branches.entries()) {
                if (prevBranch === last) {
                  prevNode.branches[idx] = branch;
                }
              }
            } else {
              throw new Error('Unexpected non-branch while removing extension');
            }
          }
        }
      } else if (last instanceof LeafNode) {
        const intersection =
            MerklePatriciaTreeNode.intersectingPrefix(remainder, last.nibbles);
        // This is the branch node that will contain both child nodes.
        const branch = new BranchNode<V>();
        // This is the node that must be inserted into the tree. Unless there is
        // an extension, it is the branch node.
        let insertNode: MerklePatriciaTreeNode<V> = branch;
        if (intersection.length !== 0) {
          // We need an extension node.
          const extension = new ExtensionNode(intersection, branch);
          // The insertion node is now the extension node
          insertNode = extension;
        }

        // Calculate the offset used for the branch key (0 if no intersection)
        const branchOffset = 0 + intersection.length;
        // And the slice offset, used to calculate new keys for each node
        const sliceOffset = 1 + intersection.length;

        // Insert the nodes into the branch
        if (remainder.length === intersection.length) {
          // The new value becomes the value of the branch node
          branch.value = value;
        } else {
          // Insert the new value into the proper branch
          branch.branches[remainder[branchOffset]] =
              new LeafNode<V>(remainder.slice(sliceOffset), value);
        }

        // Insert the old value into the proper branch
        if (last.nibbles.length === intersection.length) {
          // The previous value becomes the value of the branch node
          branch.value = last.value;
        } else {
          // Insert the previous value into the proper branch
          branch.branches[last.nibbles[branchOffset]] = last;
        }

        last.nibbles = last.nibbles.slice(sliceOffset);

        // Now we need to update last-1 to point to our new node to insert
        if (stack.length === 1 ||
            last.nibbles.length === 0 && stack.length === 2) {
          // Length 1, so root should be updated
          this.rootNode = insertNode;
        } else {
          // Otherwise, update the node that previously pointed to last
          const previous = stack[stack.length - 2];
          if (previous instanceof BranchNode) {
            // Need to figure out previous branch key
            for (const [idx, prevBranch] of previous.branches.entries()) {
              if (prevBranch === last) {
                // Point to the new node instead
                previous.branches[idx] = insertNode;
                break;
              }
              if (idx === previous.branches.length) {
                throw new Error(`Couldn't find previous branch!`);
              }
            }
          } else {
            throw new Error('Unexpected non-branch node in update');
          }
        }
      }
    }
  }

  /**
   * Given a key, retrieve a [[Witness]] for the mapping.
   *
   * @param key   The key to retrieve the [[Witness]] for.
   *
   * @returns     A [[Witness]], with a proof of the value read (or a null
   * value, with a proof of the value's nonexistence).
   */
  get(key: K): Witness<V> {
    const search = this.search(key);
    const value = search.node === null ? null : search.node.value;
    const proof = search.stack;

    return {value, proof};
  }

  /**
   * Reads multiple keys and returns a concise reply of witnesses
   * @param keys : bulk keys to be read
   * @returns : Array of witnesses
   */
  batchGet(keys: K[]): Array<Witness<V>> {
    const reply = [];
    for (const key of keys) {
      reply.push(this.get(key));
    }
    return reply;
  }

  /**
   * Given a key, delete any mapping that exists for that key.
   *
   * @param key   The key to unmap.
   *
   */
  del(key: K) {
    const result = this.search(key);
    if (result.node != null) {
      // Clear all memoized hashes in the path, they will be reset.
      for (const node of result.stack) {
        node.clearMemoizedHash();
        node.clearRlpNodeEncoding();
      }
      if (result.node instanceof BranchNode) {
        result.node.value = Buffer.from([]);
      } else if (result.stack.length === 1) {
        // Root node, replace it with null
        this.rootNode = new NullNode<V>();
      } else {
        const prevNode = result.stack[result.stack.length - 2];
        if (prevNode instanceof BranchNode) {
          // Delete the node from the branch

          // Keeps data iff there is one remaining node
          let remainingIdx = -1;
          let remainingBranch: MerklePatriciaTreeNode<V>|null = null;

          for (const [idx, branch] of prevNode.branches.entries()) {
            if (branch === result.node) {
              delete prevNode.branches[idx];
            } else if (branch !== undefined) {
              if (remainingIdx === -1) {
                // First present node not the same
                remainingIdx = idx;
                remainingBranch = branch;
              } else {
                remainingBranch = null;
              }
            }
          }

          if (remainingBranch !== null) {
            const connectNode = remainingBranch instanceof ExtensionNode ?
                remainingBranch :
                new ExtensionNode([remainingIdx], remainingBranch);
            if (remainingBranch instanceof ExtensionNode) {
              connectNode.nibbles.unshift(remainingIdx);
            }
            if (result.stack.length === 2) {
              this.rootNode = connectNode;
            } else {
              const branchParent = result.stack[result.stack.length - 3];
              if (branchParent instanceof BranchNode) {
                for (const [idx, branch] of branchParent.branches.entries()) {
                  if (branch === prevNode) {
                    if (connectNode.nextNode instanceof LeafNode) {
                      // If leaf, insert the node directly
                      branchParent.branches[idx] = connectNode.nextNode;
                      // Update the leaf node with the extension's nibbles
                      connectNode.nextNode.nibbles = connectNode.nibbles.concat(
                          connectNode.nextNode.nibbles);
                      branchParent.branches[idx].clearMemoizedHash();
                      branchParent.branches[idx].clearRlpNodeEncoding();
                    } else {
                      // Otherwise, attach the extension
                      branchParent.branches[idx] = connectNode;
                    }
                  }
                }
              } else if (branchParent instanceof ExtensionNode) {
                // Move the consumed nibble into the extension node
                branchParent.nibbles =
                    branchParent.nibbles.concat(connectNode.nibbles);
                branchParent.nextNode = connectNode.nextNode;
              } else {
                throw new Error(`Unexpected node type during branch collapse`);
              }
            }
          }

        } else if (prevNode instanceof ExtensionNode) {
          // Remove the extension's parent.
          if (result.stack.length === 2) {
            // Root node, replace it with null
            this.rootNode = new NullNode<V>();
          } else {
            const extensionPrevNode = result.stack[result.stack.length - 3];
            if (extensionPrevNode instanceof BranchNode) {
              for (const [idx, branch] of extensionPrevNode.branches
                       .entries()) {
                if (branch === prevNode) {
                  delete extensionPrevNode.branches[idx];
                  break;
                }
              }
            } else {
              throw new Error(
                  `Expected BranchNode but didn't get branch node during deletion`);
            }
          }
        } else if (prevNode instanceof LeafNode) {
          throw new Error(`Unexpected LeafNode during deletion`);
        }
      }
    }
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
   * @returns       The root that results from this set of operations.
   */
  batch(putOps: Array<BatchPut<K, V>>, delOps: K[] = []): Buffer {
    for (const put of putOps) {
      this.put(put.key, put.val);
    }
    for (const del of delOps) {
      this.del(del);
    }
    return this.root;
  }

  /**
   * Execute a batch of put and delete operations. The execution of batch
   * operations are performed in a copy on write (cow) fashion.
   *
   * @param putOps  An array of put operations on the tree, of type
   * [[BatchPut]].
   * @param delOps  An optional array of keys to delete from the tree.
   *
   * @returns       A new MerklePatriciaTree updated in a cow manner.
   */
  batchCOW(putOps: Array<BatchPut<K, V>>, delOps: K[] = []):
      MerklePatriciaTree<K, V> {
    // Search the tree and mark the nodes for copy
    this.multiSearch(putOps, delOps, true);
    const newTree = new MerklePatriciaTree<K, V>(this.options);
    // copy all the nodes marked for copy into the newTree
    newTree.rootNode = this.copyTreePaths(this.rootNode, newTree.rootNode);
    // Modify the new Tree
    newTree.batch(putOps, delOps);
    // reset the nodes marked for copy in the original tree
    this.multiSearch(putOps, delOps, false);
    // return the new tree;
    return newTree;
  }

  /**
   * Search for the given key, returning a [[SearchResult]] which contains the
   * path traversed to search for the key.
   *
   * @param key    The key to search for.
   * @returns      A [[SearchResult]] containing the path to the key, and the
   * value if it was present.
   */
  search(key: K, markForCopy = false): SearchResult<V> {
    let remainder =
        MerklePatriciaTreeNode.bufferToNibbles(this.options.keyConverter!(key));
    let node: MerklePatriciaTreeNode<V>|null = this.rootNode;
    let next: NextNode<V>;
    const stack = [];

    // Traverse the tree, starting at the root.
    do {
      node.markForCopy = markForCopy;
      stack.push(node);
      next = node.next(remainder);
      remainder = next.remainingNibbles;
      if (remainder.length !== 0) {
        node = next.next;
      } else if (next.next !== null) {
        // Deal with leaf values when remainder is 0
        next.next.markForCopy = markForCopy;
        stack.push(next.next);
        node = next.next;
      }
    } while (remainder.length !== 0 && node != null);

    return {node, remainder, stack};
  }

  /**
   * Serialize a witness into RLP format.
   *
   * @param     witness   A witness returned from a get() operation on a Merkle
   * Patricia Tree
   *
   * @returns   An RLP serialized witness, with non-essential nodes removed.
   */
  rlpSerializeWitness(witness: Witness<V>): RlpWitness {
    const value = witness.value === null ?
        null :
        this.options.valueConverter!(witness.value);
    const proof: Buffer[] = [];
    for (const [idx, node] of witness.proof.entries()) {
      const rlp = node.getRlpNodeEncoding(
          this.options as {} as MerklePatriciaTreeOptions<{}, V>);
      if (rlp.length >= 32 || (idx === 0)) {
        proof.push(rlp);
      }
    }
    return {value, proof};
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
export function verifyWitness(root: Buffer, key: Buffer, witness: RlpWitness) {
  let targetHash: Buffer = root;
  let currentKey: number[] = originalNode.stringToNibbles(key);
  let cld;
  const exist = (witness.value === null) ? false : true;
  for (const [idx, serializedNode] of witness.proof.entries()) {
    const hash = hashAsBuffer(HashType.KECCAK256, serializedNode);
    if (Buffer.compare(hash, targetHash)) {
      throw new VerificationError(`Hash mismatch: expected ${
          targetHash.toString('hex')} got ${hash.toString('hex')}`);
    }
    const decodedNode = RlpDecode(serializedNode);
    if (decodedNode.length === 0) {
      if (!exist && !witness.value) {
        return;
      }
      throw new VerificationError(`Proof: Found an empty node in the witness`);
    }
    const node: OriginalTreeNode = new originalNode(decodedNode);
    if (node.type === 'branch') {
      if (currentKey.length === 0) {
        if (idx !== witness.proof.length - 1) {
          throw new VerificationError(
              `Proof length mismatch (branch): expected ${idx + 1} but got ${
                  witness.proof.length}`);
        }
        if (!exist && !node.value) {
          return;
        }
        if (!node.value.equals(witness.value!)) {
          throw new VerificationError(`Value mismatch: expected ${
              witness.value} but got ${node.value}`);
        }
        if (exist) {
          return;
        }
      }
      cld = node.raw[currentKey[0]];
      if (cld.length === 0 && !witness.value && !exist) {
        return;
      }
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
          if (!witness.value && !exist) {
            return;
          }
          throw new VerificationError(
              `Key length mismatch (embeddedNode): expected ${
                  matchingNibbleLength(
                      embeddedNode.key,
                      currentKey)} but got ${embeddedNode.key.length}`);
        }
        const lastNibble = currentKey[1];
        currentKey = currentKey.slice(embeddedNode.key.length);
        // still have portions of key remaining, and embedded node is not a
        // branch
        if (currentKey.length !== 0 && !Array.isArray(embeddedNode.value)) {
          if (!witness.value && !exist) {
            return;
          }
          throw new VerificationError(
              `Key does not match the proof (embeddedNode)`);
        }
        // embedded node IS a branch
        if (Array.isArray(embeddedNode.value)) {
          // if part of the key is remaining, follow the branch
          if (currentKey.length !== 0) {
            const embeddedBranchLeaf =
                new originalNode(embeddedNode.raw[1][lastNibble]);
            currentKey = currentKey.slice(embeddedBranchLeaf.key.length + 1);
            if (currentKey.length !== 0) {
              if (!witness.value && !exist) {
                return;
              }
              throw new VerificationError(
                  `Key does not match the proof (branch-embedded node)`);
            }
            if (!exist && !embeddedBranchLeaf.value) {
              return;
            }
            if (!embeddedBranchLeaf.value.equals(witness.value)) {
              throw new VerificationError(`Value mismatch: expected ${
                  witness.value} but got ${embeddedBranchLeaf.value}`);
            }
          }
          // value is in branch value
          else if (!exist && !embeddedNode.value[16]) {
            return;
          } else if (!embeddedNode.value[16].equals(witness.value)) {
            throw new VerificationError(`Value mismatch: expected ${
                witness.value} but got ${embeddedNode.value[17]}`);
          }
        } else if (!exist && !embeddedNode.value) {
          return;
        } else if (!embeddedNode.value.equals(witness.value!)) {
          throw new VerificationError(`Value mismatch: expected ${
              witness.value} but got ${embeddedNode.value}`);
        }
        if (exist) {
          return;
        }
      } else {
        targetHash = cld as Buffer;
      }
    } else if ((node.type === 'extention') || (node.type === 'leaf')) {
      if (matchingNibbleLength(node.key, currentKey) !== node.key.length) {
        if (!witness.value && !exist) {
          return;
        }
        throw new VerificationError(`Key does not match the proof ${
            node.type}: expected ${node.key}, but got ${currentKey}`);
      }
      cld = node.value as (Buffer | Buffer[][]);
      currentKey = currentKey.slice(node.key.length);

      if (currentKey.length === 0 && node.type !== 'extention' ||
          (cld.length === 17 && currentKey.length === 1)) {
        if (idx + 1 !== witness.proof.length) {
          throw new VerificationError(
              `Proof length mismatch (${node.type}): expected ${idx + 1} nodes 
              but got ${witness.proof.length} nodes in proof`);
        }
        if (cld.length === 17) {
          cld = (cld[currentKey[0]] as Buffer[])[1];
          currentKey = currentKey.slice(1);
        }
        if (!exist && !cld) {
          return;
        }
        if (!(cld as Buffer).equals(witness.value!)) {
          throw new VerificationError(
              `Value mismatch: expected ${witness.value} but got ${cld}`);
        }
        if (exist) {
          return;
        }
      } else {
        targetHash = cld as Buffer;
      }
    } else {
      throw new VerificationError(`Unexpected node type ${node.type}`);
    }
  }
  throw new VerificationError(`Unexpected end of proof`);
}

/**
 * Verifies a witness against a staleRoot, constructs newest witness from the
 * recentState and verifies it
 * @param staleRoot   stale root
 * @param key         key being read
 * @param witness     witness against a stale root
 * @param recentState Merkle Patricia Tree horizontally caches nodes to some
 * depth and vertically caches most recent keys
 */
export function verifyStaleWitness(
    staleRoot: Buffer, key: Buffer, witness: RlpWitness,
    recentState: CachedMerklePatriciaTree<Buffer, Buffer>) {
  // Verify if the witness is valid against the stale root
  verifyWitness(staleRoot, key, witness);
  // If the stale root and recent root match, return the witness
  if (staleRoot.compare(recentState.root) === 0) {
    return witness;
  }
  // Check if nodes match at any feasible depth (search happens till available
  // maxCacheDepth)
  const recentWitness: Witness<Buffer> = {proof: [], value: null};
  const result: SearchResult = recentState.search(key);
  // If the key was vertically cached in the recentState; search will find the
  // path along the key
  if (result.remainder.length === 0 && result.node !== null) {
    if (result.node.value!.compare(witness.value!) !== 0) {
      throw new Error('key has been updated, witness cannot be used');
    }
    return;
  }
  // If it was not vertically cached, then the key wasn't changed so the node
  // hashes should match at some depth
  recentWitness.proof = [];
  recentWitness.value = witness.value;
  const oldNodeHashes: Array<bigint> = [];
  for (const serializedOldNode of witness.proof) {
    oldNodeHashes.push(hashAsBigInt(HashType.KECCAK256, serializedOldNode));
  }
  for (const [idx, witNode] of result.stack.entries()) {
    let recentHash: bigint;
    recentWitness.proof.push(witNode);
    recentHash = witNode.hash({} as MerklePatriciaTreeOptions<{}, Buffer>);
    for (let j = 0; j < oldNodeHashes.length; j++) {
      if (recentHash === oldNodeHashes[j]) {
        const curWit = recentState.rlpSerializeWitness(recentWitness);
        for (j = j + 1; j < oldNodeHashes.length; j++) {
          curWit.proof.push(witness.proof[j]);
        }
        verifyWitness(recentState.root, key, curWit);
        return;
      }
    }
  }
  throw new VerificationError('stale witness verification failed');
}

export class CachedMerklePatriciaTree<K, V> extends MerklePatriciaTree<K, V> {
  // Maximum depth of the cached MerklePatriciaTree with rootNode is at a
  // depth 1.
  private maxCacheDepth: number;

  constructor(depth = 6,
      options: MerklePatriciaTreeOptions<K, V> = {putCanDelete: true}) {
    super(options);
    // Set the default maxCacheDepth to 6
    this.maxCacheDepth = depth;
  }

  /** Returns the maxCacheDepth */
  getmaxCacheDepth(): number {
    return this.maxCacheDepth;
  }

  /**
   * Recursively prunes the cachedStateTree to maxCacheDepth by adding HashNodes
   * @param currNode current node at a depth, starting from rootNode at depth =
   * 1
   * @param depth Ranges from 1 to maxCacheDepth
   */
  pruneStateCache(
      currNode: MerklePatriciaTreeNode<V> = this.rootNode, depth = 1) {
    while (depth < this.maxCacheDepth) {
      if (currNode instanceof LeafNode || currNode instanceof HashNode ||
          currNode instanceof NullNode) {
        return;
      }
      if (currNode instanceof BranchNode) {
        for (const branch of currNode.branches) {
          if (branch !== undefined) {
            this.pruneStateCache(branch, depth + 1);
          }
        }
        return;
      } else if (currNode instanceof ExtensionNode) {
        this.pruneStateCache(currNode.nextNode, depth + 1);
        return;
      }
      depth += 1;
    }
    if (currNode instanceof BranchNode) {
      for (const [idx, branch] of currNode.branches.entries()) {
        if (branch instanceof LeafNode || branch instanceof HashNode ||
            branch === undefined) {
          continue;
        }
        const nodeHash = branch.hash(
            this.options as {} as MerklePatriciaTreeOptions<{}, Buffer>);
        currNode.branches[idx] = new HashNode(
            nodeHash,
            branch.getRlpNodeEncoding(
                this.options as {} as MerklePatriciaTreeOptions<{}, Buffer>));
      }
    } else if (currNode instanceof ExtensionNode) {
      if (currNode.nextNode instanceof LeafNode ||
          currNode instanceof HashNode) {
        return;
      }
      const nodeHash = currNode.nextNode.hash(
          this.options as {} as MerklePatriciaTreeOptions<{}, Buffer>);
      currNode.nextNode = new HashNode(
          nodeHash,
          currNode.nextNode.getRlpNodeEncoding(
              this.options as {} as MerklePatriciaTreeOptions<{}, Buffer>));
    }
    return;
  }

  /**
   * _getRecursive searches the nodeBag and the CachedMerklePatriciaTree
   * recursively for the value corresponding to the key
   * @param key : key to be searched for
   * @param nodeMap : A Bag of nodes, with each node indexed with the nodeHash
   * @param node : node from the Tree or the nodeMap to start the search from
   *
   * @returns value: value corresponding to the code;
   * throws an exception if key is not found in the cache and nodeMap
   */
  private _getRecursive(
      key: number[], nodeMap: Map<bigint, MerklePatriciaTreeNode<V>>,
      node: MerklePatriciaTreeNode<V>): V|null {
    if (node instanceof BranchNode) {
      // If key ends at a BranchNode; return the BranchNode value
      const nib = key.shift();
      if (!nib) {
        return node.value;
      }
      // Search down the appropriate branch of the BranchNode
      const ret = this._getRecursive(key, nodeMap, node.branches[nib]);
      return ret;

    } else if (node instanceof ExtensionNode) {
      // Key nibbles should match the nibbles at ExtensionNode
      if (matchingNibbleLength(node.nibbles, key) !== node.nibbles.length) {
        throw new Error('Key Mismatch at ExtensionNode');
      }
      // Remove the matchingNibbles from the key
      key.splice(0, node.nibbles.length);
      // Search down the nextNode of the ExtensionNode
      const ret = this._getRecursive(key, nodeMap, node.nextNode);
      return ret;

    } else if (node instanceof LeafNode) {
      // Key Nibbles should match at the LeafNode
      if (matchingNibbleLength(node.nibbles, key) !== node.nibbles.length) {
        throw new Error('Key Mismatch at LeafNode');
      }
      // Return the value at LeafNode
      return node.value;

    } else if (node instanceof HashNode) {
      // Read the nodeHash of the HashNode
      const hash = node.nodeHash;
      // Get the MerkleNode corresponding to nodeHash from nodeMap
      const mappedNode = nodeMap.get(hash);
      if (!mappedNode) {
        throw new Error('nodeMap too stale');
      }
      // Search down the mappedNode
      const ret = this._getRecursive(key, nodeMap, mappedNode);
      return ret;

    } else if (NullNode) {
      // Error if we hit a nullNode
      throw new Error('Unexpected NullNode');
    } else {
      // Error if unknown node type
      throw new Error('Unexpected node type');
    }
  }

  /**
   * getFromCache returns the value corresponding to the key using nodeMap
   * @param key : key to get from the CachedMerklePatriciaTree
   * @param nodeMap : Bag of recent MerklePatriciaTree nodes from the client
   *
   * @returns value corresponding to the key if present; null if otherwise
   */
  getFromCache(key: K, nodeMap: Map<bigint, MerklePatriciaTreeNode<V>>): V
      |null {
    const convKey = this.options.keyConverter!(key);
    const keyNibbles = MerklePatriciaTreeNode.bufferToNibbles(convKey);
    let ret;
    try {
      // getRecursiveKey throws an exception if key is not searchable
      // in the cache and the nodeBag
      ret = this._getRecursive(keyNibbles, nodeMap, this.rootNode);
    } catch (e) {
      return null;
    }
    return ret;
  }

  /**
   * Given the rlpEncoded serialization of the node and a valueConverter
   * function, rlpToMerkleNode returns the decoded MerklePatriciaTreeNode<V>
   * @param raw : rlpEncoded serialized MerklePatriciaNode<V>
   * @param valueConverter : Converts a Buffer value into type V
   *
   * @returns MerkleNode : Decoded MerklePatriciaNode<V>
   */
  rlpToMerkleNode(raw: Buffer, valueConverter: (val: Buffer) => V):
      MerklePatriciaTreeNode<V> {
    const hash = RlpDecode(raw) as RlpList;
    if (hash.length === 0) {
      // NullNode
      const ret = new NullNode<V>();
      return ret;
    } else if (hash.length === 2) {
      // LeafNode or ExtensionNode
      const decodeHash = MerklePatriciaTreeNode.fromBuffer(hash[0] as Buffer);
      if (decodeHash.prefix === 2 || decodeHash.prefix === 3) {
        // LeafNode
        const val = hash[1];
        const ret = new LeafNode<V>(
            decodeHash.nibbles, valueConverter(hash[1] as Buffer));
        return ret;
      } else if (decodeHash.prefix === 0 || decodeHash.prefix === 1) {
        // ExtensionNode
        if (hash[1] instanceof Buffer && hash[1].length === 32) {
          // Hash is serialized; create HashNode
          const next = new HashNode<V>(toBigIntBE(hash[1] as Buffer));
          const ret = new ExtensionNode<V>(decodeHash.nibbles, next);
          return ret;
        } else {
          // Node is serialized; recursively decode the node
          const rlp = RlpEncode(hash[1]);
          const next = this.rlpToMerkleNode(rlp, valueConverter);
          const ret = new ExtensionNode<V>(decodeHash.nibbles, next);
          return ret;
        }
      } else {
        throw new Error('Invalid prefix: ' + decodeHash.prefix.toString);
      }
    } else if (hash.length === 17) {
      // BranchNode
      const ret = new BranchNode<V>();
      ret.value = valueConverter(hash[16] as Buffer);
      if (hash[16].length === 0) {
        ret.value = null;
      }
      for (let bIndex = 0; bIndex < 16; bIndex++) {
        const branch = hash[bIndex];
        if (!branch.length) {
          continue;
        }
        if (branch instanceof Buffer && branch.length === 32) {
          // Hash is serialized; create HashNode
          ret.branches[bIndex] = new HashNode<V>(toBigIntBE(branch));
        } else {
          // Node is serialized; recursively decode the node
          ret.branches[bIndex] =
              this.rlpToMerkleNode(RlpEncode(branch), valueConverter);
        }
      }
      return ret;
    } else {
      throw new Error('Unable to decode node from rlp');
    }
  }

  verifyAndAddWitness(root: Buffer, key: K, witness: Witness<V>) {
    // Verify witness
    const convKey = this.options.keyConverter!(key);
    verifyWitness(root, convKey, this.rlpSerializeWitness(witness));
    // Add witness into the cache
    if (this.rootNode instanceof NullNode) {
      // Null node, so insert this value as a leaf.
      this.rootNode = new LeafNode(
          MerklePatriciaTreeNode.bufferToNibbles(convKey), witness.value);
      return;
    } else {
      // search for the key in the cache
      const result = this.search(key);
      if (result.remainder.length === 0 && result.node !== null) {
        // Search matches; update the value in the path
        result.node!.value = witness.value;
      } else if (result.stack[result.stack.length - 1] instanceof HashNode) {
        // Partial path ending with a HashNode; replace the HashNode (search
        // stack depth >= 6)
        const currNode = result.stack[result.stack.length - 2];
        if (currNode instanceof BranchNode) {
          currNode.branches[result.remainder[0]] =
              witness.proof[result.stack.length - 1];
        } else if (currNode instanceof ExtensionNode) {
          currNode.nextNode = witness.proof[result.stack.length];
        }
      } else {
        // Tree path for the key has depth < 6; perform insertion
        this.insert(result.stack, result.remainder, witness.value!);
      }
      // Clear all memoized hashes in the path, they will be reset.
      for (const node of result.stack) {
        node.clearMemoizedHash();
      }
    }
  }
}
