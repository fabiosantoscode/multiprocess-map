const os = require('os')
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
    create: () => worker.async(
      function processMap (onMessage, send) {
        onMessage(function (msg) {
          let value
          try {
            value = (fn)(msg[0], msg[1], msg[2])
          } catch (e) {
            send({ error: e })
            return
          }

          if (value.then) {
            value.then(function (ret) {
              send({ val: ret })
            }, function (error) {
              send({ error: error })
            })
          } else {
            send({ val: value })
          }
        })
      }.toString().replace('fn', fn)
    ),
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
  const ret = await Promise.all(values.map(async (value: any, index: number, all: any): Promise<any> => {
    const cp = await pool.acquire()
    setTimeout(() => {
      cp.send([value, index, all])
    }, 100)

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

    const { val, error } = await new Promise(resolve => {
      cp.once('message', resolve)
    }) as any

    if (error) { throw error }

    cp.removeListener('stdout', onStdout)

    enqueue(index, () => {
      if (stdout) { process.stdout.write(processStdout(stdout)) }
    })

    pool.release(cp)

    return val
  }))

  pool.clear()

  return ret
}

module.exports = multiprocessMap
