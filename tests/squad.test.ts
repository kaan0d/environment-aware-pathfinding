import { describe, expect, it } from 'vitest'
import { Grid } from '../src/sim/grid'
import { breakTime } from '../src/sim/planner/breakTime'
import { Rollout } from '../src/sim/planner/rollout'
import { clusterSquads } from '../src/sim/planner/squad'
import { SquadPlanner } from '../src/sim/planner/squadPlanner'
import { SlotFinder } from '../src/sim/slots'
import { Troop } from '../src/sim/troop'
import { TROOP_TYPES } from '../src/sim/config'
import { World } from '../src/sim/world'
import type { Scenario } from '../src/sim/types'
import { crowdedWallScenario, sealedScenario, walledDepotScenario } from './fixtures'
import { barrierScenario, crowdScenario, eventTime, rowPlan, runFixedPlans } from './fixtures3'

describe('breakTime', () => {
  it('divides hp by dps for one hitter', () => {
    expect(breakTime(100, [3], [50], 4)).toBeCloseTo(3 + 2)
  })

  it('adds damage as later troops arrive', () => {
    // 50 dps from t=0; 50 more from t=1: 50 damage by t=1, then 100 dps for the last 50 hp
    expect(breakTime(100, [0, 1], [50, 50], 4)).toBeCloseTo(1.5)
  })

  it('lets only the first arrivals hit when attack positions run out', () => {
    const arrivals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const dps = arrivals.map(() => 10)
    expect(breakTime(300, arrivals, dps, 3)).toBeCloseTo(10)
    expect(breakTime(300, arrivals, dps, 10)).toBeCloseTo(3)
  })

  it('ignores troops that never arrive and reports a wall nobody can hit', () => {
    expect(breakTime(100, [0, Infinity], [50, 500], 2)).toBeCloseTo(2)
    expect(breakTime(100, [Infinity], [50], 2)).toBe(Infinity)
    expect(breakTime(100, [0], [50], 0)).toBe(Infinity)
  })
})

describe('clusterSquads', () => {
  const troopAt = (id: number, x: number) => {
    const troop = new Troop(id, TROOP_TYPES.balanced, 0, 0, 0)
    troop.x = x
    troop.y = 0
    return troop
  }

  it('joins troops through a chain and keeps distant ones apart', () => {
    const troops = [troopAt(0, 0), troopAt(1, 4), troopAt(2, 8), troopAt(3, 30), troopAt(4, 33)]
    expect(clusterSquads(troops, 5).map((squad) => squad.map((t) => t.id))).toEqual([[0, 1, 2], [3, 4]])
  })

  it('makes every troop its own squad at radius zero', () => {
    const troops = [troopAt(0, 0), troopAt(1, 1)]
    expect(clusterSquads(troops, 0).map((squad) => squad.length)).toEqual([1, 1])
  })
})

describe('SlotFinder', () => {
  it('counts only the positions on the reachable side of a wall', () => {
    const grid = new Grid(7, 5)
    for (let y = 0; y < 5; y++) grid.placeWall(3, y, 1)
    const finder = new SlotFinder(grid)
    expect(finder.search('wall', grid.cellAt(3, 2), grid.cellAt(2, 2), null)).toBe(3)
    expect(finder.search('wall', grid.cellAt(3, 2), grid.cellAt(4, 2), null)).toBe(3)
  })

  it('skips taken positions and returns a walkable path to the nearest free one', () => {
    const grid = new Grid(7, 5)
    for (let y = 0; y < 5; y++) grid.placeWall(3, y, 1)
    const finder = new SlotFinder(grid)
    const taken = new Set([grid.cellAt(2, 2)])
    const count = finder.search('wall', grid.cellAt(3, 2), grid.cellAt(2, 2), (cell) => taken.has(cell))
    expect(count).toBe(2)
    const path = finder.pathTo(finder.found[0])
    expect(path[0]).toBe(grid.cellAt(2, 2))
    expect(path.length).toBe(2)
  })
})

