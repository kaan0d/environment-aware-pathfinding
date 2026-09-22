import { SCENARIOS } from '../scenarios'
import { randomScenario } from './randomScenario'
import type { Scenario } from './types'
import { World } from './world'

export const PLANNER_NAMES = ['classic', 'strong', 'squad'] as const
export type PlannerName = (typeof PLANNER_NAMES)[number]
export const PLANNER_LABEL: Record<PlannerName, string> = { classic: 'Classic', strong: 'Stronger classic', squad: 'Squad' }

export interface CompareRow {
  map: string
  finishTimes: Record<PlannerName, number | null> // null: did not finish within MAX_SECONDS
}

export interface CompareSummary {
  planner: PlannerName
  mean: number // seconds, over maps that planner finished
  worst: number
  finished: number
  total: number
}

const MAX_SECONDS = 400

function finishOne(scenario: Scenario, planner: PlannerName): number | null {
  const world = new World(scenario)
  world.setPlanner(planner, { group: true }) // group is ignored by 'classic' and 'strong'
  world.run(MAX_SECONDS)
  return world.finishTime
}

// Runs the 9 named scenarios plus `randomCount` random maps through every planner in PLANNER_NAMES.
export function compareAll(randomCount = 50): CompareRow[] {
  const maps: { name: string; scenario: Scenario }[] = SCENARIOS.map((s) => ({ name: s.name, scenario: s.scenario }))
  for (let seed = 1; maps.length < SCENARIOS.length + randomCount; seed++) {
    const scenario = randomScenario(seed)
    if (scenario !== null) maps.push({ name: scenario.name, scenario })
  }
  return maps.map(({ name, scenario }) => ({
    map: name,
    finishTimes: Object.fromEntries(PLANNER_NAMES.map((p) => [p, finishOne(scenario, p)])) as CompareRow['finishTimes'],
  }))
}

// Mean and worst-case finish time per planner, over the maps that planner actually finished - a planner that
// times out on a map neither wins nor loses on it, it just is not counted for that map.
export function summarize(rows: CompareRow[]): CompareSummary[] {
  return PLANNER_NAMES.map((planner) => {
    const times = rows.map((r) => r.finishTimes[planner]).filter((t): t is number => t !== null)
    return {
      planner,
      mean: times.length === 0 ? NaN : times.reduce((a, b) => a + b, 0) / times.length,
      worst: times.length === 0 ? NaN : Math.max(...times),
      finished: times.length,
      total: rows.length,
    }
  })
}
