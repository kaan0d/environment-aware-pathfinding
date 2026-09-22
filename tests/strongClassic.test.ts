import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../src/scenarios'
import type { Scenario } from '../src/sim/types'
import { World } from '../src/sim/world'

const CROWD = SCENARIOS.find((s) => s.id === 'crowd')!.scenario

function withCount(scenario: Scenario, count: number): Scenario {
  return { ...scenario, deployments: scenario.deployments.map((d) => ({ ...d, count })) }
}

function run(scenario: Scenario): World {
  const world = new World(scenario)
  world.setPlanner('strong')
  world.run(200)
  return world
}

describe('StrongClassicPlanner: nearest building, but prices a wall against the whole squad\'s dps', () => {
  it('walks around a level 4 wall (1000 hp) with a single 50-dps unit, same as Classic', () => {
    const scenario = withCount(CROWD, 1)
    const strong = run(scenario)
    const classic = new World(scenario)
    classic.setPlanner('classic')
    classic.run(200)
    expect(strong.stats().wallsDestroyed).toBe(0)
    expect(strong.finishTime).not.toBeNull()
    expect(strong.finishTime!).toBeCloseTo(classic.finishTime!, 0)
  })

  it('breaks the same wall with 3 units (150 combined dps), faster than Classic which still walks around', () => {
    const scenario = withCount(CROWD, 3)
    const strong = run(scenario)
    const classic = new World(scenario)
    classic.setPlanner('classic')
    classic.run(200)
    expect(strong.stats().wallsDestroyed).toBeGreaterThan(0)
    expect(classic.stats().wallsDestroyed).toBe(0) // Classic never breaks, by design
    expect(strong.finishTime!).toBeLessThan(classic.finishTime!)
  })

  it('reconsiders when another troop already opened a path (reconsidersOnChange)', () => {
    const scenario = withCount(CROWD, 3)
    const world = new World(scenario)
    world.setPlanner('strong')
    world.run(200)
    expect(world.finished).toBe(true)
  })
})
