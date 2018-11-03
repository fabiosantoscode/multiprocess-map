'use strict'

const os = require('os')
const fs = require('fs')
const path = require('path')
const { spawn, fork } = require('child_process')
const semver = require('semver')
const circularJson = require('circular-json')
const withTempFile = require('with-temp-file')
const murmur = require('murmurhash')
const Pool = require('compatible-pool')

type ProcessStdoutFn = (s: string) => string

const wrap = (fn: MapFn) => {
  const fnStr = fn.toString()
  const istanbulVariableMatch = fnStr.match(/\{(cov_.*?)[[.]/)
  return (
    'var circularJson = require("circular-json")\n' +
    'var userAsyncFunction = require("user-async-function")\n' +
    'var ' + (istanbulVariableMatch ? istanbulVariableMatch[1] : '_cov$$') + ' = {s: [], f: [], b: [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]}\n' +
    'process.on("message", function (msg) {\n' +
    '  msg = circularJson.parse(msg)\n' +
    '  userAsyncFunction(' + fnStr + ', msg[0], msg[1], msg[2]).then(function (retVal) {\n' +
    '     process.send(circularJson.stringify({value: retVal}))\n' +
    '  }, function (error) {\n' +
    '     process.send(circularJson.stringify({error: error}))\n' +
    '  })\n' +
    '})\n' +
    'process.send(null)'
  )
}

type MapFn = (item: any, index: number, all: any[]) => any

const multiprocessMap = (values: any[], fn: MapFn, {
  max = os.cpus().length,
  processStdout = (x: string) => x
}: {
  max: number,
  processStdout: ProcessStdoutFn
} = { max: os.cpus().length, processStdout: (x: string) => x }) => {
  const contents = wrap(fn)
  const hash = murmur.v3(contents)
  const filename = path.join(__dirname, 'tmp', hash + '.js')
  const tempFileExists = fs.existsSync(filename)
  return (tempFileExists ? (fn: () => any) => fn() : withTempFile)(async (ws: NodeJS.WriteStream) => {
    if (ws) {
      ws.write(contents)

      ws.end()

      await new Promise(resolve => {
        function check () {
          if (fs.existsSync(filename)) {
            return resolve()
          }
          setTimeout(check, 50)
        }
        check()
      })
    }

    const pool = new Pool({
      max,
      async create () {
        const cp = semver.satisfies(process.version, '^0.10.0')
          ? fork(filename, [], { stdio: ['pipe', 'pipe', 'inherit', 'ipc'], maxBuffer: 1 })
          : spawn(process.argv[0], [filename], { stdio: ['pipe', 'pipe', 'inherit', 'ipc'], maxBuffer: 1 })

        await new Promise<null>(resolve => {
          cp.once('message', resolve)
        })

        return cp
      },
      destroy (cp: any) {
        cp.disconnect()
      }
    })

    let called = 0
    const enqueued: Array<() => any> = []
    const isLatest = (idx: number) => {
      return idx === called
    }
    const enqueue = (idx: number, fn: () => any) => {
      enqueued[idx] = fn

      while (enqueued[called]) {
        enqueued[called]()
        called++
      }
    }
    const ret = await Promise.all(values.map(async (value: any, index: number, all: any[]): Promise<any> => {
      const cp = await pool.acquire()
      setImmediate(() => {
        cp.send(circularJson.stringify([value, index, all]))
      })

      let stdout = ''
      let isFirstLatestCall = true
      function onData (data: any) {
        if (isLatest(index)) {
          if (isFirstLatestCall && stdout) {
            process.stdout.write(processStdout(stdout))
          }
          isFirstLatestCall = false
          process.stdout.write(processStdout(data.toString()))
        } else {
          stdout += data
        }
      }

      if (cp.stdout) cp.stdout.on('data', onData)

      const { value: val, error } = circularJson.parse(await new Promise(resolve => {
        cp.once('message', resolve)
      }))

      if (error) throw error

      if (cp.stdout) cp.stdout.removeListener('data', onData)

      enqueue(index, () => {
        if (stdout) process.stdout.write(processStdout(stdout))
      })

      pool.release(cp)

      return val
    }))

    pool.clear()

    return ret
  }, filename)
}

module.exports = multiprocessMap
