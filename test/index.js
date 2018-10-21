'use strict'

var assert = require('assert').strict || require('assert')
var Mocha = require('mocha')
var map = require('..')

Mocha.describe('multiprocess-map', function () {
  this.timeout(10 * 1000)
  Mocha.it('orders stdout properly', function () {
    return map([3000, 2000, 1000], function (ms, i) {
      return new (require('es6-promise'))(function (resolve) {
        setTimeout(function () {
          console.log(i)
          resolve()
        }, ms)
      })
    })
  })
  Mocha.it('runs sync map functions', function () {
    return map([1, 2, 3], function (n) {
      console.log(n * 2)
      return n * 2
    }).then(function (values) {
      assert.deepEqual(values, [2, 4, 6])
    })
  })
})
