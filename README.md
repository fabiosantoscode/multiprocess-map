# multiprocess-map

[![Build Status](https://travis-ci.org/fabiosantoscode/multiprocess-map.svg?branch=master)](https://travis-ci.org/fabiosantoscode/multiprocess-map) [![Coverage Status](https://coveralls.io/repos/github/fabiosantoscode/multiprocess-map/badge.svg?branch=master)](https://coveralls.io/github/fabiosantoscode/multiprocess-map?branch=master)

Runs a map function on a set of values. The function will run on as many processors your machine has, or on `max` processes.

## async map(values, fn[, max = os.cpus().length])

Returns a promise for the mapped array.

