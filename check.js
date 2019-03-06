mpt = require('./build/src/index')

tree = new mpt.MerklePatriciaTree()
ctree = new mpt.CachedMerklePatriciaTree()

tree.put(Buffer.from("abc"), Buffer.from("abc"))

ctree.put(Buffer.from("abc"), Buffer.from("abc"))
ctree.put(Buffer.from("abx"), Buffer.from("abx"))
ctree.put(Buffer.from("aaa"), Buffer.from("aaa"))
ctree.put(Buffer.from("abn"), Buffer.from("aaa"))
ctree.put(Buffer.from("ab3"), Buffer.from("aaa"))

oldWit = tree.get(Buffer.from("abc"))
oldWitRlp = tree.rlpSerializeWitness(oldWit);
mpt.verifyStaleWitness(tree.root, Buffer.from("abc"), oldWitRlp, ctree)

vtree = new mpt.CachedMerklePatriciaTree()
vtree.verifyAndAddWitness(tree.root, Buffer.from("abc"), oldWit);

ne = tree.rlpSerializeWitness(tree.get(Buffer.from("abx")));
mpt.verifyWitness(tree.root, Buffer.from("abx"), ne, false);

ne = tree.rlpSerializeWitness(tree.get(Buffer.from("bax")));
mpt.verifyWitness(tree.root, Buffer.from("bax"), ne, false);

ne = tree.rlpSerializeWitness(tree.get(Buffer.from("bx2")));
mpt.verifyWitness(tree.root, Buffer.from("bx2"), ne, false);

try {
  ne = tree.rlpSerializeWitness(tree.get(Buffer.from("abc")));
  mpt.verifyWitness(tree.root, Buffer.from("abc"), ne, false);
} catch (e) {
  if (!e) {
    throw new Error("Expected Error");
  }
}

ne = tree.rlpSerializeWitness(tree.get(Buffer.from("abc")));
mpt.verifyWitness(tree.root, Buffer.from("abc"), ne, true);

ne = tree.rlpSerializeWitness(tree.get(Buffer.from("anc")));
mpt.verifyWitness(tree.root, Buffer.from("anc"), ne, false);

tree = new mpt.MerklePatriciaTree()
tree.put(Buffer.from("011111", 'hex'), Buffer.from("011111", 'hex'));
tree.put(Buffer.from("111111", 'hex'), Buffer.from("011111", 'hex'));
ne = tree.rlpSerializeWitness(tree.get(Buffer.from("311111", 'hex')));
mpt.verifyWitness(tree.root, Buffer.from("311111", 'hex'), ne, false)