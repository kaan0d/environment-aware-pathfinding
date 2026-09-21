import { describe, expect, it } from 'vitest'
import { L_CORNER } from '../src/scenarios'
import type { Scenario } from '../src/sim/types'
import { World } from '../src/sim/world'
import { Session } from '../src/ui/session'
import { barrierScenario, eventTime, rowPlan, runFixedPlans } from './fixtures3'
import { singleSlotScenario } from './fixtures'

const stacked = (s: Scenario, stackAttackers: boolean): Scenario => ({ ...s, stackAttackers })

describe('attacking from the same cell (stacking)', () => {
  it('is on by default and can be switched off in the scenario', () => {
    const { stackAttackers, ...plain } = barrierScenario(true, 3)
    void stackAttackers
    expect(new World(plain as Scenario).stackAttackers).toBe(true)
    expect(new World(stacked(plain as Scenario, false)).stackAttackers).toBe(false)
  })

  it('lets every troop hit a corridor wall together instead of one at a time', () => {
    const times = [false, true].map((stack) => {
      const scenario = stacked(barrierScenario(true, 8), stack)
      const plan = rowPlan(scenario, 5, 2, 13)
      return eventTime(runFixedPlans(scenario, () => plan, 0, 100), 'wallDestroyed')!
    })
    const arrive = 5 / 2.5
    const [alone, together] = times
    console.log(`corridor wall, 8 troops: one at a time ${alone.toFixed(2)} s, stacked ${together.toFixed(2)} s`)
    expect(alone - arrive).toBeGreaterThan((together - arrive) * 6) // 1000 hp at 50 dps against 8 x 50 dps
    expect(together).toBeCloseTo(arrive + 1000 / (8 * 50), 0)
  })

  it('never makes a troop wait and never reserves a cell', () => {
    const world = new World(stacked(singleSlotScenario(), true))
    world.setPlanner('classic')
    let waited = false
    while (!world.finished && world.time < 200) {
      world.step()
      if (world.troops.some((t) => t.state === 'waiting' || t.attackCell !== -1)) waited = true
    }
    expect(world.finished).toBe(true)
    expect(waited).toBe(false)
  })

  it('finishes the one-position map faster than the position rule does', () => {
    const finish = (stack: boolean) => {
      const world = new World(stacked(singleSlotScenario(), stack))
      world.run(200)
      return world.finishTime!
    }
    expect(finish(true)).toBeLessThan(finish(false))
  })

  it('replays to identical events and stats', () => {
    const run = () => {
      const world = new World(stacked(barrierScenario(false, 12), true))
      world.setPlanner('squad')
      world.run(200)
      return JSON.stringify([world.events, world.stats()])
    }
    expect(run()).toBe(run())
  })

  it('is a session setting: switching it rebuilds both worlds with the new rule', () => {
    const session = new Session(L_CORNER)
    expect(session.classic.stackAttackers).toBe(true)
    session.scenario.stackAttackers = false
    session.reset()
    expect(session.classic.stackAttackers).toBe(false)
    expect(session.fresh.stackAttackers).toBe(false)
  })
})
