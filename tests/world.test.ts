import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/sim/rng'
import { World } from '../src/sim/world'
import { lCornerDirectPlan, lCornerScenario, runToEnd, sealedScenario, singleSlotScenario } from './fixtures'

describe('determinism', () => {
  it('replays the same scenario to identical events and stats', () => {
    const scenario = {
      ...lCornerScenario(2),
      deployments: [
        { t: 0, troopType: 'fast', x: 5, y: 2, count: 2 },
        { t: 1, troopType: 'heavy', x: 5, y: 5 },
      ],
    }
    const a = runToEnd(new World(scenario))
    const b = runToEnd(new World(scenario))
    expect(a.finished).toBe(true)
    expect(JSON.stringify([a.events, a.stats()])).toBe(JSON.stringify([b.events, b.stats()]))
  })

  it('seeds the PRNG reproducibly', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('classic AI', () => {
  it('walks around a cheap wall while a direct hit would finish sooner', () => {
    const classic = runToEnd(new World(lCornerScenario(1)))

    const forced = new World(lCornerScenario(1))
    forced.forcePlan(0, lCornerDirectPlan())
    runToEnd(forced)

    console.log(
      `L corner: classic detour ${classic.finishTime!.toFixed(2)} s, ` +
        `direct wall hit ${forced.finishTime!.toFixed(2)} s`,
    )
    expect(classic.stats().wallsDestroyed).toBe(0)
    expect(forced.stats().wallsDestroyed).toBe(1)
    expect(forced.finishTime!).toBeLessThan(classic.finishTime! * 0.75)
  })

  it('hits the wall closest to the building when no path exists, then finishes', () => {
    const world = runToEnd(new World(sealedScenario()))
    const firstWall = world.events.find((e) => e.type === 'wallDestroyed')
    expect(world.finished).toBe(true)
    expect(firstWall).toBeDefined()
    const cell = (firstWall as { cell: number }).cell
    const distToDepot = Math.hypot((cell % 12) - 8, Math.floor(cell / 12) - 5)
    expect(distToDepot).toBe(1) // orthogonal neighbor beats the diagonals
  })

  it('lets one attacker per slot and resumes the waiting troops when the target dies', () => {
    const world = new World(singleSlotScenario())
    let sawWaiting = false
    while (!world.finished && world.time < 200) {
      world.step()
      const onFirstDepot = world.troops.filter((t) => t.attackKind === 'building' && t.attackId === 0)
      const attackers = onFirstDepot.filter((t) => t.state === 'attacking')
      expect(attackers.length).toBeLessThanOrEqual(1)
      if (onFirstDepot.some((t) => t.state === 'waiting')) sawWaiting = true
    }
    expect(sawWaiting).toBe(true)
    expect(world.finished).toBe(true)
    expect(world.stats().buildingsDestroyed).toBe(2)
    expect(world.troops.every((t) => t.state === 'done')).toBe(true)
  })

  it('rejects scenarios with unknown types or blocked deploy points', () => {
    expect(() => new World({ ...lCornerScenario(), buildings: [{ type: 'nope', x: 10, y: 2 }] })).toThrow(/building type/)
    expect(() => new World({ ...lCornerScenario(), deployments: [{ t: 0, troopType: 'fast', x: 8, y: 0 }] })).toThrow(/deploy point/)
  })
})
