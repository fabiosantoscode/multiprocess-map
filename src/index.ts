const os = require('os')
const Pool = require('compatible-pool')
const { async: asyncWorker } = require('parallel-worker')
const Promise = require('es6-promise')

type ProcessStdoutFn = (s: string) => string
type MapFn = (item: any, index: number, all: any[]) => any

const defaultMax = os.cpus().length
const multiprocessMap = async (values: any[], fn: MapFn, {
  max = defaultMax,
  processStdout = (x: string) => x
}: {
  max: number,
  processStdout: ProcessStdoutFn
} = { max: defaultMax, processStdout: (x: string) => x }): Promise<any[]> => {
  const func = `
    function (onMessage, send) {
      onMessage(function (msg) {
        let value
        try {
          // tslint:disable:no-eval
          value = (${fn.toString()})(msg[0], msg[1], msg[2])
        } catch (error) {
          send({ error })
          return
        }

        if (value.then) {
          value.then(function (value) {
            send({ value })
          }, function (error) {
            send({ error })
          })
        } else {
          send({ value })
        }
      })
    }
  `
  const pool = new Pool({
    max,
    create: () => asyncWorker(func),
    destroy (w: any) { w.stop() }
  })

  let called = 0
  const enqueued: Array<() => void> = []
  const isLatest = (idx: number) => idx === called
  const enqueue = (idx: number, fn: () => void) => {
    enqueued[idx] = fn

    while (enqueued[called]) {
      enqueued[called]()
      called++
    }
  }

  values = await Promise.all(values.map(
    async (val: any, index: number, all: any) => {
      const cp = await pool.acquire()
      cp.send([val, index, all])

      let stdout = ''
      let isFirstLatestCall = true
      const onStdout = (data: string) => {
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

      const { value, error } = await new Promise(resolve => {
        cp.once('message', resolve)
      })

      if (error) { throw error }

      cp.removeListener('stdout', onStdout)

      enqueue(index, () => {
        if (stdout) { process.stdout.write(processStdout(stdout)) }
      })

      pool.release(cp)

      return value
    }
  ))
  pool.clear()
  return values
}

module.exports = multiprocessMap
