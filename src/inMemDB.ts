/**
 * This module implements an in memory database which stores a fixed
 * number of elements following first in first out (FIFO) principle.
 */

export interface MemoryDatabase<K, V> {
  get: (key: K) => V | null;
  set: (key: K, value: V) => void;
  has: (key: K) => boolean;
  delete: (key: K) => void;
  size: () => number;
  clear: () => void;
  keys: () => K[];
}

export class MemDB<K, V> implements MemoryDatabase<K, V> {
  private _keyDB: K[] = [];
  private _valueDB: V[] = [];
  private _maxSize = 50;

  constructor(maxSize?: number) {
    if (maxSize) {
      this._maxSize = maxSize;
      this._keyDB = [];
      this._valueDB = [];
    }
  }

  _ifExists(key: K): boolean {
    const findFunc = (element: K) => {
      if (element instanceof Buffer && key instanceof Buffer) {
        return element.compare(key) === 0;
      }
      return element === key;
    };
    const exists = this._keyDB.find(findFunc);
    return (exists !== undefined);
  }

  _compare(element: K, key: K): boolean {
    if (element instanceof Buffer && key instanceof Buffer) {
      return element.compare(key) === 0;
    }
    return element === key;
  }

  _setMaxSize(size: number) {
    if (!size) {
      throw new Error('Undefined maxSize');
    }
    this._maxSize = size;
  }

  get(key: K): V|null {
    for (let i = 0; i < this._keyDB.length; i++) {
      if (this._compare(this._keyDB[i], key)) {
        return this._valueDB[i];
      }
    }
    return null;
  }

  _deleteFirst() {
    this._keyDB.shift();
    this._valueDB.shift();
  }

  set(key: K, value: V) {
    if (this._keyDB.length === this._maxSize) {
      this._deleteFirst();
    }
    this._keyDB.push(key);
    this._valueDB.push(value);
  }

  has(key: K): boolean {
    for (let i = 0; i < this._keyDB.length; i++) {
      if (this._compare(this._keyDB[i], key)) {
        return true;
      }
    }
    return false;
  }

  delete(key: K) {
    const findFunc = (element: K) => {
      if (key instanceof Buffer && element instanceof Buffer) {
        return key.compare(element) === 0;
      }
      return key === element;
    };
    const index = this._keyDB.findIndex(findFunc);
    if (index < 0) {
      return;
    }
    this._keyDB.splice(index, 1);
    this._valueDB.splice(index, 1);
  }

  size(): number {
    if (this._keyDB.length !== this._valueDB.length) {
      throw new Error('Unequal elements in the keyDB and valueDB');
    }
    return this._keyDB.length;
  }

  clear() {
    this._keyDB = [];
    this._valueDB = [];
  }

  keys(): K[] {
    return this._keyDB;
  }

  values(): V[] {
    return this._valueDB;
  }
}