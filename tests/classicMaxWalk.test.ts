import { describe, expect, it } from 'vitest'
import { lCornerScenario } from './fixtures'
import { World } from '../src/sim/world'

describe('ClassicPlanner: maxWalk (scenario.classicMaxWalk)', () => {
  it('unset uses the CLASSIC_MAX_WALK default (config.ts, 40), comfortably above this L-corner detour (~34 cells)', () => {
    const world = new World(lCornerScenario(1))
    world.run(200)
    expect(world.stats().wallsDestroyed).toBe(0)
  })

  it('past the limit, tries a wall first instead of the long way around', () => {
    const scenario = { ...lCornerScenario(1), classicMaxWalk: 10 }
    const world = new World(scenario)
    world.run(200)
    expect(world.stats().wallsDestroyed).toBe(1)
  })

  it('under the limit, still just walks - the cap only fires when the way around is actually too long', () => {
    const scenario = { ...lCornerScenario(1), classicMaxWalk: 100 }
    const world = new World(scenario)
    world.run(200)
    expect(world.stats().wallsDestroyed).toBe(0)
  })
})
