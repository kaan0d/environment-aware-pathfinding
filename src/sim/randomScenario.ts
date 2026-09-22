import { mulberry32 } from './rng'
import type { Scenario, WallLevel } from './types'

// Small random map: walls of random level, a few buildings, one group of troops on a single free cell.
// Shared by the oracle test (tests/fixtures3.ts re-exports this) and the in-browser planner comparison.
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
