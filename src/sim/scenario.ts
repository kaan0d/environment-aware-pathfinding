import { BUILDING_TYPES, TROOP_TYPES } from './config'
import type { Scenario } from './types'

export interface Validation {
  errors: string[] // the scenario cannot be loaded
  warnings: string[] // it loads, but probably not as intended
}

export function cloneScenario(scenario: Scenario): Scenario {
  return JSON.parse(JSON.stringify(scenario)) as Scenario
}

// Cells the scenario fills with walls and buildings, as "x,y" keys mapped to a label.
export function occupiedCells(scenario: Scenario): Map<string, string> {
  const cells = new Map<string, string>()
  for (const wall of scenario.walls) cells.set(`${wall.x},${wall.y}`, 'wall')
  scenario.buildings.forEach((b, i) => {
    const type = BUILDING_TYPES[b.type]
    if (!type) return
    for (let y = b.y; y < b.y + type.h; y++) for (let x = b.x; x < b.x + type.w; x++) cells.set(`${x},${y}`, `building ${i}`)
  })
  return cells
}

// Checks what World would reject (overlaps, cells outside the map, unknown types) plus a few likely mistakes.
export function validateScenario(scenario: Scenario): Validation {
  const errors: string[] = []
  const warnings: string[] = []
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < scenario.width && y < scenario.height
  const seen = new Map<string, string>()
  const claim = (x: number, y: number, label: string) => {
    if (!inside(x, y)) return errors.push(`${label} at (${x},${y}) is outside the map`)
    const key = `${x},${y}`
    const other = seen.get(key)
    if (other) errors.push(`${label} at (${x},${y}) overlaps ${other}`)
    else seen.set(key, label)
  }
  scenario.walls.forEach((w) => claim(w.x, w.y, 'wall'))
  scenario.buildings.forEach((b, i) => {
    const type = BUILDING_TYPES[b.type]
    if (!type) return void errors.push(`building ${i} has unknown type "${b.type}"`)
    for (let y = b.y; y < b.y + type.h; y++) for (let x = b.x; x < b.x + type.w; x++) claim(x, y, `building ${i}`)
  })
  scenario.deployments.forEach((d, i) => {
    if (!TROOP_TYPES[d.troopType]) errors.push(`deployment ${i} has unknown troop type "${d.troopType}"`)
    if (!inside(d.x, d.y)) errors.push(`deployment ${i} at (${d.x},${d.y}) is outside the map`)
    else if (seen.has(`${d.x},${d.y}`)) errors.push(`deployment ${i} at (${d.x},${d.y}) lands on a ${seen.get(`${d.x},${d.y}`)}`)
  })
  if (scenario.buildings.length === 0) warnings.push('there is no building to destroy')
  if (scenario.deployments.length === 0) warnings.push('no troops are deployed yet')
  for (const [i, spawn] of scenario.spawns.entries()) {
    if (!inside(spawn.x, spawn.y)) errors.push(`spawn ${i} is outside the map`)
    else if (seen.has(`${spawn.x},${spawn.y}`)) errors.push(`spawn ${i} at (${spawn.x},${spawn.y}) lands on a ${seen.get(`${spawn.x},${spawn.y}`)}`)
    else if (!hasFreeNeighbor(spawn.x, spawn.y, scenario, seen)) warnings.push(`spawn ${i} at (${spawn.x},${spawn.y}) is boxed in by walls`)
  }
  return { errors, warnings }
}

function hasFreeNeighbor(x: number, y: number, scenario: Scenario, seen: Map<string, string>): boolean {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && ny >= 0 && nx < scenario.width && ny < scenario.height && !seen.has(`${nx},${ny}`)) return true
  }
  return false
}
