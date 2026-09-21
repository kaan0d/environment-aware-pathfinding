import { moveCostOf, traversalOf } from '../environment'
import type { Grid } from '../grid'

// Seconds for one troop to walk one step of the given length into a cell, breaking it first when it is breakable.
export function enterCost(grid: Grid, cell: number, stepLength: number, speed: number, dps: number): number {
  const kind = grid.kind[cell]
  const walk = (stepLength * moveCostOf(kind)) / speed
  return traversalOf(kind) === 'breakable' ? walk + grid.hp[cell] / dps : walk
}

// Seconds to walk (and break through) route[fromIdx..] starting at the point (x, y); the final target is not included.
export function routeTime(
  grid: Grid,
  x: number,
  y: number,
  route: Int32Array,
  fromIdx: number,
  speed: number,
  dps: number,
): number {
  let time = 0
  for (let i = fromIdx; i < route.length; i++) {
    const cx = (route[i] % grid.width) + 0.5
    const cy = Math.floor(route[i] / grid.width) + 0.5
    time += enterCost(grid, route[i], Math.sqrt((cx - x) * (cx - x) + (cy - y) * (cy - y)), speed, dps)
    x = cx
    y = cy
  }
  return time
}
