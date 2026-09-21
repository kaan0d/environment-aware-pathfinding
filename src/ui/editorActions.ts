import { BUILDING_TYPES } from '../sim/config'
import { occupiedCells } from '../sim/scenario'
import type { Scenario, WallLevel } from '../sim/types'

// Editing works on the Scenario alone; both worlds are rebuilt from it afterwards.
// Every action returns false and leaves the scenario untouched when it is not allowed.

export type Selection = { kind: 'wall'; index: number } | { kind: 'building'; index: number }

const inside = (s: Scenario, x: number, y: number) => x >= 0 && y >= 0 && x < s.width && y < s.height
const marked = (s: Scenario, x: number, y: number) =>
  s.spawns.some((p) => p.x === x && p.y === y) || s.deployments.some((d) => d.x === x && d.y === y)

export function paintWall(s: Scenario, x: number, y: number, level: WallLevel): boolean {
  if (!inside(s, x, y) || marked(s, x, y)) return false
  if (occupiedCells(s).get(`${x},${y}`)?.startsWith('building')) return false
  const wall = s.walls.find((w) => w.x === x && w.y === y)
  if (wall === undefined) {
    s.walls.push({ x, y, level })
    return true
  }
  if (wall.level === level && wall.hp === undefined) return false
  wall.level = level
  delete wall.hp
  return true
}

// Removes the wall on the cell, or else the building covering it.
export function erase(s: Scenario, x: number, y: number): boolean {
  const wall = s.walls.findIndex((w) => w.x === x && w.y === y)
  if (wall >= 0) {
    s.walls.splice(wall, 1)
    return true
  }
  const building = buildingIndexAt(s, x, y)
  if (building < 0) return false
  s.buildings.splice(building, 1)
  return true
}

export function placeBuilding(s: Scenario, type: string, x: number, y: number): boolean {
  const size = BUILDING_TYPES[type]
  if (!size || !fits(s, x, y, size.w, size.h)) return false
  s.buildings.push({ type, x, y })
  return true
}

// True when the footprint is inside the map and empty; also used for the placement preview.
export function fits(s: Scenario, x: number, y: number, w: number, h: number): boolean {
  const taken = occupiedCells(s)
  for (let cy = y; cy < y + h; cy++) {
    for (let cx = x; cx < x + w; cx++) if (!inside(s, cx, cy) || taken.has(`${cx},${cy}`) || marked(s, cx, cy)) return false
  }
  return true
}

// Adds a spawn point on a free cell, or removes the one already there.
export function toggleSpawn(s: Scenario, x: number, y: number): boolean {
  const index = s.spawns.findIndex((p) => p.x === x && p.y === y)
  if (index >= 0) {
    s.spawns.splice(index, 1)
    return true
  }
  if (!inside(s, x, y) || occupiedCells(s).has(`${x},${y}`)) return false
  s.spawns.push({ x, y })
  return true
}

export function buildingIndexAt(s: Scenario, x: number, y: number): number {
  return s.buildings.findIndex((b) => {
    const size = BUILDING_TYPES[b.type]
    return size !== undefined && x >= b.x && x < b.x + size.w && y >= b.y && y < b.y + size.h
  })
}

export function selectAt(s: Scenario, x: number, y: number): Selection | null {
  const wall = s.walls.findIndex((w) => w.x === x && w.y === y)
  if (wall >= 0) return { kind: 'wall', index: wall }
  const building = buildingIndexAt(s, x, y)
  return building >= 0 ? { kind: 'building', index: building } : null
}

export function setHp(s: Scenario, selection: Selection, hp: number): boolean {
  if (!(hp > 0)) return false
  const target = selection.kind === 'wall' ? s.walls[selection.index] : s.buildings[selection.index]
  if (target === undefined) return false
  target.hp = hp
  return true
}

// The n free cells nearest to (x, y), spiralling outwards; used to spread a group drop around the click.
export function scatterCells(s: Scenario, x: number, y: number, n: number, isFree: (x: number, y: number) => boolean): { x: number; y: number }[] {
  const taken = occupiedCells(s)
  const cells: { x: number; y: number }[] = []
  for (let radius = 0; radius <= Math.max(s.width, s.height) && cells.length < n; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || cells.length >= n) continue
        const cx = x + dx
        const cy = y + dy
        if (inside(s, cx, cy) && !taken.has(`${cx},${cy}`) && isFree(cx, cy)) cells.push({ x: cx, y: cy })
      }
    }
  }
  return cells
}
