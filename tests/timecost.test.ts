import { describe, expect, it } from 'vitest'
import { runComparison } from '../src/sim/compare'
import { World } from '../src/sim/world'
import type { WallLevel } from '../src/sim/types'
import {
  crowdedWallScenario,
  gapScenario,
  lCornerDirectPlan,
  lCornerScenario,
  runToEnd,
  sealedScenario,
  walledDepotScenario,
} from './fixtures'

function timecostWorld(scenario = lCornerScenario()): World {
  const world = new World(scenario)
  world.setPlanner('timecost')
  return world
}

describe('time-cost planner, one unit', () => {
  it('breaks a cheap wall and finishes far ahead of the classic detour', () => {
    const { classic, timecost } = runComparison(lCornerScenario(1))
    const forced = new World(lCornerScenario(1))
    forced.forcePlan(0, lCornerDirectPlan())
    runToEnd(forced)
    console.log(
      `L corner level 1: classic ${classic.finishTime!.toFixed(2)} s, time-cost ${timecost.finishTime!.toFixed(2)} s, ` +
        `hand-written direct ${forced.finishTime!.toFixed(2)} s`,
    )
    expect(timecost.stats().wallsDestroyed).toBe(1)
    expect(timecost.finishTime!).toBeLessThan(classic.finishTime! * 0.75)
    expect(timecost.finishTime!).toBeLessThanOrEqual(forced.finishTime! * 1.05)
  })

  it('walks around a strong wall like the classic AI and never hits it', () => {
    const { classic, timecost } = runComparison(lCornerScenario(5))
    expect(timecost.stats().wallsDestroyed).toBe(0)
    expect(timecost.finishTime!).toBeLessThanOrEqual(classic.finishTime! * 1.03)
  })

  it('lets a weak fast unit detour while a strong heavy unit breaks the same wall', () => {
    const fast = runComparison(lCornerScenario(2, 'fast')).timecost
    const heavy = runComparison(lCornerScenario(2, 'heavy')).timecost
    expect(fast.stats().wallsDestroyed).toBe(0)
    expect(heavy.stats().wallsDestroyed).toBe(1)
  })

  it('breaks in when no path exists and finishes', () => {
    const world = runToEnd(timecostWorld(sealedScenario()))
    expect(world.finished).toBe(true)
    expect(world.stats().wallsDestroyed).toBeGreaterThanOrEqual(1)
  })

  it('picks the open far depot over the nearer one behind thick walls', () => {
    const { classic, timecost } = runComparison(walledDepotScenario())
    const firstDepot = (world: World) => world.events.find((e) => e.type === 'buildingDestroyed')
    expect(firstDepot(classic)).toMatchObject({ buildingId: 0 }) // straight-line nearest, hit through 40 s of wall
    expect(firstDepot(timecost)).toMatchObject({ buildingId: 1 })
    expect(firstDepot(timecost)!.t).toBeLessThan(firstDepot(classic)!.t)
  })

  it('predicts its own finish time within 5% for a single unit', () => {
    const rows: string[] = []
    for (const troopType of ['fast', 'balanced', 'heavy']) {
      for (const level of [1, 2, 5] as WallLevel[]) {
        const world = timecostWorld(lCornerScenario(level, troopType))
        world.step()
        const estimate = world.troops[0].plan!.estTotalTime
        runToEnd(world)
        const error = Math.abs(estimate - world.finishTime!) / world.finishTime!
        rows.push(`${troopType} level ${level}: est ${estimate.toFixed(2)} s, real ${world.finishTime!.toFixed(2)} s, ${(error * 100).toFixed(1)}%`)
        expect(error).toBeLessThan(0.05)
      }
    }
    console.log(rows.join('\n'))
  })

  it('replays to identical events and stats', () => {
    const scenario = crowdedWallScenario()
    const a = runToEnd(timecostWorld(scenario))
    const b = runToEnd(timecostWorld(scenario))
    expect(a.finished).toBe(true)
    expect(JSON.stringify([a.events, a.stats()])).toBe(JSON.stringify([b.events, b.stats()]))
  })
})

// Two open rows in a wall; the troop starts on the route through the first, then the second opens.
function reopenSecondGap(firstRow: number, secondRow: number) {
  const onlyFirst = timecostWorld(gapScenario([firstRow]))
  onlyFirst.step()
  const onlySecond = timecostWorld(gapScenario([secondRow]))
  onlySecond.step()
  const ratio = onlySecond.troops[0].plan!.estTotalTime / onlyFirst.troops[0].plan!.estTotalTime

  const troop = onlyFirst.troops[0]
  const before = troop.plan
  onlyFirst.grid.destroyWall(onlyFirst.grid.cellAt(15, secondRow))
  onlyFirst.notifyMapChanged()
  return { ratio, troop, before }
}

describe('hysteresis and triggers', () => {
  it('keeps its plan when the new route is less than 10% faster', () => {
    const { ratio, troop, before } = reopenSecondGap(18, 16)
    console.log(`gap 16 instead of 18: new route takes ${(ratio * 100).toFixed(1)}% of the old`)
    expect(ratio).toBeGreaterThan(0.9)
    expect(ratio).toBeLessThan(1)
    expect(troop.plan).toBe(before)
    expect(troop.planChanges).toBe(0)
  })

  it('switches when the new route is more than 10% faster', () => {
    const { ratio, troop, before } = reopenSecondGap(22, 11)
    console.log(`gap 11 instead of 22: new route takes ${(ratio * 100).toFixed(1)}% of the old`)
    expect(ratio).toBeLessThan(0.9)
    expect(troop.plan).not.toBe(before)
    expect(troop.planChanges).toBe(1)
  })

  it('reroutes a walking unit through a hole another unit just made', () => {
    const world = timecostWorld(crowdedWallScenario())
    while (!world.events.some((e) => e.type === 'wallDestroyed')) world.step()
    const late = world.troops[1]
    const throughWall = late.plan!.route.some((cell) => cell % 15 === 8 && Math.floor(cell / 15) < 18)
    expect(late.planChanges).toBeGreaterThanOrEqual(1)
    expect(throughWall).toBe(true)

    const { classic, timecost } = runComparison(crowdedWallScenario())
    console.log(
      `crowded wall: classic ${classic.finishTime!.toFixed(2)} s, time-cost ${timecost.finishTime!.toFixed(2)} s, ` +
        `plan changes ${timecost.troops.map((t) => t.planChanges).join('/')}`,
    )
    expect(timecost.finishTime!).toBeLessThan(classic.finishTime!)
    expect(Math.max(...timecost.troops.map((t) => t.planChanges))).toBeLessThanOrEqual(3)
  })
})
