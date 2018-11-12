# multiprocess-map

[![Build Status](https://travis-ci.org/fabiosantoscode/multiprocess-map.svg?branch=master)](https://travis-ci.org/fabiosantoscode/multiprocess-map) [![Coverage Status](https://coveralls.io/repos/github/fabiosantoscode/multiprocess-map/badge.svg?branch=master)](https://coveralls.io/github/fabiosantoscode/multiprocess-map?branch=master)

Runs a map function on a set of values. The function will run on as many processors your machine has, or on `max` processes.

Works in the browser, using web workers instead of node forks.

## async map(values, fn[,{ max = os.cpus().length, processStdout:(cpStdout) => stdoutModified}])

Returns a promise for the mapped array.

Use `processStdout` option to process the stdout before multiprocess-map prints it to the console. Do this if the stdout is too verbose, for example.

```javascript
const map = require('multiprocess-map')  // Works with node 0.10 -> 10

async function main() {
  await map([1, 2], async value => await foo(value))
}
```

