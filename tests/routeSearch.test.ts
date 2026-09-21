import { describe, expect, it } from 'vitest'
import { RouteSearch } from '../src/sim/ai/routeSearch'
import { Grid } from '../src/sim/grid'
import { MinHeap } from '../src/sim/heap'

describe('MinHeap', () => {
  it('pops keys in ascending order', () => {
    const heap = new MinHeap(16)
    const keys = [5, 1, 4, 1, 9, 0, 7, 3]
    keys.forEach((k, i) => heap.push(k, i))
    const popped: number[] = []
    while (heap.size > 0) {
      heap.pop()
      popped.push(heap.lastKey)
    }
    expect(popped).toEqual([...keys].sort((a, b) => a - b))
  })
})

describe('RouteSearch', () => {
  it('finds the octile shortest route on an open grid', () => {
    const grid = new Grid(6, 6)
    const search = new RouteSearch(grid)
    search.run(grid.cellAt(0, 0))
    expect(search.dist[grid.cellAt(3, 3)]).toBeCloseTo(3 * Math.SQRT2)
    expect(search.routeTo(grid.cellAt(5, 0)).length).toBe(6)
  })

  it('leaves cells behind a sealed wall unreachable', () => {
    const grid = new Grid(5, 3)
    for (let y = 0; y < 3; y++) grid.placeWall(2, y, 1)
    const search = new RouteSearch(grid)
    search.run(grid.cellAt(0, 1))
    expect(search.dist[grid.cellAt(4, 1)]).toBe(Infinity)
  })
})
