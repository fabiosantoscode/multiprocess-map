'use strict'

var assert = require('assert').strict || require('assert')
var map = require('..')

describe('multiprocess-map', function () {
  it('orders stdout properly', function () {
    this.timeout(10 * 1000)
    return map([3000, 2000, 1000], function (ms, i) {
      return new (require('es6-promise'))(function (resolve) {
        setTimeout(function () {
          console.log(i)
          resolve(i)
        }, ms)
      })
    }).then(function (values) {
      assert.deepEqual(values, [0, 1, 2])
    })
  })
  it('runs sync map functions', function () {
    return map([1, 2, 3], function (n) {
      console.log(n * 2)
      return n * 2
    }).then(function (values) {
      assert.deepEqual(values, [2, 4, 6])
    })
  })
  it('can process stdout', function () {
    return map([1, 2], function (value) {
      console.log(value)
      return value * 2
    }, {
      max: 1,
      processStdout: function (stdout) {
        return stdout.replace(/\n$/gm, '') + '0\n'
      }
    })
  })
})
