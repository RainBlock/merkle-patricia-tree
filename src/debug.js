const rlp_stream_1 = require("rlp-stream");
const ethUtil = require('ethereumjs-util');
const index_1 = require("../build/src/index");
const genesisJson = require('../test/genesis.json');
const assert = require('assert')

function ethereumAccountToRlp(account) {
    let hexBalance = BigInt(`${account.balance}`).toString(16);
    if (hexBalance === '0') {
        hexBalance = '';
    }
    else if (hexBalance.length % 2 === 1) {
        hexBalance = `0${hexBalance}`;
    }
    return rlp_stream_1.RlpEncode([
        account.nonce, Buffer.from(hexBalance, 'hex'),
        Buffer.from('56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421', 'hex'),
        Buffer.from('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', 'hex')
    ]);
}

console.log("Generate the full genesis tree from the state dump");
const tree = new index_1.MerklePatriciaTree();
const tree_1 = new index_1.MerklePatriciaTree();
tree.needsCOW = true;
tree_1.needsCOW = false;

let i = 0;
console.log(Object.entries(genesisJson.accounts).length)
for (const [id, account] of Object.entries(genesisJson.accounts)) {
  const hash = ethUtil.sha3(Buffer.from(id, 'hex'));
    if (Buffer.compare(tree.root, tree_1.root) !== 0 ){
        console.log(i)
        console.log(tree.root)
        console.log(tree_1.root)
        console.log(tree.root.compare(tree_1.root))
        break;
    }
    if (i == 3671) {
        console.log("Here", i)
        console.log("Inserting ", hash)
        console.log("Value:", ethereumAccountToRlp(account))
        // console.log("HASH: ", hash)
        // console.log(tree.root)
        // console.log(tree_1.root)
        // console.log("--------------------------------")
        // console.log(tree.rootNode)
        // console.log(tree_1.rootNode)
        // console.log("---------------------------------")
        console.log(tree_1.get(hash).value)
        console.log("---------------------------------")
        console.log(tree.get(hash).value)
        i += 1;

        console.log(id)
        console.log(tree.search(hash).stack)
        console.log(tree.search(hash).stack)
        console.log("############################################")


        tree.put(hash, ethereumAccountToRlp(account));
        tree_1.put(hash, ethereumAccountToRlp(account));
        console.log("############################################")
        console.log(tree.get(hash).value)
        console.log("---------------------------------")
        console.log(tree.get(hash).value)
        console.log("############################################")
        console.log(tree.root)
        console.log("---------------------------------")
        console.log(tree_1.root)
        console.log("############################################")
        
        console.log(tree.rootNode.branches[14].branches[2].branches[1].nextNode.hash())
        console.log(tree_1.rootNode.branches[14].branches[2].branches[1].nextNode.hash())

        console.log(tree.search(id).stack)
        console.log(tree.search(id).stack)

        console.log(tree.rootNode.branches[14].branches[2].branches[1].nextNode)
        console.log(tree_1.rootNode.branches[14].branches[2].branches[1].nextNode)

        console.log(tree.rootNode.branches[14].branches[2].branches[1].nibbles)
        console.log(tree_1.rootNode.branches[14].branches[2].branches[1].nibbles)

        // continue;
        break;
    }
    tree.put(hash, ethereumAccountToRlp(account));
    tree_1.put(hash, ethereumAccountToRlp(account));
    i += 1;
}
