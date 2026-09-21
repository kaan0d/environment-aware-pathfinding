import { WALL_HP } from './config'
import { CellKind, traversalOf } from './environment'
import type { Building, BuildingType, TargetKind, WallLevel } from './types'

// Eight directions, row-major order; diagonals are the entries where both offsets are non-zero.
export const DIR_DX: readonly number[] = [-1, 0, 1, -1, 1, -1, 0, 1]
export const DIR_DY: readonly number[] = [-1, -1, -1, 0, 0, 1, 1, 1]
export const DIR_COST: readonly number[] = DIR_DX.map((dx, i) => (dx !== 0 && DIR_DY[i] !== 0 ? Math.SQRT2 : 1))

export class Grid {
  readonly kind: Uint8Array // zero-filled, which is CellKind.empty
  readonly wallLevel: Uint8Array
  readonly hp: Float32Array // wall cells only; building hp lives on the Building
  readonly buildingId: Int32Array // -1 where no building stands
  readonly buildings: Building[] = []

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const size = width * height
    this.kind = new Uint8Array(size)
    this.wallLevel = new Uint8Array(size)
    this.hp = new Float32Array(size)
    this.buildingId = new Int32Array(size).fill(-1)
  }

  get size(): number {
    return this.width * this.height
  }

  cellAt(x: number, y: number): number {
    return y * this.width + x
  }

  cellOfPoint(px: number, py: number): number {
    return this.cellAt(Math.floor(px), Math.floor(py))
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  isWalkable(cell: number): boolean {
    return traversalOf(this.kind[cell]) === 'passable'
  }

  // Neighbor reached by dir, or -1 when blocked, out of bounds, or corner-cutting.
  stepTarget(cell: number, dir: number): number {
    const x = cell % this.width
    const y = (cell - x) / this.width
    const nx = x + DIR_DX[dir]
    const ny = y + DIR_DY[dir]
    if (!this.inBounds(nx, ny)) return -1
    const target = this.cellAt(nx, ny)
    if (!this.isWalkable(target)) return -1
    if (nx === x || ny === y) return target
    return this.isWalkable(this.cellAt(nx, y)) && this.isWalkable(this.cellAt(x, ny)) ? target : -1
  }

  placeWall(x: number, y: number, level: WallLevel): void {
    const cell = this.requireFreeCell(x, y)
    this.kind[cell] = CellKind.wall
    this.wallLevel[cell] = level
    this.hp[cell] = WALL_HP[level - 1]
  }

  placeBuilding(type: BuildingType, x: number, y: number): Building {
    const building: Building = { id: this.buildings.length, type, x, y, w: type.w, h: type.h, hp: type.hp, alive: true }
    for (let by = y; by < y + type.h; by++) {
      for (let bx = x; bx < x + type.w; bx++) {
        const cell = this.requireFreeCell(bx, by)
        this.kind[cell] = CellKind.building
        this.buildingId[cell] = building.id
      }
    }
    this.buildings.push(building)
    return building
  }

  destroyWall(cell: number): void {
    this.kind[cell] = CellKind.empty
    this.wallLevel[cell] = 0
    this.hp[cell] = 0
  }

  destroyBuilding(id: number): void {
    const building = this.buildings[id]
    building.alive = false
    building.hp = 0
    for (let by = building.y; by < building.y + building.h; by++) {
      for (let bx = building.x; bx < building.x + building.w; bx++) {
        const cell = this.cellAt(bx, by)
        this.kind[cell] = CellKind.empty
        this.buildingId[cell] = -1
      }
    }
  }

  // Fills out with the free cells ringing the target's footprint and returns how many; out needs MAX_ATTACK_POSITIONS slots.
  attackPositions(targetKind: TargetKind, targetId: number, out: Int32Array): number {
    let x0: number, y0: number, w: number, h: number
    if (targetKind === 'wall') {
      x0 = targetId % this.width
      y0 = Math.floor(targetId / this.width)
      w = h = 1
    } else {
      const building = this.buildings[targetId]
      ;({ x: x0, y: y0, w, h } = building)
    }
    let count = 0
    for (let y = y0 - 1; y <= y0 + h; y++) {
      for (let x = x0 - 1; x <= x0 + w; x++) {
        const insideFootprint = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h
        if (insideFootprint || !this.inBounds(x, y)) continue
        const cell = this.cellAt(x, y)
        if (this.isWalkable(cell)) out[count++] = cell
      }
    }
    return count
  }

  private requireFreeCell(x: number, y: number): number {
    if (!this.inBounds(x, y) || !this.isWalkable(this.cellAt(x, y))) throw new Error(`cell (${x},${y}) is not free`)
    return this.cellAt(x, y)
  }
}
