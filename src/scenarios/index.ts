import type { Scenario, WallLevel } from '../sim/types'

export interface ScenarioEntry {
  id: string
  name: string
  description: string
  scenario: Scenario
}

type Wall = Scenario['walls'][number]

const WIDTH = 40
const HEIGHT = 28

function column(x: number, y0: number, y1: number, level: WallLevel): Wall[] {
  return Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i, level }))
}

// A strong column with a thin stretch: level 5 everywhere except levels 1 between thin0 and thin1.
function barrier(x: number, y0: number, y1: number, thin0: number, thin1: number): Wall[] {
  return Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i, level: (y0 + i >= thin0 && y0 + i <= thin1 ? 1 : 5) as WallLevel }))
}

function row(y: number, x0: number, x1: number, level: WallLevel): Wall[] {
  return Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, level }))
}

// The border cells of a rectangle, one cell thick.
function ring(x0: number, y0: number, x1: number, y1: number, level: WallLevel): Wall[] {
  return [...row(y0, x0, x1, level), ...row(y1, x0, x1, level), ...column(x0, y0 + 1, y1 - 1, level), ...column(x1, y0 + 1, y1 - 1, level)]
}

function scenario(name: string, walls: Wall[], buildings: Scenario['buildings'], deployments: Scenario['deployments'], spawns: Scenario['spawns']): Scenario {
  return { name, width: WIDTH, height: HEIGHT, walls, buildings, spawns, deployments }
}

// The L-corner problem: one depot behind a cheap wall, the way around is long.
export const L_CORNER: Scenario = scenario(
  'L corner',
  column(20, 0, 21, 1),
  [{ type: 'depot', x: 26, y: 6 }],
  [{ t: 0, troopType: 'balanced', x: 12, y: 6 }],
  [{ x: 12, y: 6 }],
)

const CASTLE = scenario(
  'Castle',
  [...ring(14, 4, 30, 19, 5).filter((w) => !(w.x === 14 && w.y === 7)), { x: 14, y: 7, level: 1 }],
  [
    { type: 'hq', x: 20, y: 9 },
    { type: 'tower', x: 25, y: 13 },
    { type: 'depot', x: 17, y: 15 },
  ],
  [{ t: 0, troopType: 'balanced', x: 5, y: 12, count: 3 }],
  [{ x: 5, y: 12 }],
)

// A depot in two rings (thin outside, thick inside) close to the troops, another one far away in the open.
const DOUBLE_LAYER = scenario(
  'Double layer',
  [...ring(22, 12, 26, 16, 1), ...ring(23, 13, 25, 15, 5).filter((w) => !(w.x === 25 && w.y === 14)), { x: 25, y: 14, level: 1 }],
  [
    { type: 'depot', x: 24, y: 14 },
    { type: 'depot', x: 36, y: 4 },
  ],
  [{ t: 0, troopType: 'balanced', x: 5, y: 14, count: 4 }],
  [{ x: 5, y: 14 }],
)

// One long wall, strong everywhere except a weak spot that is not on the straight line to any depot.
const MIXED_LEVELS = scenario(
  'Mixed levels',
  [...column(20, 0, 8, 5), ...column(20, 9, 11, 1), ...column(20, 12, 27, 5)],
  [
    { type: 'depot', x: 30, y: 20 },
    { type: 'depot', x: 30, y: 4 },
    { type: 'tower', x: 34, y: 12 },
  ],
  [
    { t: 0, troopType: 'fast', x: 8, y: 22, count: 2 },
    { t: 0, troopType: 'balanced', x: 8, y: 24, count: 2 },
    { t: 0, troopType: 'heavy', x: 8, y: 20 },
  ],
  [{ x: 8, y: 22 }],
)

const NO_PATH = scenario(
  'No way in',
  ring(29, 13, 31, 15, 3),
  [{ type: 'depot', x: 30, y: 14 }],
  [{ t: 0, troopType: 'balanced', x: 8, y: 14, count: 2 }],
  [{ x: 8, y: 14 }],
)

// Serpentine of strong walls with thin spots in every barrier: a long walk against a short break-through.
const MAZE = scenario(
  'Maze',
  [
    ...barrier(10, 0, 24, 12, 14),
    ...barrier(16, 3, 27, 12, 14),
    ...barrier(22, 0, 24, 12, 14),
    ...barrier(28, 3, 27, 12, 14),
  ],
  [{ type: 'tower', x: 34, y: 13 }],
  [{ t: 0, troopType: 'balanced', x: 4, y: 13, count: 4 }],
  [{ x: 4, y: 13 }],
)

