import { DIR_COST, DIR_DX, type Grid } from '../grid'
import { MinHeap } from '../heap'

// Uniform-cost search over walkable cells; buffers are reused across runs.
// ponytail: no A* heuristic, the full distance map also serves as the reachable region; add one if grids grow past ~100x100.
export class RouteSearch {
  readonly dist: Float64Array // Infinity where unreachable
  private readonly prev: Int32Array
  private readonly heap: MinHeap

  constructor(private readonly grid: Grid) {
    this.dist = new Float64Array(grid.size)
    this.prev = new Int32Array(grid.size)
    this.heap = new MinHeap(grid.size * DIR_DX.length + 1) // each edge pushes at most once
  }

  run(start: number): void {
    const { grid, dist, prev, heap } = this
    dist.fill(Infinity)
    prev.fill(-1)
    heap.clear()
    dist[start] = 0
    heap.push(0, start)
    while (heap.size > 0) {
      const cell = heap.pop()
      if (heap.lastKey > dist[cell]) continue
      for (let dir = 0; dir < DIR_DX.length; dir++) {
        const next = grid.stepTarget(cell, dir)
        if (next < 0) continue
        const cost = dist[cell] + DIR_COST[dir]
        if (cost >= dist[next]) continue
        dist[next] = cost
        prev[next] = cell
        heap.push(cost, next)
      }
    }
  }

  // Cells from the last run's start to goal; goal must be reachable.
  routeTo(goal: number): Int32Array {
    let length = 0
    for (let cell = goal; cell >= 0; cell = this.prev[cell]) length++
    const route = new Int32Array(length)
    for (let cell = goal, i = length - 1; cell >= 0; cell = this.prev[cell]) route[i--] = cell
    return route
  }
}
