'use strict'

require('babel-polyfill')
const os = require('os')
const { spawn, fork } = require('child_process')
const semver = require('semver')
const createFile = require('create-temp-file')()
const genericPool = require('./vendor/generic-pool')

const multiprocessMap = async (values, fn, max = os.cpus().length) => {
  const pool = genericPool.createPool({
    async create () {
      const file = createFile()
      file.write(
        'process.on("message", function (value) {\n' +
        '  Promise.resolve((' + fn + ')(value[0], value[1], value[2])).then(function (retVal) {\n' +
        '    process.send(JSON.stringify(retVal))\n' +
        '  })\n' +
        '})\n' +
        'process.send(null)'
      )
      file.end()
      const runner = file.path
      const cp = semver.satisfies(process.version, '>=10')
        ? fork(runner, [], { stdio: ['ipc'] })
        : spawn('node', [runner], { stdio: ['pipe', 'pipe', 'ipc'] })

      await new Promise(resolve => {
        cp.once('message', resolve)
      })

      try { file.cleanupSync() } catch (_) {}

      return cp
    },
    destroy (cp) {
      cp.disconnect()
    }
  }, {
    max
  })

  const ret = await Promise.all(values.map(async (value, index, all) => {
    const cp = await pool.acquire()
    setImmediate(() => {
      cp.send([value, index, all])
    })

    const retVal = JSON.parse(await new Promise(resolve => {
      cp.once('message', resolve)
    }))

    pool.release(cp)

    return retVal
  }))

  await pool.drain()
  pool.clear()

  return ret
}

module.exports = multiprocessMap
