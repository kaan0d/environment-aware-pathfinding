import { describe, expect, it } from 'vitest'
import { FlowField } from '../src/sim/planner/flowField'
import { World } from '../src/sim/world'
import type { Scenario } from '../src/sim/types'

const SPEED = 2.5
const DPS = 50

function corridor(walls: Scenario['walls'] = [], buildings: Scenario['buildings'] = [{ type: 'depot', x: 9, y: 1 }]): World {
  return new World({
    name: 'corridor',
    width: 10,
    height: 3,
    walls,
    buildings,
    spawns: [],
    deployments: [],
  })
}

describe('FlowField', () => {
  it('values a cell by walking time plus the building break time', () => {
    const world = corridor()
    const field = new FlowField(world.grid)
    field.compute(SPEED, DPS, null)
    expect(field.value[world.grid.cellAt(0, 1)]).toBeCloseTo(8 / SPEED + 300 / DPS) // 8 steps to the ring, depot 6 s
    expect(field.value[world.grid.cellAt(8, 1)]).toBeCloseTo(300 / DPS)
  })

  it('charges a wall by its hp over dps when the route crosses it', () => {
    const open = corridor()
    const walled = corridor([1, 0, 2].map((y) => ({ x: 4, y, level: 1 as const })))
    const openField = new FlowField(open.grid)
    const walledField = new FlowField(walled.grid)
    openField.compute(SPEED, DPS, null)
    walledField.compute(SPEED, DPS, null)
    const from = open.grid.cellAt(0, 1)
    expect(walledField.value[from] - openField.value[from]).toBeCloseTo(100 / DPS) // level 1 wall, 2 s
  })

  it('never steps into a building', () => {
    const world = corridor([], [{ type: 'depot', x: 9, y: 1 }, { type: 'depot', x: 5, y: 1 }])
    const field = new FlowField(world.grid)
    field.compute(SPEED, DPS, null)
    const depot = world.grid.cellAt(5, 1)
    expect(field.value[depot]).toBe(Infinity)
    expect(field.next.every((cell) => cell !== depot)).toBe(true)
  })

  it('lets the seed filter veto attack cells and falls back to other buildings', () => {
    const world = corridor([], [{ type: 'depot', x: 9, y: 1 }, { type: 'depot', x: 0, y: 0 }])
    const field = new FlowField(world.grid)
    const nearRight = new Set([world.grid.cellAt(8, 0), world.grid.cellAt(8, 1), world.grid.cellAt(8, 2)])
    field.compute(SPEED, DPS, (cell) => !nearRight.has(cell))
    const route = field.routeFrom(world.grid.cellAt(4, 1))
    expect(field.target[route[route.length - 1]]).toBe(1) // the left depot
  })
})
