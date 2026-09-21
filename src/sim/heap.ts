// Binary min-heap over preallocated typed arrays; duplicates allowed, callers skip stale pops.
export class MinHeap {
  size = 0
  lastKey = 0 // key of the entry returned by the latest pop()
  private readonly keys: Float64Array
  private readonly nodes: Int32Array

  constructor(capacity: number) {
    this.keys = new Float64Array(capacity)
    this.nodes = new Int32Array(capacity)
  }

  clear(): void {
    this.size = 0
  }

  push(key: number, node: number): void {
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= key) break
      this.keys[i] = this.keys[parent]
      this.nodes[i] = this.nodes[parent]
      i = parent
    }
    this.keys[i] = key
    this.nodes[i] = node
  }

  pop(): number {
    const top = this.nodes[0]
    this.lastKey = this.keys[0]
    this.size--
    if (this.size === 0) return top
    const key = this.keys[this.size]
    const node = this.nodes[this.size]
    let i = 0
    for (;;) {
      let child = 2 * i + 1
      if (child >= this.size) break
      if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) child++
      if (this.keys[child] >= key) break
      this.keys[i] = this.keys[child]
      this.nodes[i] = this.nodes[child]
      i = child
    }
    this.keys[i] = key
    this.nodes[i] = node
    return top
  }
}
