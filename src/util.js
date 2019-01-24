const async = require('async')

module.exports = {
  matchingNibbleLength: matchingNibbleLength,
  callTogether: callTogether,
  asyncFirstSeries: asyncFirstSeries,
  doKeysMatch: doKeysMatch,
  nibblesToBuffer: nibblesToBuffer,
  stringToNibbles: stringToNibbles,
}
/**
 * Converts a string OR a buffer to a nibble array.
 * @method stringToNibbles
 * @param {Buffer| String} key
 * @private
 */
function stringToNibbles (key) {
  const bkey = new Buffer(key)
  let nibbles = []

  for (let i = 0; i < bkey.length; i++) {
    let q = i * 2
    nibbles[q] = bkey[i] >> 4
    ++q
    nibbles[q] = bkey[i] % 16
  }

  return nibbles
}

/**
 * Converts a nibble array into a buffer.
 * @method nibblesToBuffer
 * @param {Array} Nibble array
 * @private
 */
function nibblesToBuffer (arr) {
  let buf = new Buffer(arr.length / 2)
  for (let i = 0; i < buf.length; i++) {
    let q = i * 2
    buf[i] = (arr[q] << 4) + arr[++q]
  }
  return buf
}

/**
 * Returns the number of in order matching nibbles of two give nibble arrays.
 * @method matchingNibbleLength
 * @param {Array} nib1
 * @param {Array} nib2
 * @private
 */
function matchingNibbleLength (nib1, nib2) {
  let i = 0
  while (nib1[i] === nib2[i] && nib1.length > i) {
    i++
  }
  return i
}

/**
 * Compare two nibble array keys.
 * @param {Array} keyA
 * @param {Array} keyB
 */
function doKeysMatch (keyA, keyB) {
  const length = matchingNibbleLength(keyA, keyB)
  return length === keyA.length && length === keyB.length
}

/**
 * Take two or more functions and returns a function  that will execute all of
 * the given functions
 */
function callTogether () {
  var funcs = arguments
  var length = funcs.length
  var index = length

  if (!length) {
    return function () {}
  }

  return function () {
    length = index

    while (length--) {
      var fn = funcs[length]
      if (typeof fn === 'function') {
        var result = funcs[length].apply(this, arguments)
      }
    }
    return result
  }
}

/**
 * Take a collection of async fns, call the cb on the first to return a truthy value.
 * If all run without a truthy result, return undefined
 */
function asyncFirstSeries (array, iterator, cb) {
  var didComplete = false
  async.eachSeries(array, function (item, next) {
    if (didComplete) return next
    iterator(item, function (err, result) {
      if (result) {
        didComplete = true
        process.nextTick(cb.bind(null, null, result))
      }
      next(err)
    })
  }, function () {
    if (!didComplete) {
      cb()
    }
  })
}