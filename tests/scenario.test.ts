import { describe, expect, it } from 'vitest'
import { L_CORNER } from '../src/scenarios'
import { cloneScenario, validateScenario } from '../src/sim/scenario'
import type { Scenario } from '../src/sim/types'
import { World } from '../src/sim/world'

const base = (): Scenario => cloneScenario(L_CORNER)

describe('validateScenario', () => {
  it('accepts the L corner', () => {
    expect(validateScenario(base())).toEqual({ errors: [], warnings: [] })
  })

  it('reports overlaps and cells outside the map', () => {
    const s = base()
    s.walls.push({ x: 26, y: 6, level: 1 }) // on the depot
    s.walls.push({ x: 99, y: 2, level: 1 })
    s.buildings.push({ type: 'tower', x: 39, y: 27 }) // 2x2 sticks out
    const { errors } = validateScenario(s)
    expect(errors.some((e) => e.includes('building 0 at (26,6) overlaps wall'))).toBe(true)
    expect(errors.filter((e) => e.includes('outside the map')).length).toBe(4)
  })

  it('reports unknown types and deployments on solid cells', () => {
    const s = base()
    s.buildings.push({ type: 'castle', x: 1, y: 1 })
    s.deployments.push({ t: 0, troopType: 'dragon', x: 20, y: 3 })
    const { errors } = validateScenario(s)
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown type "castle"'),
        expect.stringContaining('unknown troop type "dragon"'),
        expect.stringContaining('lands on a wall'),
      ]),
    )
  })

  it('warns about a boxed-in spawn and an empty map', () => {
    const s = base()
    s.spawns = [{ x: 0, y: 0 }]
    s.walls.push({ x: 1, y: 0, level: 1 }, { x: 0, y: 1, level: 1 })
    s.buildings = []
    const { warnings } = validateScenario(s)
    expect(warnings.some((w) => w.includes('boxed in'))).toBe(true)
    expect(warnings.some((w) => w.includes('no building'))).toBe(true)
  })

  it('agrees with World: what validates loads, what is an error throws', () => {
    expect(() => new World(base())).not.toThrow()
    const bad = base()
    bad.walls.push({ x: 26, y: 6, level: 1 })
    expect(validateScenario(bad).errors.length).toBeGreaterThan(0)
    expect(() => new World(bad)).toThrow()
  })
})

describe('scenario overrides', () => {
  it('scales wall hp and honors explicit hit points', () => {
    const s = base()
    s.wallHpScale = 2
    s.walls[3].hp = 7
    s.buildings[0].hp = 50
    const world = new World(s)
    const at = (i: number) => world.grid.cellAt(s.walls[i].x, s.walls[i].y)
    expect(world.grid.hp[at(0)]).toBe(200)
    expect(world.grid.hp[at(3)]).toBe(7)
    expect(world.grid.maxHp[at(3)]).toBe(7)
    expect(world.grid.buildings[0].hp).toBe(50)
  })
})

describe('World.addDeployment', () => {
  it('lands a troop mid-run and keeps waiting troops in time order', () => {
    const s = base()
    s.deployments = [{ t: 5, troopType: 'fast', x: 12, y: 8 }]
    const world = new World(s)
    for (let i = 0; i < 30; i++) world.step()
    world.addDeployment({ t: world.time, troopType: 'balanced', x: 12, y: 6 })
    expect(world.troops.map((t) => t.type.id)).toEqual(['balanced', 'fast'])
    expect(world.troops.map((t) => t.id)).toEqual([0, 1])
    world.step()
    expect(world.troops[0].state).not.toBe('notSpawned')
    expect(world.troops[1].state).toBe('notSpawned')
  })

  it('rejects a solid cell', () => {
    const world = new World(base())
    expect(() => world.addDeployment({ t: 0, troopType: 'fast', x: 20, y: 3 })).toThrow()
  })
})
