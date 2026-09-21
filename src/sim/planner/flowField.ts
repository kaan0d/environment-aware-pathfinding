import { MAX_ATTACK_POSITIONS } from '../config'
import { traversalOf } from '../environment'
import { DIR_COST, DIR_DX, type Grid } from '../grid'
import { MinHeap } from '../heap'
import { enterCost } from './cost'

// Optional inputs for a squad: its damage differs per wall and building, some walls are off limits, one building may be the only goal.
export interface FieldOptions {
  wallDps?: Float64Array // damage per second a squad brings to each breakable cell
  buildingDps?: Float64Array // the same per building id
  banned?: Uint8Array // 1 marks a cell the route may not enter
  onlyBuilding?: number // seed only this building
  settle?: readonly number[] // stop as soon as these cells hold their final value, the rest of the map stays unfinished
}

// Multi-source reverse Dijkstra: for every cell, the seconds a troop needs to walk, break walls and
// destroy the cheapest building from there. Buffers are reused, compute() allocates nothing per cell.
export class FlowField {
  readonly value: Float64Array // seconds to finish a building from the cell, Infinity when unreachable
  readonly next: Int32Array // next cell on the best route, -1 at a seed
  readonly target: Int32Array // building the best route ends at
  private readonly heap: MinHeap
  private readonly ring = new Int32Array(MAX_ATTACK_POSITIONS)
  private readonly wanted: Uint8Array

  constructor(private readonly grid: Grid) {
    this.wanted = new Uint8Array(grid.size)
    this.value = new Float64Array(grid.size)
    this.next = new Int32Array(grid.size)
    this.target = new Int32Array(grid.size)
    // Pushes are at most one per relaxed edge plus one per building ring cell.
    this.heap = new MinHeap(grid.size * (DIR_DX.length + MAX_ATTACK_POSITIONS) + 1)
  }

  // Seeds are the cells around each living building, valued at the building's break time; a seed may be a
  // breakable cell, which then costs its own break time to enter. seedAllowed can veto seeds, for example taken slots.
  compute(speed: number, dps: number, seedAllowed: ((cell: number) => boolean) | null, options: FieldOptions = {}): void {
    const { grid, value, next, target, heap, ring } = this
    const { wallDps, buildingDps, banned, onlyBuilding = -1, settle } = options
    const { wanted } = this
    let waiting = 0
    for (const cell of settle ?? []) {
      if (wanted[cell] === 0) waiting++
      wanted[cell] = 1
    }
    value.fill(Infinity)
    next.fill(-1)
    target.fill(-1)
    heap.clear()
    for (const building of grid.buildings) {
      if (!building.alive || (onlyBuilding >= 0 && building.id !== onlyBuilding)) continue
      const seedValue = building.hp / (buildingDps ? buildingDps[building.id] : dps)
      const count = grid.ringCells('building', building.id, ring)
      for (let i = 0; i < count; i++) {
        const cell = ring[i]
        if (traversalOf(grid.kind[cell]) === 'blocked' || (banned && banned[cell] === 1)) continue
        if (seedAllowed !== null && !seedAllowed(cell)) continue
        if (seedValue >= value[cell]) continue // ties keep the lower building id
        value[cell] = seedValue
        target[cell] = building.id
        heap.push(seedValue, cell)
      }
    }
    while (heap.size > 0) {
      const cell = heap.pop()
      if (heap.lastKey > value[cell]) continue
      if (wanted[cell] === 1) {
        wanted[cell] = 0
        if (--waiting === 0) break
      }
      const cellDps = wallDps ? wallDps[cell] : dps
      for (let dir = 0; dir < DIR_DX.length; dir++) {
        const from = grid.stepTarget(cell, dir, true) // steps are symmetric, so this is a cell that can step into `cell`
        if (from < 0 || (banned && banned[from] === 1)) continue
        const candidate = value[cell] + enterCost(grid, cell, DIR_COST[dir], speed, cellDps)
        if (candidate >= value[from]) continue
        value[from] = candidate
        next[from] = cell
        target[from] = target[cell]
        heap.push(candidate, from)
      }
    }
    for (const cell of settle ?? []) wanted[cell] = 0
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
