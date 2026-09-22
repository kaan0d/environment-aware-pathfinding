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

// Cells on the straight line from (x0,y0) to (x1,y1), inclusive, by Bresenham's algorithm.
export function lineCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    cells.push({ x, y })
    if (x === x1 && y === y1) return cells
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

// The border cells (one cell thick) of the rectangle spanned by the two corners, inclusive.
export function rectOutlineCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  const cells: { x: number; y: number }[] = []
  for (let x = minX; x <= maxX; x++) {
    cells.push({ x, y: minY })
    if (maxY !== minY) cells.push({ x, y: maxY })
  }
  for (let y = minY + 1; y < maxY; y++) {
    cells.push({ x: minX, y })
    if (maxX !== minX) cells.push({ x: maxX, y })
  }
  return cells
}

// Paints a wall on every cell of the list at the given level; returns how many cells actually changed.
export function paintCells(s: Scenario, cells: { x: number; y: number }[], level: WallLevel): number {
  let count = 0
  for (const { x, y } of cells) if (paintWall(s, x, y, level)) count++
  return count
}

export interface ClipEntry {
  dx: number // offset from the copied rectangle's top-left corner
  dy: number
  wall?: WallLevel
  buildingType?: string
}

// Every wall and building whose own cell falls inside the rectangle, as offsets from its top-left corner.
export function copyRegion(s: Scenario, x0: number, y0: number, x1: number, y1: number): ClipEntry[] {
  const minX = Math.min(x0, x1)
  const minY = Math.min(y0, y1)
  const maxX = Math.max(x0, x1)
  const maxY = Math.max(y0, y1)
  const entries: ClipEntry[] = []
  for (const w of s.walls) if (w.x >= minX && w.x <= maxX && w.y >= minY && w.y <= maxY) entries.push({ dx: w.x - minX, dy: w.y - minY, wall: w.level })
  for (const b of s.buildings) if (b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY) entries.push({ dx: b.x - minX, dy: b.y - minY, buildingType: b.type })
  return entries
}

// Pastes a copied region anchored at (x, y); a cell that does not fit (out of bounds, occupied) is skipped.
// Returns how many entries were actually placed.
export function pasteRegion(s: Scenario, entries: ClipEntry[], x: number, y: number): number {
  let count = 0
  for (const e of entries) {
    const cx = x + e.dx
    const cy = y + e.dy
    if (e.wall !== undefined && paintWall(s, cx, cy, e.wall)) count++
    else if (e.buildingType !== undefined && placeBuilding(s, e.buildingType, cx, cy)) count++
  }
  return count
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
