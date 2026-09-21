import { it } from 'vitest'
import { BUILDING_TYPES } from '../src/sim/config'
import { mulberry32 } from '../src/sim/rng'
import type { Scenario, WallLevel } from '../src/sim/types'
import type { SquadPlanner } from '../src/sim/planner/squadPlanner'
import { World } from '../src/sim/world'

// 40x28 map, about 20% walls of random level, six buildings, ten groups of five troops spread far enough apart to stay separate squads.
function crowdedMap(seed: number): Scenario {
  const random = mulberry32(seed)
  const width = 40
  const height = 28
  const spawns = Array.from({ length: 10 }, (_, i) => ({ x: 2 + (i % 5) * 8, y: i < 5 ? 3 : 23 }))
  const keep = new Set(spawns.map((s) => `${s.x},${s.y}`))
  const buildings: Scenario['buildings'] = []
  const types = Object.keys(BUILDING_TYPES)
  const taken = new Set<string>()
  for (let tries = 0; buildings.length < 6 && tries < 200; tries++) {
    const type = types[buildings.length % types.length]
    const size = BUILDING_TYPES[type].w
    const x = 4 + Math.floor(random() * (width - 8))
    const y = 8 + Math.floor(random() * (height - 16))
    const cells = Array.from({ length: size * size }, (_, i) => `${x + (i % size)},${y + Math.floor(i / size)}`)
    if (cells.some((c) => taken.has(c) || keep.has(c))) continue
    cells.forEach((c) => taken.add(c))
    buildings.push({ type, x, y })
  }
  const walls: Scenario['walls'] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`
      if (!taken.has(key) && !keep.has(key) && random() < 0.2) walls.push({ x, y, level: (1 + Math.floor(random() * 5)) as WallLevel })
    }
  }
  const types3 = ['fast', 'balanced', 'heavy']
  return {
    name: 'crowded map',
    width,
    height,
    walls,
    buildings,
    spawns,
    deployments: spawns.map((s, i) => ({ t: 0, troopType: types3[i % 3], x: s.x, y: s.y, count: 5 })),
  }
}

// One notifyMapChanged() makes every squad decide again: fields for up to six candidates, six rollouts, member plans.
it('full squad planning round', () => {
  const world = new World(crowdedMap(11))
  world.setPlanner('squad')
  world.step()
  const planner = world.planner as SquadPlanner
  for (let i = 0; i < 20; i++) world.notifyMapChanged()
  const times: number[] = []
  for (let i = 0; i < 200; i++) {
    const start = performance.now()
    world.notifyMapChanged()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  console.log(
    `squad planning, 40x28, 10 squads, 50 troops: mean ${mean.toFixed(2)} ms, median ${times[100].toFixed(2)} ms, max ${times[199].toFixed(2)} ms per round, ` +
      `last single squad ${planner.lastPlanMs.toFixed(2)} ms (200 rounds)`,
  )
})
