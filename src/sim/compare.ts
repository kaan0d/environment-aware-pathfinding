import type { Scenario } from './types'
import { World } from './world'

export interface Comparison {
  classic: World
  timecost: World
}

// Runs the same scenario and deploy events under both planners; each World holds its own events and stats().
export function runComparison(scenario: Scenario, maxSeconds = 600, seed = 1): Comparison {
  const classic = new World(scenario, seed)
  const timecost = new World(scenario, seed)
  timecost.setPlanner('timecost')
  classic.run(maxSeconds)
  timecost.run(maxSeconds)
  return { classic, timecost }
}
