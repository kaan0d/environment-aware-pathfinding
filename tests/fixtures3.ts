import { DT } from '../src/sim/config'
import { randomScenario } from '../src/sim/randomScenario'
import type { Plan, Planner, Scenario, WallLevel } from '../src/sim/types'
import { World } from '../src/sim/world'
import { lCornerScenario } from './fixtures'

export { randomScenario }

// The L-corner map with `count` troops deployed on one cell.
export function crowdScenario(level: WallLevel, count: number, troopType = 'balanced'): Scenario {
  return { ...lCornerScenario(level, troopType), deployments: [{ t: 0, troopType, x: 5, y: 2, count }] }
}

// A wall column that spans the whole map (three attack positions on each side) or sits in a one-cell corridor (one).
export function barrierScenario(corridor: boolean, count: number): Scenario {
  const walls: Scenario['walls'] = []
  if (corridor) {
    for (let x = 5; x <= 11; x++) walls.push({ x, y: 4, level: 5 }, { x, y: 6, level: 5 })
    walls.push({ x: 8, y: 5, level: 4 })
  } else {
    for (let y = 0; y < 11; y++) walls.push({ x: 8, y, level: 4 })
  }
  return {
    name: corridor ? 'corridor' : 'barrier',
    stackAttackers: false,
    width: 20,
    height: 11,
    walls,
    buildings: [{ type: 'depot', x: 14, y: 5 }],
    spawns: [{ x: 2, y: 5 }],
    deployments: [{ t: 0, troopType: 'balanced', x: 2, y: 5, count }],
  }
}

// Straight route along a row, from x0 to x1, through whatever stands in between.
export function rowPlan(scenario: Scenario, y: number, x0: number, x1: number, buildingId = 0): Plan {
  const cells = Array.from({ length: x1 - x0 + 1 }, (_, i) => y * scenario.width + x0 + i)
  return { targetKind: 'building', targetId: buildingId, route: Int32Array.from(cells), breakCells: new Int32Array(0), estTotalTime: 0 }
}

// Runs a scenario where every troop follows a fixed plan and nobody re-plans, until the given building falls.
export function runFixedPlans(scenario: Scenario, plans: (troopId: number) => Plan | null, buildingId: number, maxSeconds = 400): World {
  const world = new World(scenario)
  const fixed: Planner = { plan: (_world, troopId) => plans(troopId) }
  world.planner = fixed
  while (!world.finished && world.time < maxSeconds) {
    world.step()
    if (world.events.some((e) => e.type === 'buildingDestroyed' && e.buildingId === buildingId)) break
  }
  return world
}

export function eventTime(world: World, type: 'wallDestroyed' | 'buildingDestroyed'): number | null {
  return world.events.find((e) => e.type === type)?.t ?? null
}

export const oneTick = DT
