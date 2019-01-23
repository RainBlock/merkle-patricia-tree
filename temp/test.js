const  Mtree = require("../build/src/index");
const block_state = require("./state_1M.json");
const RLP = require('rlp')
const assert = require('assert')
const Account = require('ethereumjs-account').default
let bsJSON = JSON.parse(JSON.stringify(block_state));
const mtree  = new Mtree.CachedMerklePatriciaTree();

function parseHexString(str) { 
    var result = [];
    // Ignore any trailing single digit; I don't know what your needs
    // are for this case, so you may want to throw an error or convert
    // the lone digit depending on your needs.
    while (str.length >= 2) { 
        result.push(parseInt(str.substring(0, 2), 16));
        str = str.substring(2, str.length);
    }
    return result;
}

var i = 0;
for (var key in bsJSON.accounts) {
    if (bsJSON.accounts.hasOwnProperty(key)) {
        var val = bsJSON.accounts[key];
        var raw = ["0x".concat(val.nonce), "0x".concat(val.balance), "0x".concat(val.root), "0x".concat(val.codeHash)];
        var account = new Account(raw)
        mtree.put(Buffer.from(parseHexString(key)), account.serialize());
        retVal = mtree.get(Buffer.from(parseHexString(key)));
        assert.deepEqual(retVal.value, account.serialize());
        i++;
    }
}
console.log(mtree.root, i)
console.log(bsJSON.root)

const vtree = new Mtree.CachedMerklePatriciaTree();
i = 0;
for (var key in bsJSON.accounts) {
    if (bsJSON.accounts.hasOwnProperty(key)) {
        vtree.verifyAndAddWitness(mtree.root, Buffer.from(parseHexString(key)), mtree.get(Buffer.from(parseHexString(key))))
        vtree.pruneStateCache()
    }
}
vtree.pruneStateCache()
console.log(vtree.root)