describe('attack slots in the simulation', () => {
  // Every troop walks the same straight route through the wall on row 5; measure when the wall falls.
  function wallFalls(corridor: boolean, count: number) {
    const scenario = barrierScenario(corridor, count)
    const plan = rowPlan(scenario, 5, 2, 13)
    const world = runFixedPlans(scenario, () => plan, 0, 60)
    return { world, wall: eventTime(world, 'wallDestroyed')! }
  }

  it('does not speed a wall up beyond its attack positions', () => {
    const rows: string[] = []
    for (const corridor of [true, false]) {
      const times = [3, 8, 50].map((n) => wallFalls(corridor, n).wall)
      rows.push(`${corridor ? 'corridor, 1 position' : 'barrier, 3 positions'}: 3 troops ${times[0].toFixed(2)} s, 8 troops ${times[1].toFixed(2)} s, 50 troops ${times[2].toFixed(2)} s`)
      expect(Math.abs(times[1] - times[0])).toBeLessThan(0.6)
      expect(Math.abs(times[2] - times[0])).toBeLessThan(0.6)
    }
    console.log(rows.join('\n'))
  })

  it('scales the wall time with the number of positions', () => {
    const arrive = 5 / TROOP_TYPES.balanced.speed // five cells to the wall
    const corridor = wallFalls(true, 8).wall - arrive
    const barrier = wallFalls(false, 8).wall - arrive
    console.log(`hit time: corridor ${corridor.toFixed(2)} s, barrier ${barrier.toFixed(2)} s, ratio ${(corridor / barrier).toFixed(2)}`)
    expect(corridor / barrier).toBeGreaterThan(2.5)
    expect(corridor / barrier).toBeLessThan(3.5)
  })

  it('predicts the wall time within 10% with the rollout', () => {
    for (const corridor of [true, false]) {
      const scenario = barrierScenario(corridor, 8)
      const plan = rowPlan(scenario, 5, 2, 13)
      const world = new World(scenario)
      world.planner = { plan: () => plan }
      world.step()
      const predicted = new Rollout(world.grid).run(world, world.troops, plan.route, 0).stageTimes[0] + world.time
      const actual = eventTime(runFixedPlans(scenario, () => plan, 0, 60), 'wallDestroyed')!
      console.log(`${corridor ? 'corridor' : 'barrier'}: predicted ${predicted.toFixed(2)} s, real ${actual.toFixed(2)} s`)
      expect(Math.abs(predicted - actual) / actual).toBeLessThan(0.1)
    }
  })
})

describe('crowd size', () => {
  it('turns from walking around to breaking the wall as the group grows', () => {
    const rows: string[] = []
    const breaks: boolean[] = []
    for (let n = 1; n <= 8; n++) {
      const world = new World(crowdScenario(4, n))
      world.setPlanner('squad')
      world.run(300)
      const classic = new World(crowdScenario(4, n))
      classic.run(300)
      breaks.push(world.stats().wallsDestroyed > 0)
      rows.push(`${n}: squad ${world.finishTime!.toFixed(2)} s (${breaks[n - 1] ? 'breaks' : 'walks around'}), classic ${classic.finishTime!.toFixed(2)} s`)
    }
    const threshold = breaks.indexOf(true) + 1
    console.log(`level 4 wall, balanced troops\n${rows.join('\n')}\nthreshold: ${threshold} troops`)
    expect(breaks[0]).toBe(false)
    expect(threshold).toBeGreaterThan(1)
    expect(breaks.slice(threshold - 1).every(Boolean)).toBe(true)
  })

  it('counts troops that are still walking towards the wall', () => {
    // one troop stands by the wall, ten more are four cells back; level 4 is 20 s of hitting for one troop alone
    const near = 1
    const scenario = {
      ...crowdScenario(4, near),
      deployments: [
        { t: 0, troopType: 'balanced', x: 5, y: 2, count: near },
        { t: 0, troopType: 'balanced', x: 5, y: 6, count: 10 },
      ],
    }
    const alone = new World(crowdScenario(4, 1))
    alone.setPlanner('squad')
    alone.run(300)
    const group = new World(scenario)
    group.setPlanner('squad')
    group.step()
    const planner = group.planner as SquadPlanner
    const best = planner.evaluate(group, group.troops)[0]
    group.run(300)
    console.log(`one troop alone: ${alone.stats().wallsDestroyed ? 'breaks' : 'walks around'}; with ten arriving: ${best.plans.get(0)!.breakCells.length ? 'breaks' : 'walks around'}, estimated ${(best.total + 1 / 30).toFixed(2)} s, real ${group.finishTime!.toFixed(2)} s (whole depot)`)
    expect(alone.stats().wallsDestroyed).toBe(0)
    expect(group.stats().wallsDestroyed).toBe(1)
    expect(Math.abs(best.total + 1 / 30 - group.finishTime!) / group.finishTime!).toBeLessThan(0.1)
  })
})

// Depot inside a thin outer ring (level 1) and a thick inner ring (level 3); the only way in is straight through both.
function doubleLayerScenario(count: number): Scenario {
  const walls: Scenario['walls'] = []
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy))
      if (ring === 1) walls.push({ x: 12 + dx, y: 10 + dy, level: 3 })
      if (ring === 2) walls.push({ x: 12 + dx, y: 10 + dy, level: 1 })
    }
  }
  return {
    name: 'double layer',
    stackAttackers: false,
    width: 30,
    height: 21,
    walls,
    buildings: [{ type: 'depot', x: 12, y: 10 }],
    spawns: [{ x: 2, y: 10 }],
    deployments: [{ t: 0, troopType: 'balanced', x: 2, y: 10, count }],
  }
}

