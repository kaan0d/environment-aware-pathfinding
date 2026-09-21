import { MAX_ATTACK_POSITIONS } from './config'
import { DIR_DX, type Grid } from './grid'
import type { TargetKind } from './types'

const WINDOW = 3 // the search never walks farther than this many cells from the target's footprint

// Finds the free attack positions of a target that a troop can walk to, and how to get there.
// The world uses it to spread attackers, the planner to count slots, so both agree by construction.
export class SlotFinder {
  readonly found = new Int32Array(MAX_ATTACK_POSITIONS) // free reachable attack positions, nearest first
  readonly foundDepth = new Int32Array(MAX_ATTACK_POSITIONS) // steps from the search start to each of them
  private readonly queue: Int32Array
  private readonly depth: Int32Array
  private readonly parent: Int32Array
  private readonly seen: Int32Array
  private round = 0

  constructor(private readonly grid: Grid) {
    this.queue = new Int32Array(grid.size)
    this.parent = new Int32Array(grid.size)
    this.depth = new Int32Array(grid.size)
    this.seen = new Int32Array(grid.size)
  }

  // Breadth-first walk from `from`; returns how many free attack positions were found. isTaken marks positions in use.
  search(kind: TargetKind, id: number, from: number, isTaken: ((cell: number) => boolean) | null): number {
    const { grid, queue, parent, depth, seen } = this
    let x0: number, y0: number, w: number, h: number
    if (kind === 'wall') {
      x0 = id % grid.width
      y0 = Math.floor(id / grid.width)
      w = h = 1
    } else {
      ;({ x: x0, y: y0, w, h } = grid.buildings[id])
    }
    const round = ++this.round
    let head = 0
    let tail = 0
    let count = 0
    queue[tail++] = from
    seen[from] = round
    parent[from] = -1
    depth[from] = 0
    while (head < tail) {
      const cell = queue[head++]
      const x = cell % grid.width
      const y = (cell - x) / grid.width
      const gapX = Math.max(x0 - x, 0, x - (x0 + w - 1))
      const gapY = Math.max(y0 - y, 0, y - (y0 + h - 1))
      if (Math.max(gapX, gapY) === 1 && (isTaken === null || !isTaken(cell))) {
        this.foundDepth[count] = depth[cell]
        this.found[count++] = cell
      }
      for (let dir = 0; dir < DIR_DX.length; dir++) {
        const next = grid.stepTarget(cell, dir)
        if (next < 0 || seen[next] === round) continue
        const nx = next % grid.width
        const ny = (next - nx) / grid.width
        const insideWindow = nx >= x0 - WINDOW && nx < x0 + w + WINDOW && ny >= y0 - WINDOW && ny < y0 + h + WINDOW
        if (!insideWindow) continue
        seen[next] = round
        parent[next] = cell
        depth[next] = depth[cell] + 1
        queue[tail++] = next
      }
    }
    return count
  }

  // Cells from the last search's start to a cell it reached.
  pathTo(cell: number): Int32Array {
    let length = 0
    for (let c = cell; c >= 0; c = this.parent[c]) length++
    const path = new Int32Array(length)
    for (let c = cell, i = length - 1; c >= 0; c = this.parent[c]) path[i--] = c
    return path
  }
}
