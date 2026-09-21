import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../src/scenarios'
import { cloneScenario, validateScenario } from '../src/sim/scenario'
import { World } from '../src/sim/world'

type Scenario = (typeof SCENARIOS)[number]['scenario']

function run(scenario: Scenario, planner: 'classic' | 'squad', stackAttackers = true): World {
  const world = new World({ ...scenario, stackAttackers })
  world.setPlanner(planner)
  world.run(600)
  return world
}

describe('ready-made scenarios', () => {
  const times: string[] = []

  for (const entry of SCENARIOS) {
    describe(entry.name, () => {
      it('is valid and every troop starts on a free cell', () => {
        const { errors, warnings } = validateScenario(entry.scenario)
        expect(errors).toEqual([])
        expect(warnings).toEqual([])
      })

      it.each([true, false])('finishes under both algorithms within 10 simulated minutes (stacking %s)', (stack) => {
        const classic = run(entry.scenario, 'classic', stack)
        const fresh = run(entry.scenario, 'squad', stack)
        expect(classic.finished).toBe(true)
        expect(fresh.finished).toBe(true)
        times.push(`${entry.name} [${stack ? 'stacking' : 'positions'}]: classic ${classic.finishTime!.toFixed(2)} s, new ${fresh.finishTime!.toFixed(2)} s`)
      })
    })
  }

  it('prints the results', () => {
    console.log(times.join('\n'))
  })

  it('has a description for each scenario and unique ids', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
    expect(SCENARIOS.every((s) => s.description.length > 40)).toBe(true)
  })

  it('shows the crowd threshold of scenario 7: 1 and 2 units walk around, 3 or more break the wall', () => {
    const entry = SCENARIOS.find((s) => s.id === 'crowd')!
    const breaks = [1, 2, 3, 4, 6].map((count) => {
      const scenario = cloneScenario(entry.scenario)
      scenario.deployments = [{ t: 0, troopType: 'balanced', x: 12, y: 6, count }]
      return run(scenario, 'squad').stats().wallsDestroyed > 0
    })
    expect(breaks).toEqual([false, false, true, true, true])
  })

  // The new algorithm should never lose on the maps built to show it winning; the closed ones may tie.
  for (const id of ['l-corner', 'castle', 'double-layer', 'no-way', 'maze', 'mixed-levels']) {
    it(`does not lose to classic on ${id}`, () => {
      const entry = SCENARIOS.find((s) => s.id === id)!
      const classic = run(entry.scenario, 'classic').finishTime!
      const fresh = run(entry.scenario, 'squad').finishTime!
      expect(fresh).toBeLessThanOrEqual(classic * 1.02)
    })
  }
})
