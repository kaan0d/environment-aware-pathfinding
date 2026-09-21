import { describe, expect, it } from 'vitest'
import { registerKind } from '../src/sim/environment'
import type { Scenario } from '../src/sim/types'
import { World } from '../src/sim/world'
import { runToEnd } from './fixtures'

// A terrain that exists only in this file: walkable, three times slower. No sim or planner code knows about it.
const MUD = registerKind({ traversal: 'passable', moveCost: 3, targetable: false })

function mudWorld(bandWidth: number): World {
  const scenario: Scenario = {
    name: 'mud band',
    width: 30,
    height: 12,
    walls: [],
    buildings: [{ type: 'depot', x: 26, y: 5 }],
    spawns: [{ x: 2, y: 5 }],
    deployments: [{ t: 0, troopType: 'balanced', x: 2, y: 5 }],
  }
  const world = new World(scenario)
  for (let x = 10; x < 10 + bandWidth; x++) {
    for (let y = 2; y <= 9; y++) world.grid.kind[world.grid.cellAt(x, y)] = MUD
  }
  world.setPlanner('timecost')
  return world
}

const mudCellsOnRoute = (world: World) =>
  Array.from(world.troops[0].plan!.route).filter((cell) => world.grid.kind[cell] === MUD).length

describe('a new terrain kind without touching the planner', () => {
  it('crosses a thin mud band when that is cheaper than the detour', () => {
    const world = mudWorld(1)
    world.step()
    const estimate = world.troops[0].plan!.estTotalTime
    expect(mudCellsOnRoute(world)).toBe(1)
    runToEnd(world)
    const error = Math.abs(estimate - world.finishTime!) / world.finishTime!
    console.log(`thin mud: est ${estimate.toFixed(2)} s, real ${world.finishTime!.toFixed(2)} s, ${(error * 100).toFixed(1)}%`)
    expect(error).toBeLessThan(0.02) // ignoring moveCost while walking would be off by about 5%
  })

  it('walks around a thick mud band', () => {
    const world = mudWorld(3)
    world.step()
    expect(mudCellsOnRoute(world)).toBe(0)
  })
})
