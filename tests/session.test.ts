import { describe, expect, it } from 'vitest'
import { L_CORNER } from '../src/scenarios'
import { Session } from '../src/ui/session'

const fingerprint = (session: Session) =>
  JSON.stringify([session.classic.events, session.fresh.events, session.classic.stats(), session.fresh.stats()])

function runWithFrames(frames: number[]): Session {
  const session = new Session(L_CORNER)
  for (let i = 0; !session.finished && i < 100000; i++) session.advance(frames[i % frames.length])
  return session
}

describe('Session', () => {
  it('gives the same result whatever the frame rate is', () => {
    const smooth = runWithFrames([1 / 60])
    const choppy = runWithFrames([0.2, 0.013, 0.1, 0.05])
    expect(smooth.finished).toBe(true)
    expect(fingerprint(choppy)).toBe(fingerprint(smooth))
  })

  it('replays exactly after a reset', () => {
    const session = runWithFrames([1 / 30])
    const first = fingerprint(session)
    session.reset()
    expect(session.time).toBe(0)
    for (let i = 0; !session.finished && i < 100000; i++) session.advance(1 / 45)
    expect(fingerprint(session)).toBe(first)
  })

  it('clips a very long frame instead of running a burst of steps', () => {
    const session = new Session(L_CORNER)
    session.advance(60)
    expect(session.time).toBeLessThanOrEqual(0.25 + 1 / 30)
  })

  it('scales simulated time with the speed and stops while paused', () => {
    const session = new Session(L_CORNER)
    session.speed = 4
    session.advance(0.1)
    const fast = session.time
    session.reset()
    session.speed = 1
    session.advance(0.1)
    expect(fast).toBeGreaterThan(session.time * 3)
    session.playing = false
    const before = session.time
    session.advance(0.2)
    expect(session.time).toBe(before)
  })

  it('reports the new algorithm as faster on the L corner', () => {
    const summary = runWithFrames([1 / 60]).summary()!
    expect(summary.winner).toBe('fresh')
    expect(summary.difference).toBeGreaterThan(0)
    expect(summary.percent).toBeGreaterThan(20)
  })
})

describe('Session deploys', () => {
  it('drops troops into both worlds at the same time and replays them after a reset', () => {
    const session = new Session({ ...L_CORNER, deployments: [] })
    session.advance(1)
    session.deployAt([{ x: 12, y: 8 }, { x: 12, y: 9 }], 'balanced')
    expect(session.classic.troops.length).toBe(2)
    expect(session.fresh.troops.length).toBe(2)
    expect(session.classic.troops[0].spawnTime).toBe(session.fresh.troops[0].spawnTime)
    expect(session.scenario.deployments.length).toBe(2)
    for (let i = 0; !session.finished && i < 100000; i++) session.advance(1 / 40)
    const first = fingerprint(session)
    session.reset()
    for (let i = 0; !session.finished && i < 100000; i++) session.advance(1 / 60)
    expect(fingerprint(session)).toBe(first)
  })

  it('refuses cells that are solid in either world and clears units on request', () => {
    const session = new Session(L_CORNER)
    expect(session.canDeploy(20, 3)).toBe(false) // wall
    expect(session.canDeploy(26, 6)).toBe(false) // depot
    expect(session.canDeploy(-1, 3)).toBe(false)
    expect(session.canDeploy(12, 8)).toBe(true)
    session.clearUnits()
    expect(session.classic.troops.length).toBe(0)
    expect(session.scenario.deployments).toEqual([])
  })

  it('keeps the caller scenario untouched', () => {
    const before = JSON.stringify(L_CORNER)
    const session = new Session(L_CORNER)
    session.deployAt([{ x: 12, y: 8 }], 'fast')
    expect(JSON.stringify(L_CORNER)).toBe(before)
  })

  it('plans per troop when group behavior is off', () => {
    const session = new Session(L_CORNER)
    session.groupBehavior = false
    session.reset()
    expect(session.fresh.planner.constructor.name).toBe('SquadPlanner')
    for (let i = 0; !session.finished && i < 100000; i++) session.advance(1 / 60)
    expect(session.finished).toBe(true)
  })
})

describe('Session settings', () => {
  it('uses changed unit parameters after a reset', async () => {
    const { TROOP_TYPES } = await import('../src/sim/config')
    const normal = runWithFrames([1 / 60]).fresh.finishTime!
    const original = TROOP_TYPES.balanced.speed
    try {
      TROOP_TYPES.balanced.speed = original * 2
      const quick = runWithFrames([1 / 60]).fresh.finishTime!
      expect(quick).toBeLessThan(normal)
    } finally {
      TROOP_TYPES.balanced.speed = original
    }
  })
})
