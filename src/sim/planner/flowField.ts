import { MAX_ATTACK_POSITIONS } from '../config'
import { traversalOf } from '../environment'
import { DIR_COST, DIR_DX, type Grid } from '../grid'
import { MinHeap } from '../heap'
import { enterCost } from './cost'

// Multi-source reverse Dijkstra: for every cell, the seconds a troop needs to walk, break walls and
// destroy the cheapest building from there. Buffers are reused, compute() allocates nothing per cell.
export class FlowField {
  readonly value: Float64Array // seconds to finish a building from the cell, Infinity when unreachable
  readonly next: Int32Array // next cell on the best route, -1 at a seed
  readonly target: Int32Array // building the best route ends at
  private readonly heap: MinHeap
  private readonly ring = new Int32Array(MAX_ATTACK_POSITIONS)

  constructor(private readonly grid: Grid) {
    this.value = new Float64Array(grid.size)
    this.next = new Int32Array(grid.size)
    this.target = new Int32Array(grid.size)
    // Pushes are at most one per relaxed edge plus one per building ring cell.
    this.heap = new MinHeap(grid.size * (DIR_DX.length + MAX_ATTACK_POSITIONS) + 1)
  }

  // Seeds are the cells around each living building, valued at the building's break time; a seed may be a
  // breakable cell, which then costs its own break time to enter. seedAllowed can veto seeds, for example taken slots.
  compute(speed: number, dps: number, seedAllowed: ((cell: number) => boolean) | null): void {
    const { grid, value, next, target, heap, ring } = this
    value.fill(Infinity)
    next.fill(-1)
    target.fill(-1)
    heap.clear()
    for (const building of grid.buildings) {
      if (!building.alive) continue
      const seedValue = building.hp / dps
      const count = grid.ringCells('building', building.id, ring)
      for (let i = 0; i < count; i++) {
        const cell = ring[i]
        if (traversalOf(grid.kind[cell]) === 'blocked' || (seedAllowed !== null && !seedAllowed(cell))) continue
        if (seedValue >= value[cell]) continue // ties keep the lower building id
        value[cell] = seedValue
        target[cell] = building.id
        heap.push(seedValue, cell)
      }
    }
    while (heap.size > 0) {
      const cell = heap.pop()
      if (heap.lastKey > value[cell]) continue
      for (let dir = 0; dir < DIR_DX.length; dir++) {
        const from = grid.stepTarget(cell, dir, true) // steps are symmetric, so this is a cell that can step into `cell`
        if (from < 0) continue
        const candidate = value[cell] + enterCost(grid, cell, DIR_COST[dir], speed, dps)
        if (candidate >= value[from]) continue
        value[from] = candidate
        next[from] = cell
        target[from] = target[cell]
        heap.push(candidate, from)
      }
    }
  }

  // Cells from start down the gradient to a seed; start must have a finite value.
  routeFrom(start: number): Int32Array {
    let length = 0
    for (let cell = start; cell >= 0; cell = this.next[cell]) length++
    const route = new Int32Array(length)
    let i = 0
    for (let cell = start; cell >= 0; cell = this.next[cell]) route[i++] = cell
    return route
  }
}
