const Readable = require('readable-stream').Readable;

export class ReadStream extends Readable {
  constructor() {
    super({objectMode: true});
    this.next = null;
  }

  _read() {
    if (!this._started) {
      this.started = true;
      this.trie.findValueNodes(this, this.trie.rootNode, []);
      this.push(null);
    }
  }
}