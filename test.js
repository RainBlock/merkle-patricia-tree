mpt = require('./build/src/index');
const tree = new mpt.CachedMerklePatriciaTree();
const rawNull = tree.rootNode.getRlpNodeEncoding(tree.options);
console.log("rawNull : ", rawNull);
tree.rlpToMerkleNode(rawNull, (val) => val);
let val = tree.getFromCache(Buffer.from("abcd"), new Map());
console.log(val);

tree.put(Buffer.from("abcd"), Buffer.from("abcd"));
val = tree.getFromCache(Buffer.from("abcd"), new Map());
console.log(val);

const rawLeaf = tree.rootNode.getRlpNodeEncoding(tree.options);
console.log("rawLeaf : ", rawLeaf);
tree.rlpToMerkleNode(rawLeaf, (val) => val);


tree.put(Buffer.from("abcx"), Buffer.from("abcx"));
const rawExtn = tree.rootNode.getRlpNodeEncoding(tree.options);
console.log("rawExtn : ", rawExtn);
tree.rlpToMerkleNode(rawExtn, (val) => val);


val = tree.getFromCache(Buffer.from("abcd"), new Map());
console.log(val);
val = tree.getFromCache(Buffer.from("abcx"), new Map());
console.log(val);

tree.put(Buffer.from("xxxx"), Buffer.from("xxxx"));
val = tree.getFromCache(Buffer.from("xxxx"), new Map());
console.log(val);
