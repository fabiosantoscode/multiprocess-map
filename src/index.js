'use strict'

if (!global._babelPolyfill) require('babel-polyfill')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { spawn, fork } = require('child_process')
const semver = require('semver')
const Promise = require('es6-promise')
const circularJson = require('circular-json')
const genericPool = require('./vendor/generic-pool')

const createFile = (contents) => {
  const filePath = path.join(__dirname, 'tmp', Math.random() + '.js')
  fs.writeFileSync(filePath, contents)
  return {
    path: filePath,
    clean: () => {
      fs.unlinkSync(filePath)
    }
  }
}

const multiprocessMap = async (values, fn, { max = os.cpus().length, processStdout = x => x } = {}) => {
  const istanbulVariableMatch = fn.toString().match(/\{(cov_.*?)[[.]/)
  const contents =
    'var circularJson = require("circular-json")\n' +
    'var ' + (istanbulVariableMatch ? istanbulVariableMatch[1] : '_cov$$') + ' = {s: [], f: [], b: [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]}\n' +
    'process.on("message", function (msg) {\n' +
    '  msg = circularJson.parse(msg)\n' +
    '  require("es6-promise").resolve((' + fn + ')(msg[0], msg[1], msg[2])).then(function (retVal) {\n' +
    '     process.send(circularJson.stringify({value: retVal}))\n' +
    '  }, function (error) {\n' +
    '     process.send(circularJson.stringify({error: error}))\n' +
    '  })\n' +
    '})\n' +
    'process.send(null)'
  const nodeProcessFile = createFile(contents)
  const pool = genericPool.createPool({
    async create () {
      const cp = semver.satisfies(process.version, '^0.10.0')
        ? fork(nodeProcessFile.path, [], { stdio: ['pipe', 'pipe', 'inherit', 'ipc'] })
        : spawn('node', [nodeProcessFile.path], { stdio: ['pipe', 'pipe', 'inherit', 'ipc'] })

      await new Promise(resolve => {
        cp.once('message', resolve)
      })

      return cp
    },
    destroy (cp) {
      cp.disconnect()
    }
  }, {
    max
  })

  let called = 0
  const enqueued = []
  const enqueue = (idx, fn) => {
    enqueued[idx] = fn

    while (enqueued[called]) {
      enqueued[called]()
      called++
    }
  }
  const ret = await Promise.all(values.map(async (value, index, all) => {
    const cp = await pool.acquire()
    setImmediate(() => {
      cp.send(circularJson.stringify([value, index, all]))
    })

    let stdout = ''
    function onData (data) {
      stdout += data
    }

    cp.stdout.on('data', onData)

    const { value: val, error } = circularJson.parse(await new Promise(resolve => {
      cp.once('message', resolve)
    }))

    if (error) throw error

    cp.stdout.removeListener('data', onData)

    enqueue(index, () => {
      if (stdout) process.stdout.write(processStdout(stdout))
    })

    pool.release(cp)

    return val
  }))

  await pool.drain()
  pool.clear()

  setTimeout(() => { nodeProcessFile.clean() }, 1000)

  return ret
}

module.exports = multiprocessMap
