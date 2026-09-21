import { DT } from '../src/sim/config'
import { mulberry32 } from '../src/sim/rng'
import type { Plan, Planner, Scenario, WallLevel } from '../src/sim/types'
import { World } from '../src/sim/world'
import { lCornerScenario } from './fixtures'

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

// Small random map: walls of random level, a few buildings, one group of troops on a single free cell.
export function randomScenario(seed: number, stackAttackers = false): Scenario | null {
  const random = mulberry32(seed)
  const width = 15
  const height = 15
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]
  const spawn = { x: 1 + Math.floor(random() * 4), y: 1 + Math.floor(random() * 13) }
  const taken = new Set<string>([`${spawn.x},${spawn.y}`])
  const buildings: Scenario['buildings'] = []
  const buildingCount = 1 + Math.floor(random() * 3)
  for (let tries = 0; buildings.length < buildingCount && tries < 50; tries++) {
    const type = pick(['depot', 'depot', 'tower'])
    const size = type === 'tower' ? 2 : 1
    const x = 6 + Math.floor(random() * (width - 6 - size))
    const y = Math.floor(random() * (height - size))
    const cells = Array.from({ length: size * size }, (_, i) => `${x + (i % size)},${y + Math.floor(i / size)}`)
    if (cells.some((c) => taken.has(c))) continue
    cells.forEach((c) => taken.add(c))
    buildings.push({ type, x, y })
  }
  const walls: Scenario['walls'] = []
  const density = 0.2 + random() * 0.2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!taken.has(`${x},${y}`) && random() < density) walls.push({ x, y, level: (1 + Math.floor(random() * 5)) as WallLevel })
    }
  }
  const troopTypes = ['fast', 'balanced', 'heavy']
  const first = pick(troopTypes)
  const deployments: Scenario['deployments'] = [{ t: 0, troopType: first, x: spawn.x, y: spawn.y, count: 1 + Math.floor(random() * 6) }]
  if (random() < 0.4) deployments.push({ t: 0, troopType: pick(troopTypes), x: spawn.x, y: spawn.y, count: 1 + Math.floor(random() * 3) })
  return { name: `random ${seed}`, stackAttackers, width, height, walls, buildings, spawns: [spawn], deployments }
}

export const oneTick = DT
