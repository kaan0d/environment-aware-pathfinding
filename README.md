# environment-aware pathfinding

Pathfinding that treats the environment as a decision input, not a fixed obstacle map: breaking, crossing or walking around a wall is compared by real time cost. Demo case: units in Clash-of-Clans-like games walk around a cheap wall instead of breaking it.

Stack: TypeScript (strict), Vite, Vitest. Render layer (PixiJS) arrives in Stage 4.

## Status

| Stage | What | State |
|---|---|---|
| 1 | Deterministic sim core and classic AI | done |
| 2 | Time-cost single-unit planner | done |
| 3 | Squad planner | - |
| 4 | Two-panel render | - |
| 5 | Editor and scenarios | - |
| 6 | Polish, debug, deploy | - |

## Usage

```
npm install
npm test        # vitest, 31 tests
npm run build   # tsc --noEmit + vite build
npm run bench   # flow field timing
```

```ts
import { World } from './src/sim/world'
import { runComparison } from './src/sim/compare'

const world = new World(scenario)     // Scenario: walls, buildings, deployments
world.setPlanner('timecost')          // 'classic' is the default
world.run(600)                        // or: while (!world.finished) world.step(), dt = 1/30 s
world.events                          // deploy, wallDestroyed, buildingDestroyed, troopFinished
world.stats()                         // finish time, distance, walls and buildings destroyed
world.forcePlan(troopId, plan)        // override a troop's plan
world.notifyMapChanged()              // call after editing the grid, lets troops re-plan

const { classic, timecost } = runComparison(scenario) // two finished Worlds, same deploy events
```

## How the time-cost planner works

- Cost unit is seconds. Entering an empty cell costs `length * moveCost / speed`; a wall cell adds `wallHp / dps`. Buildings are never entered, they are approached.
- One multi-source reverse Dijkstra (`planner/flowField.ts`) starts from the free cells around every living building, valued at `buildingHp / dps`, and floods the map. Each cell ends up holding "seconds until this troop has destroyed its cheapest building", plus the next cell and the target building. The best target and route fall out of the same table. A route may cross wall cells; the troop breaks them in order.
- The field is computed per troop, because speed and dps are part of the cost. Cells another troop attacks from or heads to are not used as seeds, so troops spread over free attack positions; if none is left they share one.
- Re-planning: when a wall or building is destroyed (or `notifyMapChanged()` is called) every walking or waiting troop asks again. A troop that already started hitting something finishes it. A new plan is adopted only when it is at least 10% faster than what remains of the current one (`HYSTERESIS` in `config.ts`).
- Cell behavior still comes only from `environment.ts`; a test registers a slow "mud" kind and the planner and movement pick it up without any change.

## Results

Same L-corner map as Stage 1, one troop, time to destroy the depot behind the wall. Classic / time-cost, in seconds; `break` marks the runs where the time-cost planner hit the wall:

| wall level (hp) | fast (4 c/s, 20 dps) | balanced (2.5 c/s, 50 dps) | heavy (1.5 c/s, 150 dps) |
|---|---|---|---|
| 1 (100) | 23.50 / 21.10 break | 19.57 / 9.70 break | 24.57 / 5.37 break |
| 2 (250) | 23.50 / 23.50 | 19.57 / 12.67 break | 24.57 / 6.37 break |
| 3 (500) | 23.50 / 23.50 | 19.57 / 17.70 break | 24.57 / 8.03 break |
| 4 (1000) | 23.50 / 23.50 | 19.57 / 19.57 | 24.57 / 11.37 break |
| 5 (2000) | 23.50 / 23.50 | 19.57 / 19.57 | 24.57 / 18.03 break |

Other measurements:

- Prediction: `estTotalTime` against the real finish time, single unit, 9 runs (3 unit types x 3 wall levels): worst error 1.0%.
- Nearer depot behind level 5 walls vs a farther open depot: the time-cost planner destroys the open one first (12.87 s, classic reaches its first depot at 49.63 s). Total time for both depots is 68.20 s against classic's 65.83 s, because it picks greedily per target, not the best order.
- A wall broken by another troop: a fast troop that first chose the detour switches to the new hole, 8.83 s against classic's 24.50 s.
- Hysteresis: a route 4.6% faster is ignored, a route 23% faster is taken.
- Flow field, one compute over a map with 30% walls and 10 buildings: 0.58 ms mean on 40x28, 6.1 ms mean on 100x100 (Node 22, one machine).

## Limits

- One troop's point of view: no squad, no damage stacking, no attack-slot limit in the cost. Stage 3.
- Greedy per target: it picks the building with the least remaining time, not the order that minimizes the total.
- The field is recomputed per troop and per event; fine at this size, not yet cached.
- Attack positions are the 8 neighbors of a target's footprint.
