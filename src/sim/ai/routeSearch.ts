import { moveCostOf } from '../environment'
import { DIR_COST, DIR_DX, type Grid } from '../grid'
import { MinHeap } from '../heap'

// Uniform-cost search over walkable cells, distances in cost-weighted cells; buffers are reused across runs.
// ponytail: no A* heuristic, the full distance map also serves as the reachable region; add one if grids grow past ~100x100.
export class RouteSearch {
  readonly dist: Float64Array // Infinity where unreachable
  private readonly prev: Int32Array
  private readonly heap: MinHeap
  private readonly wanted: Uint8Array

  constructor(private readonly grid: Grid) {
    this.wanted = new Uint8Array(grid.size)
    this.dist = new Float64Array(grid.size)
    this.prev = new Int32Array(grid.size)
    this.heap = new MinHeap(grid.size * DIR_DX.length + grid.size + 1) // each edge pushes at most once, plus the seeds
  }

  run(start: number, settle?: readonly number[]): void {
    this.runFrom(Int32Array.of(start), 1, settle)
  }

  // Starts from several cells at distance 0, so dist holds the distance to the nearest of them.
  // When settle is given the search stops once those cells are final; other cells may hold unfinished values.
  runFrom(starts: Int32Array, count: number, settle?: readonly number[]): void {
    const { grid, dist, prev, heap, wanted } = this
    let waiting = 0
    for (const cell of settle ?? []) {
      if (wanted[cell] === 0) waiting++
      wanted[cell] = 1
    }
    dist.fill(Infinity)
    prev.fill(-1)
    heap.clear()
    for (let i = 0; i < count; i++) {
      dist[starts[i]] = 0
      heap.push(0, starts[i])
    }
    while (heap.size > 0) {
      const cell = heap.pop()
      if (heap.lastKey > dist[cell]) continue
      if (wanted[cell] === 1) {
        wanted[cell] = 0
        if (--waiting === 0) break
      }
      for (let dir = 0; dir < DIR_DX.length; dir++) {
        const next = grid.stepTarget(cell, dir)
        if (next < 0) continue
        const cost = dist[cell] + DIR_COST[dir] * moveCostOf(grid.kind[next])
        if (cost >= dist[next]) continue
        dist[next] = cost
        prev[next] = cell
        heap.push(cost, next)
      }
    }
    for (const cell of settle ?? []) wanted[cell] = 0
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