const CROWD = scenario('Crowd effect', column(20, 0, 21, 4), [{ type: 'depot', x: 26, y: 6 }], [{ t: 0, troopType: 'balanced', x: 12, y: 6 }], [{ x: 12, y: 6 }])

const REINFORCEMENTS = scenario(
  'Reinforcements',
  column(20, 0, 21, 4),
  [{ type: 'depot', x: 26, y: 6 }],
  [
    { t: 0, troopType: 'balanced', x: 12, y: 6, count: 3 },
    { t: 2.5, troopType: 'balanced', x: 12, y: 10, count: 10 },
  ],
  [{ x: 12, y: 6 }, { x: 12, y: 10 }],
)

// A tunnel one cell wide through the whole map, closed by a two-cell barrier; only one attacker fits at each barrier cell.
const NARROW = scenario(
  'Narrow passage',
  [...row(13, 0, 39, 5), ...row(15, 0, 39, 5), ...column(18, 14, 14, 3), ...column(19, 14, 14, 3)],
  [{ type: 'depot', x: 35, y: 14 }],
  [{ t: 0, troopType: 'balanced', x: 4, y: 14, count: 20 }],
  [{ x: 4, y: 14 }],
)

// An empty map to draw on.
export const BLANK: ScenarioEntry = {
  id: 'blank',
  name: 'Blank map',
  description: 'An empty 40 x 28 map. Pick a tool, draw walls and buildings, add a spawn point, then drop units. Both panels get the same map and the same units.',
  scenario: scenario('Blank map', [], [], [], []),
}

export const SCENARIOS: ScenarioEntry[] = [
  {
    id: 'l-corner',
    name: '1. L corner',
    description: 'The first problem. One depot sits behind a thin wall (level 1) and the way around is long. Classic walks around, the new algorithm breaks one wall cell.',
    scenario: L_CORNER,
  },
  {
    id: 'castle',
    name: '2. Castle',
    description: 'Three buildings inside a closed ring of level 5 walls. There is no way in, so both must break a wall. The ring has one weak gate (level 1) in the upper left: the new algorithm walks to it, classic hits the strong wall nearest to the buildings.',
    scenario: CASTLE,
  },
  {
    id: 'double-layer',
    name: '3. Double layer',
    description: 'A depot close by hides behind a thin outer ring and a very strong inner ring with one weak door on the far side; another depot is far away in the open. The new algorithm compares total time: it takes the open depot first and goes round to the weak door.',
    scenario: DOUBLE_LAYER,
  },
  {
    id: 'mixed-levels',
    name: '4. Mixed levels',
    description: 'A long wall with one weak stretch (level 1) that is not on the straight line to any building. The new algorithm walks to the weak spot; classic has to hit a strong wall.',
    scenario: MIXED_LEVELS,
  },
  {
    id: 'no-way',
    name: '5. No way in',
    description: 'A depot fully closed by level 3 walls. Both algorithms have to break in, so the times are close. The new algorithm still picks the cheapest wall and shares it.',
    scenario: NO_PATH,
  },
  {
    id: 'maze',
    name: '6. Maze',
    description: 'A serpentine of strong walls with a thin spot in every barrier. Classic follows the long maze path, the new algorithm cuts through the thin spots.',
    scenario: MAZE,
  },
  {
    id: 'crowd',
    name: '7. Crowd effect',
    description: 'A level 4 wall (1000 hp) with a single unit: it walks around. Use "Clear units", then click "Add unit" a few more times. From 3 units the new algorithm breaks the wall instead.',
    scenario: CROWD,
  },
  {
    id: 'reinforcements',
    name: '8. Reinforcements',
    description: 'Three units are at the wall, ten more join 2.5 s later a few cells back. The new algorithm counts the late arrivals when it decides to break the wall.',
    scenario: REINFORCEMENTS,
  },
  {
    id: 'narrow',
    name: '9. Narrow passage',
    description: 'A tunnel one cell wide with a two-cell barrier in it. Both algorithms have to break through, so the times are close. With "Attackers can share a cell" on, all twenty units hit the barrier together; switch it off and they queue: only one attacker fits at each barrier cell.',
    scenario: NARROW,
  },
]
