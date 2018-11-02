'use strict'

module.exports = class Pool {
  constructor ({ max, create, destroy }) {
    Object.assign(this, { max, create, destroy })
    this.processes = []
    this.unused = []
    this.waitingList = []
  }

  async acquire () {
    if (this.unused.length) {
      return this.unused.pop()
    }
    if (this.processes.length >= this.max) {
      return new Promise(resolve => {
        this.waitingList.push(resolve)
      })
    }
    const created = await this.create()
    this.processes.push(created)
    return created
  }

  release (proc) {
    if (this.waitingList.length) {
      this.waitingList.pop()(proc)
      return
    }
    this.unused.push(proc)
  }

  clear () {
    this.processes.forEach(proc => { proc.kill() })
  }
}
