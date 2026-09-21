import { DT } from '../src/sim/config'
import type { Plan, Scenario, WallLevel } from '../src/sim/types'
import type { World } from '../src/sim/world'

export function runToEnd(world: World, maxSeconds = 300): World {
  const maxSteps = Math.ceil(maxSeconds / DT)
  for (let i = 0; i < maxSteps && !world.finished; i++) world.step()
  return world
}

// Wall column at x=8 leaves only a far gap at the bottom, so hitting the wall is a shortcut.
export function lCornerScenario(level: WallLevel = 1, troopType = 'balanced'): Scenario {
  const walls = Array.from({ length: 18 }, (_, y) => ({ x: 8, y, level }))
  return {
    name: 'L corner',
    stackAttackers: false,
    width: 15,
    height: 20,
    walls,
    buildings: [{ type: 'depot', x: 10, y: 2 }],
    spawns: [{ x: 5, y: 2 }],
    deployments: [{ t: 0, troopType, x: 5, y: 2 }],
  }
}

// Straight route through the wall at (8,2) to the depot's west slot.
export function lCornerDirectPlan(): Plan {
  const width = 15
  return {
    targetKind: 'building',
    targetId: 0,
    route: Int32Array.from([5, 6, 7, 8, 9].map((x) => 2 * width + x)),
    breakCells: Int32Array.of(2 * width + 8),
    estTotalTime: 0,
  }
}

// Depot A has one free slot at (1,0); three troops all want it, depot B is far away.
export function singleSlotScenario(): Scenario {
  return {
    name: 'single slot',
    stackAttackers: false,
    width: 12,
    height: 3,
    walls: [
      { x: 0, y: 1, level: 5 },
      { x: 1, y: 1, level: 5 },
    ],
    buildings: [
      { type: 'depot', x: 0, y: 0 },
      { type: 'depot', x: 11, y: 2 },
    ],
    spawns: [{ x: 5, y: 0 }],
    deployments: [{ t: 0, troopType: 'fast', x: 5, y: 0, count: 3 }],
  }
}

// Depot fully ringed by level 1 walls, so the classic AI has no path and must break in.
export function sealedScenario(): Scenario {
  const walls: Scenario['walls'] = []
  for (let y = 4; y <= 6; y++) {
    for (let x = 7; x <= 9; x++) if (x !== 8 || y !== 5) walls.push({ x, y, level: 1 })
  }
  return {
    name: 'sealed',
    stackAttackers: false,
    width: 12,
    height: 10,
    walls,
    buildings: [{ type: 'depot', x: 8, y: 5 }],
    spawns: [{ x: 2, y: 5 }],
    deployments: [{ t: 0, troopType: 'balanced', x: 2, y: 5 }],
  }
}

// Depot A is nearest in a straight line but ringed by level 5 walls; depot B is farther and open.
export function walledDepotScenario(): Scenario {
  const walls: Scenario['walls'] = []
  for (let y = 4; y <= 6; y++) {
    for (let x = 4; x <= 6; x++) if (x !== 5 || y !== 5) walls.push({ x, y, level: 5 })
  }
  return {
    name: 'walled depot',
    stackAttackers: false,
    width: 40,
    height: 12,
    walls,
    buildings: [
      { type: 'depot', x: 5, y: 5 },
      { type: 'depot', x: 30, y: 5 },
    ],
    spawns: [{ x: 12, y: 5 }],
    deployments: [{ t: 0, troopType: 'balanced', x: 12, y: 5 }],
  }
}

// Long wall at x=15 with level 5 cells except the listed open rows; depot at the far side, one heavy troop.
export function gapScenario(openRows: number[], height = 26): Scenario {
  const walls: Scenario['walls'] = []
  for (let y = 0; y < height; y++) if (!openRows.includes(y)) walls.push({ x: 15, y, level: 5 })
  return {
    name: 'gaps',
    stackAttackers: false,
    width: 40,
    height,
    walls,
    buildings: [{ type: 'depot', x: 30, y: 10 }],
    spawns: [{ x: 2, y: 10 }],
    deployments: [{ t: 0, troopType: 'heavy', x: 2, y: 10 }],
  }
}

// Depots one above the other behind a level 2 wall; a heavy troop breaks the wall at 3 s, a fast one deploys at 1.4 s and first plans the detour.
export function crowdedWallScenario(): Scenario {
  return {
    ...lCornerScenario(2),
    name: 'crowded wall',
    buildings: [
      { type: 'depot', x: 10, y: 2 },
      { type: 'depot', x: 10, y: 4 },
    ],
    spawns: [
      { x: 5, y: 2 },
      { x: 5, y: 6 },
    ],
    deployments: [
      { t: 0, troopType: 'heavy', x: 5, y: 2 },
      { t: 1.4, troopType: 'fast', x: 5, y: 6 },
    ],
  }
}
