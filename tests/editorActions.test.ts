import { describe, expect, it } from 'vitest'
import { L_CORNER } from '../src/scenarios'
import { cloneScenario, validateScenario } from '../src/sim/scenario'
import { World } from '../src/sim/world'
import { erase, fits, paintWall, placeBuilding, scatterCells, selectAt, setHp, toggleSpawn } from '../src/ui/editorActions'

const fresh = () => cloneScenario(L_CORNER)

describe('editor actions', () => {
  it('paints, re-levels and erases walls, and refuses solid or marked cells', () => {
    const s = fresh()
    expect(paintWall(s, 5, 5, 3)).toBe(true)
    expect(paintWall(s, 5, 5, 3)).toBe(false) // already that level
    expect(paintWall(s, 5, 5, 4)).toBe(true)
    expect(s.walls.find((w) => w.x === 5 && w.y === 5)!.level).toBe(4)
    expect(paintWall(s, 26, 6, 1)).toBe(false) // on the depot
    expect(paintWall(s, 12, 6, 1)).toBe(false) // on the spawn and the deployment
    expect(paintWall(s, 40, 3, 1)).toBe(false)
    expect(erase(s, 5, 5)).toBe(true)
    expect(erase(s, 5, 5)).toBe(false)
  })

  it('places multi-cell buildings only where the whole footprint is free', () => {
    const s = fresh()
    expect(placeBuilding(s, 'hq', 5, 15)).toBe(true)
    expect(placeBuilding(s, 'depot', 6, 16)).toBe(false) // inside the hq
    expect(placeBuilding(s, 'tower', 39, 27)).toBe(false) // sticks out
    expect(placeBuilding(s, 'tower', 19, 3)).toBe(false) // overlaps the wall column
    expect(fits(s, 30, 20, 3, 3)).toBe(true)
    expect(erase(s, 7, 17)).toBe(true) // any cell of the hq removes it
    expect(s.buildings.length).toBe(1)
  })

  it('toggles spawn points and selects walls and buildings', () => {
    const s = fresh()
    expect(toggleSpawn(s, 3, 3)).toBe(true)
    expect(toggleSpawn(s, 3, 3)).toBe(true)
    expect(s.spawns.length).toBe(1)
    expect(toggleSpawn(s, 20, 3)).toBe(false) // on a wall
    expect(selectAt(s, 20, 3)).toEqual({ kind: 'wall', index: 3 })
    expect(selectAt(s, 26, 6)).toEqual({ kind: 'building', index: 0 })
    expect(selectAt(s, 1, 1)).toBeNull()
  })

  it('sets hit points for one object and only accepts positive numbers', () => {
    const s = fresh()
    expect(setHp(s, { kind: 'wall', index: 3 }, 40)).toBe(true)
    expect(setHp(s, { kind: 'building', index: 0 }, 0)).toBe(false)
    expect(setHp(s, { kind: 'building', index: 0 }, Number.NaN)).toBe(false)
    const world = new World(s)
    expect(world.grid.hp[world.grid.cellAt(20, 3)]).toBe(40)
  })

  it('scatters a group around a click on free cells only', () => {
    const s = fresh()
    const cells = scatterCells(s, 19, 5, 8, () => true)
    expect(cells.length).toBe(8)
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(8)
    expect(cells.every((c) => c.x !== 20 || c.y > 21)).toBe(true) // never on the wall column
  })

  it('keeps every scenario valid after a run of edits', () => {
    const s = fresh()
    for (let i = 0; i < 40; i++) {
      paintWall(s, 2 + (i % 8), 20 + Math.floor(i / 8), ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5)
      if (i % 7 === 0) erase(s, 2 + (i % 8), 20)
    }
    placeBuilding(s, 'tower', 30, 20)
    expect(validateScenario(s).errors).toEqual([])
    expect(() => new World(s)).not.toThrow()
  })
})
