const os = require('os')
const fs = require('fs')
const path = require('path')
const Pool = require('compatible-pool')
const worker = require('parallel-worker')

type ProcessStdoutFn = (s: string) => string

type MapFn = (item: any, index: number, all: any[]) => any

const multiprocessMap = async (values: any[], fn: MapFn, {
  max = os.cpus().length,
  processStdout = (x: string) => x
}: {
  max: number,
  processStdout: ProcessStdoutFn
} = { max: os.cpus().length, processStdout: (x: string) => x }) => {
  const pool = new Pool({
    max,
    create: () => worker.async(`
      function processMap(onMessage, send) {
        onMessage(function (msg) {
          Promise.resolve().then(function () {
            return (${fn})(msg[0], msg[1], msg[2])
          }).then(function (ret) {
            send({ value: ret })
          }, function (error) {
            send({ error: error })
          })
        })
      }
    `),
    destroy (w: any) { w.stop() }
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
      cp.send([value, index, all])
    })

    let stdout = ''
    let isFirstLatestCall = true
    function onStdout (data: string) {
      if (isLatest(index)) {
        if (isFirstLatestCall && stdout) {
          process.stdout.write(processStdout(stdout))
        }
        isFirstLatestCall = false
        process.stdout.write(processStdout(data))
      } else {
        stdout += data
      }
    }

    cp.on('stdout', onStdout)

    const { value: val, error } = await new Promise(resolve => {
      cp.once('message', resolve)
    }) as any

    if (error) throw error

    cp.removeListener('stdout', onStdout)

    enqueue(index, () => {
      if (stdout) process.stdout.write(processStdout(stdout))
    })

    pool.release(cp)

    return val
  }))

  pool.clear()

  return ret
}

module.exports = multiprocessMap
