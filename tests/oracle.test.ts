import { describe, expect, it } from 'vitest'
import { SquadPlanner } from '../src/sim/planner/squadPlanner'
import { World } from '../src/sim/world'
import { eventTime, randomScenario, runFixedPlans } from './fixtures3'

interface Outcome {
  seed: number
  candidates: number
  chosenRatio: number // real time of the planner's pick over the real time of the best candidate
  chosenError: number // estimate against real time for the pick
  allErrors: number[]
}

// Runs every candidate plan of a random scenario in the real simulation and compares with the planner's estimate.
export function judge(seed: number, stack = false): Outcome | null {
  const scenario = randomScenario(seed, stack)
  if (scenario === null) return null
  const world = new World(scenario)
  for (const troop of world.troops) {
    troop.x = troop.spawnX + 0.5
    troop.y = troop.spawnY + 0.5
  }
  const evaluated = new SquadPlanner(world.grid, true).evaluate(world, world.troops)
  if (evaluated.length === 0) return null
  const actual = evaluated.map((entry) => {
    const run = runFixedPlans(scenario, (id) => entry.plans.get(id) ?? null, entry.candidate.target)
    const fell = run.events.some((e) => e.type === 'buildingDestroyed' && e.buildingId === entry.candidate.target)
    return fell ? eventTime(run, 'buildingDestroyed')! : Infinity
  })
  const finite = actual.filter(Number.isFinite)
  if (finite.length === 0 || !Number.isFinite(actual[0])) return null
  const errors = evaluated.map((entry, i) => (Number.isFinite(actual[i]) ? Math.abs(entry.total - actual[i]) / actual[i] : NaN)).filter((e) => !Number.isNaN(e))
  return { seed, candidates: evaluated.length, chosenRatio: actual[0] / Math.min(...finite), chosenError: errors[0], allErrors: errors }
}

// Both rules are checked: one attacker per position, and any number of attackers per cell.
describe.each([
  { name: 'one attacker per position', stack: false, minWithin: 198, worst: 1.1 },
  { name: 'attackers may stack', stack: true, minWithin: 199, worst: 1.05 },
])('oracle, $name: the planner against the real simulation', ({ stack, minWithin, worst: worstAllowed }) => {
  const outcomes: Outcome[] = []
  for (let seed = 1; outcomes.length < 200 && seed < 2000; seed++) {
    const outcome = judge(seed, stack)
    if (outcome !== null) outcomes.push(outcome)
  }

  it('covers at least 200 random scenarios', () => {
    expect(outcomes.length).toBeGreaterThanOrEqual(200)
  })

  // Almost every map within 5% of the best candidate, and no pick far behind.
  it('picks a candidate within 5% of the best real time', () => {
    const worst = outcomes.reduce((a, b) => (b.chosenRatio > a.chosenRatio ? b : a))
    const within = outcomes.filter((o) => o.chosenRatio <= 1.05).length
    console.log(`oracle (${stack ? 'stacking' : 'positions'}): ${outcomes.length} scenarios, ${within} within 5%, worst pick ${worst.chosenRatio.toFixed(3)} (seed ${worst.seed})`)
    expect(within).toBeGreaterThanOrEqual(minWithin)
    expect(worst.chosenRatio).toBeLessThanOrEqual(worstAllowed)
  })

  it('estimates the real time with a mean error under 10%', () => {
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
    const picked = mean(outcomes.map((o) => o.chosenError))
    const all = mean(outcomes.flatMap((o) => o.allErrors))
    console.log(`estimate error (${stack ? 'stacking' : 'positions'}): pick ${(picked * 100).toFixed(1)}%, all candidates ${(all * 100).toFixed(1)}%`)
    expect(picked).toBeLessThan(0.1)
  })
})
