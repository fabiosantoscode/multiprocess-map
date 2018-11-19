const os = require('os')
const Pool = require('compatible-pool')
const worker = require('parallel-worker')

type ProcessStdoutFn = (s: string) => string

type MapFn = (item: any, index: number, all: any[]) => any

const defaultMax = os.cpus().length
const multiprocessMap = async (values: any[], fn: MapFn, {
  max = defaultMax,
  processStdout = (x: string) => x
}: {
  max: number,
  processStdout: ProcessStdoutFn
} = { max: defaultMax, processStdout: (x: string) => x }) => {
  const func = (onMessage, send) => {
    onMessage(function (msg) {
      let value
      try {
        // tslint:disable:no-eval
        value = eval(`(${msg[3]})`)(msg[0], msg[1], msg[2])
      } catch (e) {
        send({ error: e })
        return
      }

      if (value.then) {
        value.then(function (value) {
          send({ value })
        }, function (error) {
          send({ error: error })
        })
      } else {
        send({ value })
      }
    })
  }
  const pool = new Pool({
    max,
    create: () => worker.async(func),
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

  const ret = await Promise.all(values.map(async (value: any, index: number, all: any) =>
    new Promise((resolve, reject) => {
      pool.acquire().then(cp => {
        cp.send([value, index, all, fn.toString()])

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

        return new Promise(resolve => {
          cp.once('message', resolve)
        }).then(({ value, error }) => {
          if (error) { throw error }

          cp.removeListener('stdout', onStdout)

          enqueue(index, () => {
            if (stdout) { process.stdout.write(processStdout(stdout)) }
          })

          pool.release(cp)

          resolve(value)
        })
      }).catch(reject)
    }
  )))

  pool.clear()

  return ret
}

module.exports = multiprocessMap
