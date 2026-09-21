import { describe, expect, it } from 'vitest'
import { BUILDING_TYPES, MAX_ATTACK_POSITIONS } from '../src/sim/config'
import { DIR_DX, DIR_DY, Grid } from '../src/sim/grid'

const dirOf = (dx: number, dy: number) => DIR_DX.findIndex((v, i) => v === dx && DIR_DY[i] === dy)

describe('Grid', () => {
  it('allows a diagonal step when both orthogonal neighbors are free', () => {
    const grid = new Grid(3, 3)
    expect(grid.stepTarget(grid.cellAt(0, 0), dirOf(1, 1))).toBe(grid.cellAt(1, 1))
  })

  it('rejects a diagonal step when either orthogonal neighbor is blocked', () => {
    const grid = new Grid(3, 3)
    grid.placeWall(1, 0, 1)
    expect(grid.stepTarget(grid.cellAt(0, 0), dirOf(1, 1))).toBe(-1)
    expect(grid.stepTarget(grid.cellAt(1, 1), dirOf(-1, -1))).toBe(-1)
  })

  it('refuses to place onto an occupied or out-of-bounds cell', () => {
    const grid = new Grid(3, 3)
    grid.placeWall(1, 1, 1)
    expect(() => grid.placeWall(1, 1, 2)).toThrow()
    expect(() => grid.placeBuilding(BUILDING_TYPES.tower, 2, 2)).toThrow()
  })

  it('frees a multi-cell building footprint and grows neighbor slots when it dies', () => {
    const grid = new Grid(8, 8)
    grid.placeWall(2, 3, 1)
    const tower = grid.placeBuilding(BUILDING_TYPES.tower, 3, 3)
    const out = new Int32Array(MAX_ATTACK_POSITIONS)
    const wall = grid.cellAt(2, 3)

    expect(grid.attackPositions('wall', wall, out)).toBe(6)
    grid.destroyBuilding(tower.id)

    expect(grid.attackPositions('wall', wall, out)).toBe(8)
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) expect(grid.isWalkable(grid.cellAt(x, y))).toBe(true)
  })
})
