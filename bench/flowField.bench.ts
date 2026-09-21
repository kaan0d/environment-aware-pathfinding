import { it } from 'vitest'
import { BUILDING_TYPES } from '../src/sim/config'
import { Grid } from '../src/sim/grid'
import { FlowField } from '../src/sim/planner/flowField'
import { mulberry32 } from '../src/sim/rng'
import type { WallLevel } from '../src/sim/types'

// About 30% of the cells are walls of random level and ten buildings sit at random free spots.
function randomField(width: number, height: number): FlowField {
  const random = mulberry32(7)
  const grid = new Grid(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (random() < 0.3) grid.placeWall(x, y, (1 + Math.floor(random() * 5)) as WallLevel)
  }
  const types = Object.values(BUILDING_TYPES)
  for (let placed = 0; placed < 10; ) {
    try {
      grid.placeBuilding(types[placed % types.length], Math.floor(random() * width), Math.floor(random() * height))
      placed++
    } catch {
      // spot taken or out of bounds, try another
    }
  }
  return new FlowField(grid)
}

// Runs compute() after a warm-up and prints the mean and the median in milliseconds.
function measure(label: string, field: FlowField, runs: number): void {
  for (let i = 0; i < 50; i++) field.compute(2.5, 50, null)
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    field.compute(2.5, 50, null)
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  const mean = times.reduce((a, b) => a + b, 0) / runs
  console.log(`flow field ${label}: mean ${mean.toFixed(3)} ms, median ${times[runs >> 1].toFixed(3)} ms, max ${times[runs - 1].toFixed(3)} ms (${runs} runs)`)
}

it('flow field over the whole map', () => {
  measure('40x28', randomField(40, 28), 1000)
  measure('100x100', randomField(100, 100), 300)
})