describe('walls in a row', () => {
  it('adds up the break times of an outer and an inner wall and the depot', () => {
    const scenario = doubleLayerScenario(4)
    const plan = rowPlan(scenario, 10, 2, 11)
    const world = new World(scenario)
    world.planner = { plan: () => plan }
    world.step()
    const predicted = new Rollout(world.grid).run(world, world.troops, plan.route, 0).stageTimes.map((t) => t + world.time)
    const run = runFixedPlans(scenario, () => plan, 0, 200)
    const real = [...run.events.filter((e) => e.type === 'wallDestroyed'), ...run.events.filter((e) => e.type === 'buildingDestroyed')].map((e) => e.t)
    console.log(`double layer: predicted ${Array.from(predicted).map((t) => t.toFixed(2)).join(' / ')} s, real ${real.map((t) => t.toFixed(2)).join(' / ')} s`)
    expect(real.length).toBe(3)
    for (let i = 0; i < 3; i++) expect(Math.abs(predicted[i] - real[i]) / real[i]).toBeLessThan(0.1)
    expect(predicted[0]).toBeLessThan(predicted[1])
    expect(predicted[1]).toBeLessThan(predicted[2])
  })

  it('prefers a far open depot to a near one behind two layers of wall', () => {
    const scenario = { ...doubleLayerScenario(4), buildings: [{ type: 'depot', x: 12, y: 10 }, { type: 'depot', x: 27, y: 3 }] }
    const world = new World(scenario)
    for (const troop of world.troops) {
      troop.x = troop.spawnX + 0.5
      troop.y = troop.spawnY + 0.5
    }
    const evaluated = new SquadPlanner(world.grid, true).evaluate(world, world.troops)
    console.log(evaluated.map((e) => `depot ${e.candidate.target}: ${e.total.toFixed(2)} s, ${e.candidate.walls.length} walls`).join(' | '))
    expect(evaluated[0].candidate.target).toBe(1)
  })
})

describe('the squad planner as a whole', () => {
  const scenarios = [crowdScenario(3, 6), crowdScenario(4, 1), crowdedWallScenario(), walledDepotScenario(), sealedScenario()]

  it('with group behavior off matches the single-unit planner exactly', () => {
    for (const scenario of scenarios) {
      const solo = new World(scenario)
      solo.setPlanner('squad', { group: false })
      solo.run(600)
      const single = new World(scenario)
      single.setPlanner('timecost')
      single.run(600)
      expect(JSON.stringify([solo.events, solo.stats()])).toBe(JSON.stringify([single.events, single.stats()]))
    }
  })

  it('replays to identical events and stats', () => {
    for (const scenario of scenarios) {
      const a = new World(scenario)
      a.setPlanner('squad')
      a.run(600)
      const b = new World(scenario)
      b.setPlanner('squad')
      b.run(600)
      expect(a.finished).toBe(true)
      expect(JSON.stringify([a.events, a.stats()])).toBe(JSON.stringify([b.events, b.stats()]))
    }
  })

  it('beats or ties the single-unit planner on every group map and keeps plan changes low', () => {
    const rows: string[] = []
    for (const scenario of scenarios) {
      const squad = new World(scenario)
      squad.setPlanner('squad')
      squad.run(600)
      const single = new World(scenario)
      single.setPlanner('timecost')
      single.run(600)
      const changes = Math.max(...squad.troops.map((t) => t.planChanges))
      rows.push(`${scenario.name}: squad ${squad.finishTime!.toFixed(2)} s, time-cost ${single.finishTime!.toFixed(2)} s, most plan changes ${changes}`)
      expect(squad.finishTime!).toBeLessThanOrEqual(single.finishTime! * 1.02)
      expect(changes).toBeLessThanOrEqual(4)
    }
    console.log(rows.join('\n'))
  })
})

describe('plansFor shares one search across members standing on the same cell', () => {
  it('gives the exact same Plan object to every member that started on the same cell, a fresh one otherwise', () => {
    const world = new World(crowdScenario(3, 6))
    const planner = new SquadPlanner(world.grid, true)
    const squad = world.troops // all 6 on one cell
    const plans = planner.evaluate(world, squad)[0].plans
    const first = plans.get(squad[0].id)
    expect(first).not.toBeNull()
    for (const troop of squad) expect(plans.get(troop.id)).toBe(first) // same reference, not just equal content

    // Move one troop elsewhere and re-decide: it must not share the others' cached plan.
    const moved = new World(crowdScenario(3, 6))
    moved.troops[0].x = 2
    moved.troops[0].y = 2
    const movedPlanner = new SquadPlanner(moved.grid, true)
    const movedPlans = movedPlanner.evaluate(moved, moved.troops)[0].plans
    expect(movedPlans.get(moved.troops[0].id)).not.toBe(movedPlans.get(moved.troops[1].id))
    for (let i = 1; i < moved.troops.length; i++) expect(movedPlans.get(moved.troops[i].id)).toBe(movedPlans.get(moved.troops[1].id))
  })
})
