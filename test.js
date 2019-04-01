const mpt = require('./build/src/index');
const cache = new mpt.CachedMerklePatriciaTree(1, (key) => {return Buffer.from(key, 'hex');}, (val) => {return Buffer.from(val);}, putCanDelete = false);

cache.put("abc", "def");
console.log(cache.get("abc"));
console.log(cache.rootNode);